import AuthGate from "@/components/AuthGate";
import Library from "@/components/Library";

export default function LibraryPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Content Library
        </p>
        <h1 className="text-2xl font-bold">İçerik kütüphanesi</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Ürettiğiniz tüm içerikler burada saklanır. Bulun, düzenleyin, onaylayın,
          indirin veya yeniden kullanın.
        </p>
      </header>
      <AuthGate>
        <Library />
      </AuthGate>
    </main>
  );
}
