import type { CircuitState, StatsResponse } from "../api";
import { StatCard } from "./StatCard";

interface QueueStatsPanelProps {
  stats: StatsResponse | null;
  throughputPerMinute: number;
}

const CIRCUIT_LABEL: Record<CircuitState, string> = {
  closed: "Closed",
  half_open: "Half-open",
  open: "Open",
};

const CIRCUIT_TONE: Record<CircuitState, "success" | "warning" | "danger"> = {
  closed: "success",
  half_open: "warning",
  open: "danger",
};

export function QueueStatsPanel({ stats, throughputPerMinute }: QueueStatsPanelProps) {
  const jobs = stats?.jobs;
  const dlq = stats?.dlq;
  const circuitState = stats?.circuitBreaker ?? "closed";

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Jobs queue</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Waiting" value={jobs?.waiting ?? "-"} />
        <StatCard label="Active" value={jobs?.active ?? "-"} />
        <StatCard label="Completed" value={jobs?.completed ?? "-"} tone="success" />
        <StatCard label="Failed (retrying)" value={jobs?.failed ?? "-"} tone="warning" />
        <StatCard label="Delayed" value={jobs?.delayed ?? "-"} />
        <StatCard label="Throughput /min" value={throughputPerMinute} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Circuit breaker</h2>
        <StatCard label="State" value={CIRCUIT_LABEL[circuitState]} tone={CIRCUIT_TONE[circuitState]} />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Dead-letter queue</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Waiting" value={dlq?.waiting ?? "-"} />
        <StatCard label="Active" value={dlq?.active ?? "-"} />
        <StatCard label="Completed" value={dlq?.completed ?? "-"} />
        <StatCard label="Failed" value={dlq?.failed ?? "-"} tone="danger" />
        <StatCard label="Delayed" value={dlq?.delayed ?? "-"} />
      </div>
    </section>
  );
}
