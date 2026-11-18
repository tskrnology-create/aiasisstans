"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { businessStore, type StoredBusiness } from "@/lib/business-store";
import { STATUS_LABEL, type ContentRow } from "@/lib/library-utils";
import {
  FORMATS,
  TEMPLATES,
  drawVisual,
  resolvePalette,
  type FormatId,
  type TemplateId,
} from "@/lib/visual-templates";

type TextSource = "post_text" | "ad_text" | "story_text" | "caption";
type Style = "photo" | "illustration" | "abstract";

const SOURCE_LABEL: Record<TextSource, string> = {
  post_text: "Gönderi metni",
  ad_text: "Reklam metni",
  story_text: "Hikâye metni",
  caption: "Açıklama (caption)",
};
const STYLE_LABEL: Record<Style, string> = {
  photo: "Fotoğraf",
  illustration: "İllüstrasyon",
  abstract: "Soyut / minimal",
};

const MAX_HEADLINE = 160;
const MAX_SUBLINE = 120;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";
const smallBtn =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 " +
  "disabled:opacity-50 dark:border-neutral-700";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

// Metni görsele uygun kısa bir başlığa çevirir (fazla boşlukları temizler).
function toHeadline(text: string | null): string {
  return (text ?? "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_HEADLINE);
}

export default function VisualCreator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [biz, setBiz] = useState<StoredBusiness | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [contentId, setContentId] = useState("");
  const [source, setSource] = useState<TextSource>("post_text");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [format, setFormat] = useState<FormatId>("post");
  const [template, setTemplate] = useState<TemplateId>("gradyan");
  const [style, setStyle] = useState<Style>("photo");

  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Profil ve içerikler
  useEffect(() => {
    Promise.all([
      businessStore.get(),
      getSupabase()
        .from("contents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ])
      .then(([b, c]) => {
        setBiz(b);
        if (c.error) setLoadError("İçerikler yüklenemedi: " + c.error.message);
        else setContents((c.data ?? []) as ContentRow[]);
      })
      .catch((err: Error) => setLoadError("Yüklenemedi: " + err.message))
      .finally(() => setLoading(false));
  }, []);

  // Logo
  useEffect(() => {
    const src = biz?.logo_data_url;
    if (!src) return;
    let cancelled = false;
    loadImage(src)
      .then((img) => {
        if (!cancelled) setLogo(img);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [biz?.logo_data_url]);

  // Canlı önizleme
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const f = FORMATS[format];
    canvas.width = f.width;
    canvas.height = f.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawVisual(ctx, {
      width: f.width,
      height: f.height,
      template,
      headline,
      subline,
      brandName: biz?.name ?? "",
      colors: biz?.brand_colors ?? [],
      logo: logo && biz?.logo_data_url ? logo : null,
      logoSize: logo ? { w: logo.naturalWidth, h: logo.naturalHeight } : undefined,
      background,
      backgroundSize: background
        ? { w: background.naturalWidth, h: background.naturalHeight }
        : undefined,
    });
  }, [biz, logo, background, template, format, headline, subline, loading]);

  const selected = contents.find((c) => c.id === contentId) ?? null;

  function pickContent(id: string, src: TextSource = source) {
    setContentId(id);
    const c = contents.find((x) => x.id === id);
    if (c) setHeadline(toHeadline(c[src]));
  }

  async function generateBackground() {
    setError(null);
    setNotice(null);
    const topic = (selected?.prompt || headline).trim();
    if (topic.length < 3) {
      setError("Önce bir içerik seçin veya görseldeki yazıyı girin.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı, tekrar giriş yapın.");
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: topic.slice(0, 300), style, format }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Görsel üretilemedi.");
      const img = await loadImage(body.image as string);
      setBackground(img);
      setTemplate("fotograf");
      setNotice("Arka plan hazır. Yazıyı ve şablonu değiştirebilirsiniz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Fotoğraf PNG, JPG veya WebP olmalı.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Fotoğraf 4 MB'den küçük olmalı.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      loadImage(reader.result as string)
        .then((img) => {
          setBackground(img);
          setTemplate("fotograf");
        })
        .catch(() => setError("Fotoğraf okunamadı."));
    };
    reader.readAsDataURL(file);
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Görsel oluşturulamadı.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gorsel-${format}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (loading) return <p className="text-sm text-neutral-500">Yükleniyor…</p>;

  if (!biz) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Görsel oluşturmak için önce{" "}
        <Link href="/" className="font-medium underline underline-offset-4">
          işletme profilinizi kaydedin →
        </Link>
      </p>
    );
  }

  const palette = resolvePalette(biz.brand_colors);

  return (
    <div className="space-y-8">
      {loadError && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>
      )}

      <section className="space-y-3">
        <canvas
          ref={canvasRef}
          aria-label="Görsel önizleme"
          className="mx-auto h-auto w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} className={smallBtn}>
            PNG olarak indir
          </button>
          <span className="self-center text-xs text-neutral-500">
            Marka renkleri:
            <span className="ml-1 inline-flex gap-1 align-middle">
              {[palette.primary, palette.secondary].map((c) => (
                <span
                  key={c}
                  className="inline-block h-3.5 w-3.5 rounded-full border border-neutral-300"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </span>
          </span>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. İçerik ve yazı</h2>
        {contents.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Henüz içeriğiniz yok.{" "}
            <Link href="/uret" className="font-medium underline underline-offset-4">
              Önce içerik üretin →
            </Link>{" "}
            Dilerseniz yazıyı aşağıya kendiniz de girebilirsiniz.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <select
              className={inputClass + " flex-1"}
              value={contentId}
              onChange={(e) => pickContent(e.target.value)}
              aria-label="İçerik"
            >
              <option value="">İçerik seçin…</option>
              {contents.map((c) => (
                <option key={c.id} value={c.id}>
                  [{STATUS_LABEL[c.status]}] {c.prompt.slice(0, 60)}
                  {c.tone ? ` · ${c.tone}` : ""}
                </option>
              ))}
            </select>
            <select
              className={inputClass + " max-w-[11rem]"}
              value={source}
              onChange={(e) => {
                const s = e.target.value as TextSource;
                setSource(s);
                if (contentId) pickContent(contentId, s);
              }}
              aria-label="Yazı kaynağı"
            >
              {(Object.keys(SOURCE_LABEL) as TextSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Görseldeki yazı</span>
          <textarea
            className={inputClass}
            rows={3}
            maxLength={MAX_HEADLINE}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Örn. Kasım'a özel %20 indirim"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Alt yazı (isteğe bağlı)</span>
          <input
            className={inputClass}
            maxLength={MAX_SUBLINE}
            value={subline}
            onChange={(e) => setSubline(e.target.value)}
            placeholder="Örn. 30 Kasım'a kadar geçerli"
          />
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">2. Format ve şablon</h2>
        <select
          className={inputClass}
          value={format}
          onChange={(e) => setFormat(e.target.value as FormatId)}
          aria-label="Format"
        >
          {(Object.keys(FORMATS) as FormatId[]).map((f) => (
            <option key={f} value={f}>
              {FORMATS[f].label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Şablon">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={template === t.id}
              onClick={() => setTemplate(t.id)}
              className={
                smallBtn +
                (template === t.id ? " bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {template === "fotograf" && !background && (
          <p className="text-xs text-neutral-500">
            &quot;Fotoğraflı&quot; şablon için aşağıdan bir arka plan ekleyin; eklenene kadar gradyan
            gösterilir.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">3. Arka plan (isteğe bağlı)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={inputClass + " max-w-[12rem]"}
            value={style}
            onChange={(e) => setStyle(e.target.value as Style)}
            aria-label="Görsel stili"
          >
            {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
              <option key={s} value={s}>
                {STYLE_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={generateBackground} className={smallBtn}>
            {busy ? "Üretiliyor…" : "Yapay zekâyla arka plan üret"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className={smallBtn + " cursor-pointer"}>
            Fotoğraf yükle
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} className="sr-only" />
          </label>
          {background && (
            <button
              type="button"
              onClick={() => {
                setBackground(null);
                setNotice(null);
              }}
              className={smallBtn}
            >
              Arka planı kaldır
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <p className="text-xs text-neutral-500">
          Yapay zekâ yalnızca yazısız arka plan üretir; yazı, logo ve renkler şablonla eklenir. Üretilen
          görseller, üretici tarafından görünmez bir işaretle (SynthID) etiketlenebilir. Arka plan ve
          görsel şimdilik kaydedilmez, beğendiğiniz görseli indirin.
        </p>
      </section>
    </div>
  );
}
