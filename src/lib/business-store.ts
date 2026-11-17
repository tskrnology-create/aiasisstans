// Depolama katmanı. Şimdilik tarayıcının localStorage'ını kullanır.
// Supabase'e geçerken yalnızca bu dosyadaki `businessStore` nesnesi
// değiştirilecek; form ve diğer ekranlar aynı arayüzü kullanmaya devam eder.

import type { BusinessProfile } from "./brand-prompt";

export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "x"
  | "linkedin"
  | "youtube"
  | "other";

export interface SocialAccount {
  platform: SocialPlatform;
  handle: string;
}

export interface StoredBusiness extends BusinessProfile {
  logo_data_url: string | null;
  social_accounts: SocialAccount[];
}

export interface BusinessStore {
  get(): Promise<StoredBusiness | null>;
  save(business: StoredBusiness): Promise<void>;
}

const STORAGE_KEY = "aba.business.v1";

export const businessStore: BusinessStore = {
  async get() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredBusiness) : null;
    } catch {
      return null;
    }
  },
  async save(business) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(business));
  },
};

export const EMPTY_BUSINESS: StoredBusiness = {
  name: "",
  industry: "",
  products: "",
  target_audience: "",
  brand_voice: "",
  brand_colors: [],
  content_language: "tr",
  logo_data_url: null,
  social_accounts: [],
};

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  other: "Diğer",
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface ValidationErrors {
  name?: string;
  industry?: string;
  brand_colors?: string;
  social_accounts?: string;
}

export function validateBusiness(b: StoredBusiness): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!b.name.trim()) errors.name = "İşletme adı gerekli.";
  if (!b.industry.trim()) errors.industry = "Sektör gerekli.";
  if ((b.brand_colors ?? []).some((c) => !HEX_RE.test(c))) {
    errors.brand_colors = "Renkler #RRGGBB biçiminde olmalı.";
  }
  if (b.social_accounts.some((a) => !a.handle.trim())) {
    errors.social_accounts = "Boş hesap satırlarını doldurun veya silin.";
  }
  return errors;
}
