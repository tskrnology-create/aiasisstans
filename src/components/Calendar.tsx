"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/business-store";
import { STATUS_LABEL, type ContentStatus } from "@/lib/library-utils";
import {
  REMINDER_LABEL,
  addDays,
  computeRemindAt,
  dayKey,
  endOfDay,
  formatDayLong,
  formatMonthTitle,
  formatTime,
  fromLocalInput,
  groupByDay,
  isOverdue,
  monthGrid,
  sameDay,
  shareText,
  startOfDay,
  toLocalInput,
  weekDays,
  type CalendarItem,
  type ReminderOption,
} from "@/lib/calendar-utils";

const SELECT_ITEM = "*, contents(prompt, tone, post_text, caption, hashtags, status)";
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";

const smallBtn =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 " +
  "disabled:opacity-50 dark:border-neutral-700";

interface PickerContent {
  id: string;
  prompt: string;
  tone: string | null;
  status: ContentStatus;
}

// PostgREST filtresinde milisaniyesiz ISO kullanılır.
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function StatusBadge({ status }: { status: ContentStatus }) {
  const style =
    status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ItemRow({
  item,
  showDate,
  onChanged,
}: {
  item: CalendarItem;
  showDate?: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toLocalInput(new Date(item.scheduled_at)));

  const scheduled = new Date(item.scheduled_at);
  const overdue = isOverdue(item, new Date());
  const c = item.contents;

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await action();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    onChanged();
    return true;
  }

  async function saveTime() {
    const next = fromLocalInput(when);
    if (!next) {
      setError("Geçerli bir tarih ve saat girin.");
      return;
    }
    // Hatırlatma varsa aynı farkla kaydır.
    let remind = item.remind_at;
    if (remind) {
      const delta = next.getTime() - scheduled.getTime();
      remind = new Date(new Date(remind).getTime() + delta).toISOString();
    }
    const ok = await run(() =>
      getSupabase()
        .from("calendar_items")
        .update({ scheduled_at: next.toISOString(), remind_at: remind })
        .eq("id", item.id)
    );
    if (ok) setEditing(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText(c));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Panoya kopyalanamadı.");
    }
  }

  return (
    <li
      className={`space-y-2 rounded-lg border p-3 ${
        overdue
          ? "border-red-300 bg-red-50 dark:bg-red-950/20"
          : "border-neutral-200 dark:border-neutral-800"
      } ${item.done ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="font-medium">
          {showDate && `${scheduled.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · `}
          {formatTime(item.scheduled_at)}
        </span>
        <span>{item.platform ? PLATFORM_LABELS[item.platform] : "Platform seçilmedi"}</span>
        {c && <StatusBadge status={c.status} />}
        {item.done && <span className="text-green-700">Paylaşıldı</span>}
        {overdue && <span className="font-medium text-red-700">Gecikmiş</span>}
      </div>
      <p className="text-sm">{c ? c.post_text || c.prompt : "İçerik bulunamadı"}</p>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={copy} className={smallBtn}>
          {copied ? "Kopyalandı" : "Metni kopyala"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() =>
              getSupabase().from("calendar_items").update({ done: !item.done }).eq("id", item.id)
            )
          }
          className={smallBtn}
        >
          {item.done ? "Geri al" : "Paylaşıldı"}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing((e) => !e)} className={smallBtn}>
          Saati değiştir
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm("Bu plan takvimden kaldırılsın mı? (İçerik kütüphanede kalır.)")) return;
            run(() => getSupabase().from("calendar_items").delete().eq("id", item.id));
          }}
          className={smallBtn + " text-red-600"}
        >
          Kaldır
        </button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            className={inputClass + " max-w-[16rem]"}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Yeni tarih ve saat"
          />
          <button type="button" disabled={busy} onClick={saveTime} className={smallBtn}>
            Kaydet
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </li>
  );
}

function AddForm({
  day,
  businessId,
  contents,
  onAdded,
}: {
  day: Date;
  businessId: string;
  contents: PickerContent[];
  onAdded: () => void;
}) {
  const [contentId, setContentId] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [time, setTime] = useState("10:00");
  const [reminder, setReminder] = useState<ReminderOption>("1h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contentId) {
      setError("Bir içerik seçin.");
      return;
    }
    const scheduled = fromLocalInput(`${dayKey(day)}T${time}`);
    if (!scheduled) {
      setError("Geçerli bir saat girin.");
      return;
    }
    setBusy(true);
    const { error: err } = await getSupabase().from("calendar_items").insert({
      business_id: businessId,
      content_id: contentId,
      platform,
      scheduled_at: scheduled.toISOString(),
      remind_at: computeRemindAt(scheduled, reminder),
    });
    setBusy(false);
    if (err) {
      setError("Eklenemedi: " + err.message);
      return;
    }
    setContentId("");
    onAdded();
  }

  if (contents.length === 0) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Takvime eklenecek içerik yok.{" "}
        <Link href="/uret" className="font-medium underline underline-offset-4">
          Önce içerik üretin →
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h3 className="text-sm font-semibold">Bu güne içerik ekle</h3>
      <select
        className={inputClass}
        value={contentId}
        onChange={(e) => setContentId(e.target.value)}
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
      <div className="flex flex-wrap gap-3">
        <select
          className={inputClass + " max-w-[10rem]"}
          value={platform}
          onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
          aria-label="Platform"
        >
          {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="time"
          className={inputClass + " max-w-[8rem]"}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Saat"
        />
        <select
          className={inputClass + " max-w-[12rem]"}
          value={reminder}
          onChange={(e) => setReminder(e.target.value as ReminderOption)}
          aria-label="Hatırlatma"
        >
          {(Object.keys(REMINDER_LABEL) as ReminderOption[]).map((o) => (
            <option key={o} value={o}>
              {REMINDER_LABEL[o]}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={smallBtn}>
        {busy ? "Ekleniyor…" : "Takvime ekle"}
      </button>
    </form>
  );
}

export default function Calendar() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState<Date>(today);
  const [selected, setSelected] = useState<Date>(today);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [attention, setAttention] = useState<CalendarItem[]>([]);
  const [contents, setContents] = useState<PickerContent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const rangeFrom = grid[0];
  const rangeTo = addDays(grid[41], 1);
  const rangeKey = dayKey(rangeFrom);

  // İşletme ve içerik listesi (bir kez)
  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      supabase
        .from("businesses")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("contents")
        .select("id, prompt, tone, status")
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([biz, cont]) => {
      if (biz.error) setError("Profil okunamadı: " + biz.error.message);
      else setBusinessId(biz.data?.id ?? null);
      if (cont.error) setError("İçerikler okunamadı: " + cont.error.message);
      else setContents((cont.data ?? []) as PickerContent[]);
      setInitialLoading(false);
    });
  }, []);

  // Görünen aralıktaki planlar + "bugün ve gecikmiş" listesi
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    const now = new Date();
    Promise.all([
      supabase
        .from("calendar_items")
        .select(SELECT_ITEM)
        .gte("scheduled_at", iso(rangeFrom))
        .lt("scheduled_at", iso(rangeTo))
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("calendar_items")
        .select(SELECT_ITEM)
        .eq("done", false)
        .or(`scheduled_at.lt.${iso(endOfDay(now))},remind_at.lte.${iso(now)}`)
        .order("scheduled_at", { ascending: true })
        .limit(50),
    ]).then(([range, att]) => {
      if (cancelled) return;
      if (range.error) setError("Takvim yüklenemedi: " + range.error.message);
      else {
        setError(null);
        setItems((range.data ?? []) as unknown as CalendarItem[]);
      }
      if (!att.error) setAttention((att.data ?? []) as unknown as CalendarItem[]);
    });
    return () => {
      cancelled = true;
    };
    // rangeFrom/rangeTo rangeKey'den türetilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, version]);

  const byDay = useMemo(() => groupByDay(items), [items]);
  const reload = () => setVersion((v) => v + 1);

  function move(delta: number) {
    setCursor((c) =>
      view === "month"
        ? new Date(c.getFullYear(), c.getMonth() + delta, 1)
        : addDays(c, delta * 7)
    );
  }

  function selectDay(d: Date) {
    setSelected(d);
    if (view === "month" && d.getMonth() !== cursor.getMonth()) setCursor(d);
  }

  if (initialLoading) return <p className="text-sm text-neutral-500">Yükleniyor…</p>;

  if (!businessId) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Takvimi kullanmak için önce{" "}
        <Link href="/" className="font-medium underline underline-offset-4">
          işletme profilinizi kaydedin →
        </Link>
      </p>
    );
  }

  const selectedItems = byDay.get(dayKey(selected)) ?? [];
  const week = weekDays(cursor);
  const title =
    view === "month"
      ? formatMonthTitle(cursor)
      : `${week[0].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – ${week[6].toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      {attention.length > 0 && (
        <section className="space-y-3" aria-label="Bugün ve gecikmiş">
          <h2 className="text-lg font-semibold">Paylaşım bekleyenler</h2>
          <p className="text-xs text-neutral-500">
            Bugün paylaşılacaklar, gecikenler ve hatırlatma zamanı gelenler. Paylaştıktan sonra
            &quot;Paylaşıldı&quot; düğmesine basın.
          </p>
          <ul className="space-y-3">
            {attention.map((item) => (
              <ItemRow key={item.id} item={item} showDate onChanged={reload} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4" aria-label="Takvim">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => move(-1)} className={smallBtn} aria-label="Önceki">
              ←
            </button>
            <h2 className="min-w-[10rem] text-center text-base font-semibold capitalize">{title}</h2>
            <button type="button" onClick={() => move(1)} className={smallBtn} aria-label="Sonraki">
              →
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCursor(today);
                setSelected(today);
              }}
              className={smallBtn}
            >
              Bugün
            </button>
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={
                  smallBtn + (view === v ? " bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "")
                }
              >
                {v === "month" ? "Ay" : "Hafta"}
              </button>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((d) => {
                const list = byDay.get(dayKey(d)) ?? [];
                const inMonth = d.getMonth() === cursor.getMonth();
                const isSel = sameDay(d, selected);
                const hasOverdue = list.some((i) => isOverdue(i, new Date()));
                return (
                  <button
                    key={dayKey(d)}
                    type="button"
                    onClick={() => selectDay(d)}
                    aria-label={`${formatDayLong(d)}, ${list.length} plan`}
                    aria-pressed={isSel}
                    className={`flex h-14 flex-col items-center justify-start rounded-lg border p-1 text-sm ${
                      isSel
                        ? "border-neutral-900 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800"
                        : "border-neutral-200 dark:border-neutral-800"
                    } ${inMonth ? "" : "opacity-40"} ${sameDay(d, today) ? "font-bold ring-1 ring-neutral-500" : ""}`}
                  >
                    <span>{d.getDate()}</span>
                    {list.length > 0 && (
                      <span
                        className={`mt-0.5 rounded-full px-1.5 text-[10px] font-medium ${
                          hasOverdue ? "bg-red-600 text-white" : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        }`}
                      >
                        {list.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {week.map((d) => {
              const list = byDay.get(dayKey(d)) ?? [];
              return (
                <div key={dayKey(d)} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => selectDay(d)}
                    aria-pressed={sameDay(d, selected)}
                    className={`text-sm font-semibold capitalize ${sameDay(d, selected) ? "underline underline-offset-4" : ""}`}
                  >
                    {formatDayLong(d)}
                    {sameDay(d, today) && " (bugün)"}
                  </button>
                  {list.length === 0 ? (
                    <p className="text-xs text-neutral-500">Plan yok.</p>
                  ) : (
                    <ul className="space-y-3">
                      {list.map((item) => (
                        <ItemRow key={item.id} item={item} onChanged={reload} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" aria-label="Seçili gün">
        <h2 className="text-base font-semibold capitalize">{formatDayLong(selected)}</h2>
        {view === "month" &&
          (selectedItems.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Bu gün için plan yok.</p>
          ) : (
            <ul className="space-y-3">
              {selectedItems.map((item) => (
                <ItemRow key={item.id} item={item} onChanged={reload} />
              ))}
            </ul>
          ))}
        <AddForm
          key={dayKey(selected)}
          day={selected}
          businessId={businessId}
          contents={contents}
          onAdded={reload}
        />
      </section>

      <p className="text-xs text-neutral-500">
        Bu sürümde otomatik paylaşım yoktur: içeriği kopyalayıp ya da kütüphaneden indirip ilgili
        platformda kendiniz paylaşırsınız. Hatırlatmalar bu sayfada görünür.
      </p>
    </div>
  );
}
