// Yapay zekâ sağlayıcı katmanı (yalnızca sunucuda kullanılır).
// Sıra: Gemini (GEMINI_API_KEY) → DeepSeek (DEEPSEEK_API_KEY) → OpenAI (OPENAI_API_KEY).
// Biri başarısız olursa
// tanımlı olan sonraki sağlayıcı denenir.
// Anahtarlar hiçbir zaman loglanmaz ve tarayıcıya gönderilmez.

import type { ChatMessage } from "./brand-prompt";

export type LlmResult =
  | { ok: true; text: string }
  | {
      ok: false;
      message: string;
      retryable?: boolean; // geçici hata (yoğunluk, zaman aşımı): aynı modeli tekrar dene
      modelProblem?: boolean; // model bulunamadı: yedek modele geç
    };

export type Provider = "gemini" | "deepseek" | "openai";

const TIMEOUT_MS = 25_000; // tek çağrı üst sınırı
const TOTAL_BUDGET_MS = 55_000; // tüm sağlayıcılar dahil; Vercel maxDuration (60 sn) altında

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

export function getProviders(): Provider[] {
  const list: Provider[] = [];
  if (geminiKey()) list.push("gemini");
  if (process.env.DEEPSEEK_API_KEY) list.push("deepseek");
  if (process.env.OPENAI_API_KEY) list.push("openai");
  return list;
}

export function getProvider(): Provider | null {
  return getProviders()[0] ?? null;
}

const LABELS: Record<Provider, string> = { gemini: "Gemini", deepseek: "DeepSeek", openai: "OpenAI" };
const errName = (e: unknown) => (e instanceof Error ? e.name : "bilinmeyen");

export async function generateJson(messages: ChatMessage[]): Promise<LlmResult> {
  const providers = getProviders();
  if (providers.length === 0) {
    return {
      ok: false,
      message: "Yapay zekâ servisi henüz yapılandırılmadı (GEMINI_API_KEY).",
    };
  }

  const failures: string[] = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (const provider of providers) {
    if (failures.length > 0 && deadline - Date.now() < 3000) {
      failures.push("Süre doldu.");
      break;
    }
    let r: LlmResult;
    try {
      r =
        provider === "gemini"
          ? await callGemini(messages, deadline)
          : provider === "deepseek"
            ? await callDeepSeek(messages, deadline)
            : await callOpenAI(messages, deadline);
    } catch (err) {
      console.error("LLM çağrısı başarısız:", provider, err instanceof Error ? err.name : "bilinmeyen");
      r = { ok: false, message: `${LABELS[provider]}'ye ulaşılamadı (${errName(err)}).` };
    }
    if (r.ok) return r;
    failures.push(r.message);
  }
  return { ok: false, message: failures.join(" | ") };
}

// ---------------------------------------------------------------- Gemini

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Geçici hatalarda (503 vb.) aynı modeli bir kez daha, sonra yedek modeli dener.
async function callGemini(messages: ChatMessage[], deadline: number): Promise<LlmResult> {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
  const attempts = fallback !== primary ? [primary, primary, fallback] : [primary, primary];
  let last: LlmResult = { ok: false, message: "Gemini'ye ulaşılamadı." };

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) {
      if (deadline - Date.now() < 6000) break; // süre bütçesi
      await sleep(i === 1 ? 1000 : 500);
    }
    const model = attempts[i];
    if (i === 1 && last.ok === false && last.modelProblem) continue; // aynı bozuk modeli tekrar deneme
    let r: LlmResult;
    try {
      r = await callGeminiOnce(messages, model, deadline, true);
    } catch (err) {
      console.error("Gemini bağlantı hatası:", model, errName(err));
      r = { ok: false, retryable: true, message: `Gemini'ye ulaşılamadı (${errName(err)}, ${model}).` };
    }
    if (r.ok) return r;
    if (!last.ok && last.modelProblem && !r.modelProblem && !r.retryable) {
      // yedek modelden gelen kalıcı hata: ilk hatayı koru
    } else {
      last = r;
    }
    if (!r.retryable && !r.modelProblem) return r; // anahtar/izin hatası: tekrar denemenin anlamı yok
  }
  return last;
}

