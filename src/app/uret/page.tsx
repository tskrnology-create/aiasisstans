import AuthGate from "@/components/AuthGate";
import Generator from "@/components/Generator";

export default function GeneratePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Adım 2 / AI Content Generator
        </p>
        <h1 className="text-2xl font-bold">İçerik üretin</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          İsteğinizi yazın; yapay zekâ işletme profilinizdeki marka diline göre
          gönderi, açıklama, hashtag, reklam ve hikâye metni hazırlar.
        </p>
      </header>
      <AuthGate>
        <Generator />
      </AuthGate>
    </main>
  );
}
