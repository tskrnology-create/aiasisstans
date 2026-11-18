import AuthGate from "@/components/AuthGate";
import Calendar from "@/components/Calendar";

export default function CalendarPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Content Calendar
        </p>
        <h1 className="text-2xl font-bold">İçerik takvimi</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Hangi gün ne paylaşacağınızı planlayın. Taslak ve onaylı içerikleri
          takvime ekleyin, paylaşım zamanı gelince hatırlatma görün.
        </p>
      </header>
      <AuthGate>
        <Calendar />
      </AuthGate>
    </main>
  );
}
