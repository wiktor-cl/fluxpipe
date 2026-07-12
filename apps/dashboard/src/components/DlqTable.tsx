import type { JobRecord } from "../api";

interface DlqTableProps {
  jobs: JobRecord[];
  retryingIds: Set<string>;
  onRetry: (id: string) => void;
}

export function DlqTable({ jobs, retryingIds, onRetry }: DlqTableProps) {
  if (jobs.length === 0) {
    return <p className="text-sm text-slate-400">No dead-lettered jobs. Everything is flowing.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Attempts</th>
            <th className="px-4 py-3">Last error</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3">Correlation id</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="px-4 py-3 font-medium">{job.type}</td>
              <td className="px-4 py-3">
                {job.attempts}/{job.maxAttempts}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-red-300" title={job.lastError ?? undefined}>
                {job.lastError ?? "-"}
              </td>
              <td className="px-4 py-3 text-slate-400">{new Date(job.updatedAt).toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{job.correlationId}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onRetry(job.id)}
                  disabled={retryingIds.has(job.id)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {retryingIds.has(job.id) ? "Retrying..." : "Retry"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
