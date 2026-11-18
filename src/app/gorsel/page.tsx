import AuthGate from "@/components/AuthGate";
import VisualCreator from "@/components/VisualCreator";

export default function VisualPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          AI Visual Creator
        </p>
        <h1 className="text-2xl font-bold">Görsel oluşturun</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          İçeriğinizi marka renkleriniz ve logonuzla gönderi, hikâye veya kampanya
          görseline dönüştürün. İsterseniz yapay zekâyla arka plan üretin.
        </p>
      </header>
      <AuthGate>
        <VisualCreator />
      </AuthGate>
    </main>
  );
}
