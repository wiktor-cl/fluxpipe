import { useStats } from "./hooks/useStats";
import { useDlq } from "./hooks/useDlq";
import { QueueStatsPanel } from "./components/QueueStatsPanel";
import { DlqTable } from "./components/DlqTable";

export default function App() {
  const { stats, throughputPerMinute, error: statsError } = useStats();
  const { jobs, error: dlqError, retry, retryingIds } = useDlq();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">FluxPipe</h1>
        <p className="text-sm text-slate-400">
          Distributed job processing - live queue, retry and dead-letter view.
        </p>
      </header>

      {statsError && (
        <p className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-200">
          Failed to load stats: {statsError}
        </p>
      )}

      <QueueStatsPanel stats={stats} throughputPerMinute={throughputPerMinute} />

      <section className="mt-10 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Dead-letter jobs</h2>
        {dlqError && (
          <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-200">
            Failed to load DLQ: {dlqError}
          </p>
        )}
        <DlqTable jobs={jobs} retryingIds={retryingIds} onRetry={retry} />
      </section>
    </div>
  );
}
