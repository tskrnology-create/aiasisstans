"use client";

import { useEffect, useState } from "react";
import { Fragment } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 " +
  "dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300";

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("already registered")) return "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.";
  if (m.includes("email not confirmed")) return "E-postanızı doğrulayın, ardından giriş yapın.";
  if (m.includes("password should be at least")) return "Şifre en az 6 karakter olmalı.";
  if (m.includes("rate limit")) return "Çok fazla deneme yapıldı, biraz bekleyip tekrar deneyin.";
  return "İşlem başarısız: " + message;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(configured);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  if (!configured) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Supabase ayarları eksik. Vercel&apos;de NEXT_PUBLIC_SUPABASE_URL ve
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY değişkenlerini ekleyip yeniden
        yayınlayın.
      </p>
    );
  }

  if (checking) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }

  if (session) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
          <span>{session.user.email}</span>
          <button
            type="button"
            onClick={() => getSupabase().auth.signOut()}
            className="underline underline-offset-4 hover:text-red-600"
          >
            Çıkış yap
          </button>
        </div>
        {/* key: kullanıcı değişince içerik sıfırdan yüklensin */}
        <Fragment key={session.user.id}>{children}</Fragment>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("E-posta ve şifre gerekli.");
      return;
    }
    setBusy(true);
    const supabase = getSupabase();
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) setError(translateAuthError(err.message));
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(translateAuthError(err.message));
        } else if (!data.session) {
          setInfo(
            "Kayıt oluşturuldu. E-postanıza gelen doğrulama bağlantısına basıp ardından giriş yapın."
          );
          setMode("login");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold">
        {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
      </h2>
      <input
        type="email"
        autoComplete="email"
        className={inputClass}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-posta"
      />
      <input
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        className={inputClass}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Şifre (en az 6 karakter)"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Bekleyin…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
          setInfo(null);
        }}
        className="text-sm underline underline-offset-4"
      >
        {mode === "login"
          ? "Hesabınız yok mu? Kayıt olun"
          : "Zaten hesabınız var mı? Giriş yapın"}
      </button>
    </form>
  );
}
