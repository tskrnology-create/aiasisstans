// Supabase istemcisi (tarayıcı tarafı).
// Yalnızca "publishable/anon" anahtarı kullanılır; veri güvenliğini
// schema.sql içindeki RLS politikaları sağlar. service_role anahtarı
// bu projede ASLA tarayıcı koduna konmaz.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase ayarları eksik: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tanımlanmalı."
    );
  }
  client = createClient(url, key);
  return client;
}
