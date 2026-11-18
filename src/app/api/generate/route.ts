// İçerik üretim uç noktası.
// Güvenlik ilkeleri:
//  - Yapay zekâ anahtarı (GEMINI_API_KEY veya OPENAI_API_KEY) yalnızca sunucuda durur.
//  - Kullanıcının oturum belirteci ile Supabase'e bağlanılır; böylece RLS geçerli
//    kalır ve kullanıcı yalnızca kendi işletmesinin profilini okuyabilir.
//  - Saatlik üretim limiti vardır (maliyet kontrolü).
//  - Kullanıcı girdisi uzunluk ve ton listesiyle sınırlandırılır.

import { createClient } from "@supabase/supabase-js";
import {
  buildGenerateMessages,
  parseGeneratedContent,
  type BusinessProfile,
} from "@/lib/brand-prompt";
import { isTone } from "@/lib/tones";
import { generateJson, getProvider } from "@/lib/llm";

// Yeniden denemeler dahil üretim 60 sn'ye kadar sürebilir.
export const maxDuration = 60;

const MAX_PROMPT_LEN = 500;
const HOURLY_LIMIT = 30;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return json({ error: "Sunucu ayarları eksik." }, 500);
  if (!getProvider()) {
    return json(
      { error: "Yapay zekâ servisi henüz yapılandırılmadı (GEMINI_API_KEY)." },
      503
    );
  }

  // 1) Oturum
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Giriş yapmanız gerekiyor." }, 401);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: "Oturum geçersiz, tekrar giriş yapın." }, 401);
  }

  // 2) Girdi doğrulama
  let body: { prompt?: unknown; tone?: unknown; parentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) return json({ error: "Lütfen ne üretmek istediğinizi yazın." }, 400);
  if (prompt.length > MAX_PROMPT_LEN) {
    return json({ error: `İstek en fazla ${MAX_PROMPT_LEN} karakter olabilir.` }, 400);
  }
  let tone: string | undefined;
  if (body.tone !== undefined && body.tone !== null && body.tone !== "") {
    if (!isTone(body.tone)) return json({ error: "Geçersiz ton." }, 400);
    tone = body.tone;
  }
  const parentId = typeof body.parentId === "string" ? body.parentId : null;

  // 3) İşletme profili (RLS: yalnızca kendi kaydı döner)
  const { data: row, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (bizError) return json({ error: "Profil okunamadı." }, 500);
  if (!row) return json({ error: "Önce işletme profilinizi kaydedin." }, 400);

  const profile: BusinessProfile = {
    name: row.name,
    industry: row.industry,
    products: row.products,
    target_audience: row.target_audience,
    brand_voice: row.brand_voice,
    brand_colors: row.brand_colors ?? [],
    content_language: row.content_language,
  };

  // 4) Saatlik limit
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("business_id", row.id)
    .gte("created_at", since);
  if (countError) return json({ error: "Limit kontrol edilemedi." }, 500);
  if ((count ?? 0) >= HOURLY_LIMIT) {
    return json(
      { error: `Saatlik üretim sınırına (${HOURLY_LIMIT}) ulaştınız. Biraz sonra tekrar deneyin.` },
      429
    );
  }

  // 5) Yapay zekâ çağrısı
  const messages = buildGenerateMessages(profile, { userPrompt: prompt, tone });
  const result = await generateJson(messages);
  if (!result.ok) return json({ error: result.message }, 502);
  const raw = result.text;

  let generated;
  try {
    generated = parseGeneratedContent(raw);
  } catch {
    return json({ error: "Üretilen içerik okunamadı, tekrar deneyin." }, 502);
  }
  generated.hashtags = generated.hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t.replace(/\s+/g, "")}`))
    .slice(0, 20);

  // 6) Kayıt (RLS + check_same_business tetikleyicisi geçerli)
  const { data: saved, error: saveError } = await supabase
    .from("contents")
    .insert({
      business_id: row.id,
      parent_id: parentId,
      prompt,
      tone: tone ?? null,
      language: row.content_language,
      post_text: generated.post_text,
      caption: generated.caption,
      hashtags: generated.hashtags,
      ad_text: generated.ad_text,
      story_text: generated.story_text,
      status: "draft",
    })
    .select("*")
    .single();
  if (saveError) {
    console.error("İçerik kaydedilemedi:", saveError.code);
    return json({ error: "İçerik kaydedilemedi." }, 500);
  }

  return json({ content: saved });
}
