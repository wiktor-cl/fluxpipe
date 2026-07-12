import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "fluxpipe_worker_" });

export const jobsProcessedTotal = new client.Counter({
  name: "fluxpipe_worker_jobs_processed_total",
  help: "Total number of job processing attempts, labeled by outcome",
  labelNames: ["outcome"] as const,
  registers: [registry],
});

export const jobDurationSeconds = new client.Histogram({
  name: "fluxpipe_worker_job_duration_seconds",
  help: "Job processing duration in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const circuitBreakerStateGauge = new client.Gauge({
  name: "fluxpipe_worker_circuit_breaker_state",
  help: "Circuit breaker state: 0=closed, 1=half_open, 2=open",
  registers: [registry],
});
