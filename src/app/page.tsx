import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import ProfileForm from "@/components/ProfileForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Adım 1 / Business Profile
        </p>
        <h1 className="text-2xl font-bold">İşletmenizi tanıtın</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Yapay zekâ bu bilgileri sonraki bütün içeriklerde kullanır. Daha sonra
          istediğiniz zaman değiştirebilirsiniz.
        </p>
      </header>
      <AuthGate>
        <ProfileForm />
        <p className="mt-8 border-t border-neutral-200 pt-6 text-sm dark:border-neutral-800">
          Profilinizi kaydettiniz mi?{" "}
          <Link href="/uret" className="font-medium underline underline-offset-4">
            İçerik üretmeye geçin →
          </Link>
        </p>
      </AuthGate>
    </main>
  );
}
