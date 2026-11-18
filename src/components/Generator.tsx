"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { TONES, type Tone } from "@/lib/tones";

interface GeneratedRow {
  id: string;
  tone: string | null;
  post_text: string | null;
  caption: string | null;
  hashtags: string[];
  ad_text: string | null;
  story_text: string | null;
}

const MAX_PROMPT_LEN = 500;

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{label}</h4>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* panoya erişilemezse sessizce geç */
            }
          }}
          className="text-xs underline underline-offset-4"
        >
          {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
        {text}
      </p>
    </div>
  );
}

function ResultCard({ row }: { row: GeneratedRow }) {
  return (
    <article className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {row.tone ? `Ton: ${row.tone}` : "Marka diline göre"}
      </p>
      <CopyBlock label="Gönderi metni" text={row.post_text ?? ""} />
      <CopyBlock label="Açıklama (caption)" text={row.caption ?? ""} />
      <CopyBlock label="Hashtag önerileri" text={row.hashtags.join(" ")} />
      <CopyBlock label="Reklam metni" text={row.ad_text ?? ""} />
      <CopyBlock label="Hikâye (story) metni" text={row.story_text ?? ""} />
    </article>
  );
}

export default function Generator() {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<Tone | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [main, setMain] = useState<GeneratedRow | null>(null);
  const [alternatives, setAlternatives] = useState<GeneratedRow[]>([]);

  async function generate(opts: { prompt: string; tone: Tone | ""; parentId?: string }) {
    setBusy(true);
    setError(null);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı, tekrar giriş yapın.");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: opts.prompt,
          tone: opts.tone || undefined,
          parentId: opts.parentId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Üretim başarısız oldu.");
      const row = body.content as GeneratedRow;
      if (opts.parentId) {
        setAlternatives((a) => [row, ...a]);
      } else {
        setMain(row);
        setAlternatives([]);
        setLastPrompt(opts.prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      setError("Lütfen ne üretmek istediğinizi yazın.");
      return;
    }
    generate({ prompt: trimmed, tone });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium">Ne üretelim?</label>
        <textarea
          className={inputClass}
          rows={4}
          maxLength={MAX_PROMPT_LEN}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Örn. Kasım ayına özel güzellik merkezimiz için indirim kampanyası oluştur."
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={inputClass + " max-w-[12rem]"}
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone | "")}
            aria-label="Ton"
          >
            <option value="">Marka diline göre</option>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Üretiliyor…" : "İçerik üret"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {main && (
        <section className="space-y-4">
          <ResultCard row={main} />

          <div className="space-y-2">
            <p className="text-sm font-medium">Başka tonda dene</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={busy || !lastPrompt}
                  onClick={() =>
                    generate({ prompt: lastPrompt!, tone: t, parentId: main.id })
                  }
                  className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {alternatives.map((alt) => (
            <ResultCard key={alt.id} row={alt} />
          ))}
        </section>
      )}
    </div>
  );
}
