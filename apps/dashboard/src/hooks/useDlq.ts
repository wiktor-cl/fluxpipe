import { useCallback, useEffect, useState } from "react";
import { fetchDlq, retryDlqJob, type JobRecord } from "../api";

export interface DlqState {
  jobs: JobRecord[];
  error: string | null;
  loading: boolean;
  retry: (id: string) => Promise<void>;
  retryingIds: Set<string>;
}

export function useDlq(pollIntervalMs = 5000): DlqState {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const { jobs: nextJobs } = await fetchDlq();
      setJobs(nextJobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Intentional fetch-on-mount + poll; refresh() only sets state after its
    // own await point, not synchronously during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  const retry = useCallback(
    async (id: string) => {
      setRetryingIds((prev) => new Set(prev).add(id));
      try {
        await retryDlqJob(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [refresh],
  );

  return { jobs, error, loading, retry, retryingIds };
}
