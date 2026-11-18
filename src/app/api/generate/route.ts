// İçerik üretim uç noktası.
// Güvenlik ilkeleri:
//  - OpenAI anahtarı yalnızca sunucuda (OPENAI_API_KEY), tarayıcıya gitmez.
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

const MAX_PROMPT_LEN = 500;
const HOURLY_LIMIT = 30;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !anonKey) return json({ error: "Sunucu ayarları eksik." }, 500);
  if (!openaiKey) {
    return json(
      { error: "Yapay zekâ servisi henüz yapılandırılmadı (OPENAI_API_KEY)." },
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

  // 5) OpenAI çağrısı
  const messages = buildGenerateMessages(profile, { userPrompt: prompt, tone });
  let raw: string;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      // Yalnızca durum ve hata kodu kaydedilir; istek/anahtar loglanmaz.
      let code = "";
      try {
        const e = await res.json();
        code = e?.error?.code ?? e?.error?.type ?? "";
      } catch {
        /* gövde okunamadı */
      }
      console.error("OpenAI hata:", res.status, code);
      if (res.status === 401) {
        return json(
          { error: "OpenAI anahtarı geçersiz. Vercel'deki OPENAI_API_KEY değerini kontrol edin." },
          502
        );
      }
      if (res.status === 429) {
        if (code === "insufficient_quota") {
          return json(
            { error: "OpenAI hesabında kredi yok. platform.openai.com'da Billing bölümünden kredi yükleyin." },
            502
          );
        }
        return json({ error: "OpenAI istek sınırına takıldı, biraz sonra tekrar deneyin." }, 502);
      }
      if (res.status === 400 || res.status === 403 || res.status === 404) {
        return json(
          { error: `OpenAI isteği reddetti (${res.status}${code ? ", " + code : ""}). Model: ${model}. OPENAI_MODEL ayarını kontrol edin.` },
          502
        );
      }
      return json({ error: `Yapay zekâ servisi hata verdi (${res.status}), tekrar deneyin.` }, 502);
    }
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("OpenAI çağrısı başarısız:", err instanceof Error ? err.name : "bilinmeyen");
    return json({ error: "Yapay zekâ servisine ulaşılamadı, tekrar deneyin." }, 502);
  }

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
