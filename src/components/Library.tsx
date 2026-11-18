"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  STATUS_LABEL,
  contentToText,
  downloadName,
  matchesSearch,
  parseHashtags,
  type ContentRow,
  type ContentStatus,
} from "@/lib/library-utils";

const PAGE_LIMIT = 200;

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";

const smallBtn =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 " +
  "disabled:opacity-50 dark:border-neutral-700";

function downloadText(row: ContentRow) {
  const blob = new Blob([contentToText(row)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName(row);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const style =
    status === "approved"
      ? "bg-green-100 text-green-800"
      : status === "archived"
        ? "bg-neutral-200 text-neutral-700"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ItemCard({
  row,
  onUpdated,
  onDeleted,
}: {
  row: ContentRow;
  onUpdated: (row: ContentRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [postText, setPostText] = useState(row.post_text ?? "");
  const [caption, setCaption] = useState(row.caption ?? "");
  const [hashtags, setHashtags] = useState(row.hashtags.join(" "));
  const [adText, setAdText] = useState(row.ad_text ?? "");
  const [storyText, setStoryText] = useState(row.story_text ?? "");

  async function save(status: ContentStatus = row.status) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: err } = await getSupabase()
      .from("contents")
      .update({
        post_text: postText,
        caption,
        hashtags: parseHashtags(hashtags),
        ad_text: adText,
        story_text: storyText,
        status,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    setBusy(false);
    if (err || !data) {
      setError("Kaydedilemedi: " + (err?.message ?? "bilinmeyen hata"));
      return;
    }
    const updated = data as ContentRow;
    setHashtags(updated.hashtags.join(" "));
    onUpdated(updated);
    setNotice(status === row.status ? "Kaydedildi." : `Durum: ${STATUS_LABEL[status]}`);
  }

  async function remove() {
    if (!window.confirm("Bu içerik kalıcı olarak silinsin mi?")) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("contents").delete().eq("id", row.id);
    setBusy(false);
    if (err) {
      setError("Silinemedi: " + err.message);
      return;
    }
    onDeleted(row.id);
  }

  const date = new Date(row.created_at).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full space-y-2 text-left"
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <StatusBadge status={row.status} />
          <span>{date}</span>
          <span>· {row.tone ? `Ton: ${row.tone}` : "Marka diline göre"}</span>
          {row.parent_id && <span>· Alternatif</span>}
        </div>
        <p className="text-sm font-medium">{row.prompt}</p>
        {!open && row.post_text && (
          <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
            {row.post_text}
          </p>
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Gönderi metni</span>
            <textarea className={inputClass} rows={3} value={postText} onChange={(e) => setPostText(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Açıklama (caption)</span>
            <textarea className={inputClass} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Hashtag&apos;ler</span>
            <textarea className={inputClass} rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Reklam metni</span>
            <textarea className={inputClass} rows={3} value={adText} onChange={(e) => setAdText(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Hikâye (story) metni</span>
            <textarea className={inputClass} rows={3} value={storyText} onChange={(e) => setStoryText(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => save()} className={smallBtn}>
              Kaydet
            </button>
            {row.status === "approved" ? (
              <button type="button" disabled={busy} onClick={() => save("draft")} className={smallBtn}>
                Taslağa al
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => save("approved")} className={smallBtn}>
                Onayla
              </button>
            )}
            <button type="button" onClick={() => downloadText(row)} className={smallBtn}>
              İndir (.txt)
            </button>
            <Link href={`/uret?prompt=${encodeURIComponent(row.prompt)}`} className={smallBtn}>
              Yeniden kullan
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={smallBtn + " text-red-600"}
            >
              Sil
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}
        </div>
      )}
    </article>
  );
}

export default function Library() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContentStatus>("all");

  useEffect(() => {
    getSupabase()
      .from("contents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT)
      .then(({ data, error: err }) => {
        if (err) setError("İçerikler yüklenemedi: " + err.message);
        else setRows((data ?? []) as ContentRow[]);
        setLoading(false);
      });
  }, []);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) => (statusFilter === "all" || r.status === statusFilter) && matchesSearch(r, query)
      ),
    [rows, query, statusFilter]
  );

  if (loading) return <p className="text-sm text-neutral-500">Yükleniyor…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <input
          className={inputClass + " flex-1"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İçeriklerde ara…"
          aria-label="Ara"
        />
        <select
          className={inputClass + " max-w-[10rem]"}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | ContentStatus)}
          aria-label="Durum"
        >
          <option value="all">Tümü</option>
          <option value="draft">Taslak</option>
          <option value="approved">Onaylı</option>
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Henüz kayıtlı içeriğiniz yok.{" "}
          <Link href="/uret" className="font-medium underline underline-offset-4">
            İlk içeriğinizi üretin →
          </Link>
        </p>
      )}

      {rows.length > 0 && visible.length === 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Aramanızla eşleşen içerik yok.</p>
      )}

      <div className="space-y-4">
        {visible.map((row) => (
          <ItemCard
            key={row.id}
            row={row}
            onUpdated={(u) => setRows((all) => all.map((r) => (r.id === u.id ? u : r)))}
            onDeleted={(id) => setRows((all) => all.filter((r) => r.id !== id))}
          />
        ))}
      </div>

      {rows.length >= PAGE_LIMIT && (
        <p className="text-xs text-neutral-500">
          En yeni {PAGE_LIMIT} içerik gösteriliyor.
        </p>
      )}
    </div>
  );
}
