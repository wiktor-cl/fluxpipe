import { useEffect, useRef, useState } from "react";
import { fetchStats, type StatsResponse } from "../api";

export interface StatsState {
  stats: StatsResponse | null;
  throughputPerMinute: number;
  error: string | null;
  loading: boolean;
}

export function useStats(pollIntervalMs = 3000): StatsState {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [throughputPerMinute, setThroughputPerMinute] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const previous = useRef<{ completed: number; at: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const next = await fetchStats();
        if (cancelled) return;
        const now = Date.now();
        if (previous.current) {
          const deltaCompleted = next.jobs.completed - previous.current.completed;
          const deltaMinutes = (now - previous.current.at) / 60_000;
          if (deltaMinutes > 0) {
            setThroughputPerMinute(Math.max(0, Math.round(deltaCompleted / deltaMinutes)));
          }
        }
        previous.current = { completed: next.jobs.completed, at: now };
        setStats(next);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return { stats, throughputPerMinute, error, loading };
}
