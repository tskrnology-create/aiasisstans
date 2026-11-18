// Yapay zekâ sağlayıcı katmanı (yalnızca sunucuda kullanılır).
// Öncelik: GEMINI_API_KEY varsa Gemini, yoksa OPENAI_API_KEY varsa OpenAI.
// Anahtarlar hiçbir zaman loglanmaz ve tarayıcıya gönderilmez.

import type { ChatMessage } from "./brand-prompt";

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

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

async function callGemini(messages: ChatMessage[]): Promise<LlmResult> {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
        message: `Gemini modeli bulunamadı (${model}). Vercel'e geçerli bir GEMINI_MODEL değeri ekleyin.`,
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
