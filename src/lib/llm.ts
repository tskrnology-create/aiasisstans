// Yapay zekâ sağlayıcı katmanı (yalnızca sunucuda kullanılır).
// Öncelik: GEMINI_API_KEY varsa Gemini, yoksa OPENAI_API_KEY varsa OpenAI.
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

export type Provider = "gemini" | "openai";

const TIMEOUT_MS = 45_000;

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

export function getProvider(): Provider | null {
  if (geminiKey()) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function generateJson(messages: ChatMessage[]): Promise<LlmResult> {
  const provider = getProvider();
  try {
    if (provider === "gemini") return await callGemini(messages);
    if (provider === "openai") return await callOpenAI(messages);
    return {
      ok: false,
      message: "Yapay zekâ servisi henüz yapılandırılmadı (GEMINI_API_KEY).",
    };
  } catch (err) {
    console.error("LLM çağrısı başarısız:", err instanceof Error ? err.name : "bilinmeyen");
    return { ok: false, message: "Yapay zekâ servisine ulaşılamadı, tekrar deneyin." };
  }
}

// ---------------------------------------------------------------- Gemini

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Geçici hatalarda (503 vb.) aynı modeli bir kez daha, sonra yedek modeli dener.
async function callGemini(messages: ChatMessage[]): Promise<LlmResult> {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
  const attempts = fallback !== primary ? [primary, primary, fallback] : [primary, primary];
  const started = Date.now();
  let last: LlmResult = { ok: false, message: "Yapay zekâ servisine ulaşılamadı, tekrar deneyin." };

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) {
      if (Date.now() - started > 35_000) break; // toplam süre bütçesi
      await sleep(i === 1 ? 1500 : 500);
    }
    const model = attempts[i];
    if (i === 1 && last.ok === false && last.modelProblem) continue; // aynı bozuk modeli tekrar deneme
    let r: LlmResult;
    try {
      r = await callGeminiOnce(messages, model);
    } catch (err) {
      console.error("Gemini bağlantı hatası:", model, err instanceof Error ? err.name : "bilinmeyen");
      r = { ok: false, retryable: true, message: "Yapay zekâ servisine ulaşılamadı, tekrar deneyin." };
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

async function callGeminiOnce(messages: ChatMessage[], model: string): Promise<LlmResult> {
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
        },
      }),
      signal: AbortSignal.timeout(20_000),
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

// ---------------------------------------------------------------- OpenAI

async function callOpenAI(messages: ChatMessage[]): Promise<LlmResult> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    let code = "";
    try {
      const e = await res.json();
      code = e?.error?.code ?? e?.error?.type ?? "";
    } catch {
      /* gövde okunamadı */
    }
    console.error("OpenAI hata:", res.status, code);
    if (res.status === 401) {
      return { ok: false, message: "OpenAI anahtarı geçersiz. OPENAI_API_KEY değerini kontrol edin." };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message:
          code === "insufficient_quota"
            ? "OpenAI hesabında kredi yok. Billing bölümünden kredi yükleyin."
            : "OpenAI istek sınırına takıldı, biraz sonra tekrar deneyin.",
      };
    }
    return { ok: false, message: `OpenAI isteği reddetti (${res.status}). Model: ${model}.` };
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  if (!text) return { ok: false, message: "Yapay zekâ boş yanıt döndürdü, tekrar deneyin." };
  return { ok: true, text };
}
