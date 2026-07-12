import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { CIRCUIT_STATE_REDIS_KEY, type CircuitState, type QueueCounts } from "@fluxpipe/shared";
import type { AppDeps } from "../app.js";

async function countsFor(queue: Queue): Promise<QueueCounts> {
  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

export async function registerStatsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/stats", async () => {
    const [jobs, dlq, circuitState] = await Promise.all([
      countsFor(deps.jobsQueue),
      countsFor(deps.dlqQueue),
      deps.statsRedis.get(CIRCUIT_STATE_REDIS_KEY),
    ]);

    return {
      jobs,
      dlq,
      circuitBreaker: (circuitState as CircuitState | null) ?? "closed",
    };
  });
}