async function callGeminiOnce(
  messages: ChatMessage[],
  model: string,
  deadline: number,
  useThinking: boolean
): Promise<LlmResult> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const user = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey()!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.8,
          // Düşünme jetonları da bu sınıra sayıldığı için yüksek tutulur.
          maxOutputTokens: 8192,
          // Varsayılan düşünme seviyesi (medium) yavaş; kısa içerik için low yeterli.
          ...(useThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
      signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, Math.max(1000, deadline - Date.now()))),
    }
  );

  if (!res.ok) {
    let status = "";
    let reason = "";
    try {
      const e = await res.json();
      status = e?.error?.status ?? "";
      reason = e?.error?.details?.find?.((d: { reason?: string }) => d?.reason)?.reason ?? "";
    } catch {
      /* gövde okunamadı */
    }
    console.error("Gemini hata:", res.status, status, reason);

    // Model thinkingLevel'ı kabul etmezse ayarsız yeniden dene.
    if (res.status === 400 && useThinking && reason !== "API_KEY_INVALID") {
      return callGeminiOnce(messages, model, deadline, false);
    }

    if (reason === "API_KEY_INVALID" || res.status === 401) {
      return {
        ok: false,
        message: "Gemini anahtarı geçersiz. Vercel'deki GEMINI_API_KEY değerini kontrol edin.",
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        message: "Gemini anahtarı bu isteğe yetkili değil. AI Studio'da anahtarın ve projenin etkin olduğunu kontrol edin.",
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        modelProblem: true,
        message: `Gemini modeli bulunamadı (${model}). Vercel'e geçerli bir GEMINI_MODEL değeri ekleyin.`,
      };
    }
    if (res.status === 500 || res.status === 503 || res.status === 504) {
      return {
        ok: false,
        retryable: true,
        message: "Gemini şu an yoğun. Birkaç saniye sonra tekrar deneyin.",
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message: "Gemini kullanım sınırına ulaşıldı, biraz sonra tekrar deneyin.",
      };
    }
    return {
      ok: false,
      message: `Gemini isteği reddetti (${res.status}${status ? ", " + status : ""}). Model: ${model}.`,
    };
  }

  const data = await res.json();
  const parts: Array<{ text?: string; thought?: boolean }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text) {
    const block = data?.promptFeedback?.blockReason;
    const finish = data?.candidates?.[0]?.finishReason;
    console.error("Gemini boş yanıt:", block ?? "", finish ?? "");
    return {
      ok: false,
      message: block
        ? "İstek güvenlik filtresine takıldı, ifadeyi değiştirip tekrar deneyin."
        : "Yapay zekâ boş yanıt döndürdü, tekrar deneyin.",
    };
  }
  return { ok: true, text };
}

// ------------------------------------------- OpenAI uyumlu sağlayıcılar

interface ChatCompletionsConfig {
  label: string; // hata mesajlarında görünen ad
  url: string;
  apiKey: string;
  apiKeyName: string; // Vercel'deki değişken adı
  model: string;
  maxTokens: number;
}

async function callChatCompletions(
  messages: ChatMessage[],
  cfg: ChatCompletionsConfig,
  deadline: number
): Promise<LlmResult> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: cfg.maxTokens,
    }),
    signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, Math.max(1000, deadline - Date.now()))),
  });

  if (!res.ok) {
    let code = "";
    try {
      const e = await res.json();
      code = e?.error?.code ?? e?.error?.type ?? "";
    } catch {
      /* gövde okunamadı */
    }
    // Yalnızca durum ve hata kodu kaydedilir; istek/anahtar loglanmaz.
    console.error(`${cfg.label} hata:`, res.status, code);
    if (res.status === 401) {
      return {
        ok: false,
        message: `${cfg.label} anahtarı geçersiz. ${cfg.apiKeyName} değerini kontrol edin.`,
      };
    }
    if (res.status === 402 || (res.status === 429 && code === "insufficient_quota")) {
      return {
        ok: false,
        message: `${cfg.label} hesabında bakiye/kredi yok. Hesabınıza bakiye yükleyin.`,
      };
    }
    if (res.status === 429) {
      return { ok: false, message: `${cfg.label} istek sınırına takıldı, biraz sonra tekrar deneyin.` };
    }
    if (res.status === 500 || res.status === 503) {
      return { ok: false, message: `${cfg.label} şu an yoğun, biraz sonra tekrar deneyin.` };
    }
    return {
      ok: false,
      message: `${cfg.label} isteği reddetti (${res.status}). Model: ${cfg.model}.`,
    };
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    return { ok: false, message: `${cfg.label} boş yanıt döndürdü, tekrar deneyin.` };
  }
  return { ok: true, text };
}

function callOpenAI(messages: ChatMessage[], deadline: number): Promise<LlmResult> {
  return callChatCompletions(messages, {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: process.env.OPENAI_API_KEY!,
    apiKeyName: "OPENAI_API_KEY",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    maxTokens: 1200,
  }, deadline);
}

function callDeepSeek(messages: ChatMessage[], deadline: number): Promise<LlmResult> {
  return callChatCompletions(messages, {
    label: "DeepSeek",
    url: "https://api.deepseek.com/chat/completions",
    apiKey: process.env.DEEPSEEK_API_KEY!,
    apiKeyName: "DEEPSEEK_API_KEY",
    model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    // JSON yarıda kesilmesin diye geniş tutulur.
    maxTokens: 4096,
  }, deadline);
}
