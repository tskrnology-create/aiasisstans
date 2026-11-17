"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_BUSINESS,
  PLATFORM_LABELS,
  businessStore,
  validateBusiness,
  type SocialPlatform,
  type StoredBusiness,
  type ValidationErrors,
} from "@/lib/business-store";

const MAX_LOGO_BYTES = 500 * 1024; // localStorage sınırı nedeniyle; Supabase'de kalkacak
const MAX_COLORS = 6;

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ProfileForm() {
  const [form, setForm] = useState<StoredBusiness>(EMPTY_BUSINESS);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    businessStore.get().then((stored) => {
      if (stored) setForm({ ...EMPTY_BUSINESS, ...stored });
      setLoaded(true);
    });
  }, []);

  function update<K extends keyof StoredBusiness>(key: K, value: StoredBusiness[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedAt(null);
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoError("Logo PNG, JPG veya WebP olmalı.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo 500 KB'den küçük olmalı.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo_data_url", reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateBusiness(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await businessStore.save({
      ...form,
      name: form.name.trim(),
      industry: form.industry.trim(),
      social_accounts: form.social_accounts.map((a) => ({
        ...a,
        handle: a.handle.trim(),
      })),
    });
    setSavedAt(new Date());
  }

  const colors = form.brand_colors ?? [];

  if (!loaded) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <section className="space-y-5">
        <h2 className="text-lg font-semibold">Temel bilgiler</h2>
        <Field label="İşletme adı *" error={errors.name}>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Örn. Pınar Güzellik Merkezi"
          />
        </Field>
        <Field label="Sektör *" error={errors.industry}>
          <input
            className={inputClass}
            value={form.industry}
            onChange={(e) => update("industry", e.target.value)}
            placeholder="Örn. Güzellik ve kişisel bakım"
          />
        </Field>
        <Field
          label="Ürün ve hizmetler"
          hint="Yapay zekâ yalnızca burada yazanları ürün olarak kullanır; ne kadar net yazarsanız o kadar iyi içerik çıkar."
        >
          <textarea
            className={inputClass}
            rows={4}
            value={form.products ?? ""}
            onChange={(e) => update("products", e.target.value)}
            placeholder="Örn. Cilt bakımı, lazer epilasyon, manikür, kaş tasarımı"
          />
        </Field>
        <Field label="Hedef kitle">
          <textarea
            className={inputClass}
            rows={3}
            value={form.target_audience ?? ""}
            onChange={(e) => update("target_audience", e.target.value)}
            placeholder="Örn. 25–45 yaş, İstanbul Anadolu Yakası'nda yaşayan çalışan kadınlar"
          />
        </Field>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold">Marka kimliği</h2>
        <Field
          label="Marka dili"
          hint="İşletmenin nasıl konuştuğunu birkaç cümleyle anlatın."
        >
          <textarea
            className={inputClass}
            rows={3}
            value={form.brand_voice ?? ""}
            onChange={(e) => update("brand_voice", e.target.value)}
            placeholder="Örn. Samimi ama profesyonel; 'sen' dili, ölçülü emoji kullanımı"
          />
        </Field>

        <Field label="Marka renkleri" error={errors.brand_colors}>
          <div className="space-y-2">
            {colors.map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`Renk ${i + 1}`}
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
                  onChange={(e) => {
                    const next = [...colors];
                    next[i] = e.target.value;
                    update("brand_colors", next);
                  }}
                  className="h-9 w-12 cursor-pointer rounded border border-neutral-300 bg-transparent"
                />
                <input
                  className={inputClass}
                  value={color}
                  onChange={(e) => {
                    const next = [...colors];
                    next[i] = e.target.value;
                    update("brand_colors", next);
                  }}
                  placeholder="#E91E63"
                />
                <button
                  type="button"
                  onClick={() =>
                    update("brand_colors", colors.filter((_, j) => j !== i))
                  }
                  className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:text-red-600"
                  aria-label="Rengi sil"
                >
                  Sil
                </button>
              </div>
            ))}
            {colors.length < MAX_COLORS && (
              <button
                type="button"
                onClick={() => update("brand_colors", [...colors, "#000000"])}
                className="text-sm font-medium underline underline-offset-4"
              >
                + Renk ekle
              </button>
            )}
          </div>
        </Field>

        <Field label="Logo" error={logoError ?? undefined} hint="PNG, JPG veya WebP, en fazla 500 KB.">
          <div className="flex items-center gap-4">
            {form.logo_data_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_data_url}
                alt="Logo önizleme"
                className="h-16 w-16 rounded-lg border border-neutral-200 object-contain"
              />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onLogoChange}
              className="text-sm"
            />
            {form.logo_data_url && (
              <button
                type="button"
                onClick={() => update("logo_data_url", null)}
                className="text-sm text-neutral-500 hover:text-red-600"
              >
                Kaldır
              </button>
            )}
          </div>
        </Field>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold">Sosyal medya hesapları</h2>
        <Field
          label="Hesaplar"
          hint="Şimdilik yalnızca kayıt için; platformlara bağlantı sonraki aşamada."
          error={errors.social_accounts}
        >
          <div className="space-y-2">
            {form.social_accounts.map((acc, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className={inputClass + " max-w-[9rem]"}
                  value={acc.platform}
                  onChange={(e) => {
                    const next = [...form.social_accounts];
                    next[i] = { ...acc, platform: e.target.value as SocialPlatform };
                    update("social_accounts", next);
                  }}
                >
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  value={acc.handle}
                  onChange={(e) => {
                    const next = [...form.social_accounts];
                    next[i] = { ...acc, handle: e.target.value };
                    update("social_accounts", next);
                  }}
                  placeholder="@kullaniciadi"
                />
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "social_accounts",
                      form.social_accounts.filter((_, j) => j !== i)
                    )
                  }
                  className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:text-red-600"
                >
                  Sil
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                update("social_accounts", [
                  ...form.social_accounts,
                  { platform: "instagram", handle: "" },
                ])
              }
              className="text-sm font-medium underline underline-offset-4"
            >
              + Hesap ekle
            </button>
          </div>
        </Field>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold">İçerik dili</h2>
        <div className="flex gap-6 text-sm">
          {(
            [
              ["tr", "Türkçe"],
              ["en", "English"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="content_language"
                checked={form.content_language === value}
                onChange={() => update("content_language", value)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Kaydet
        </button>
        {savedAt && (
          <span className="text-sm text-green-700">
            Kaydedildi ({savedAt.toLocaleTimeString("tr-TR")})
          </span>
        )}
      </div>
    </form>
  );
}
