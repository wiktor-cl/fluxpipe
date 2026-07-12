import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { Queue } from "bullmq";
import type { JobsRepository } from "@fluxpipe/db";
import type { Redis as IORedis } from "ioredis";
import { correlationIdPlugin } from "./plugins/correlationId.js";
import { metricsPlugin } from "./plugins/metrics.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerDlqRoutes } from "./routes/dlq.js";
import { registerHealthRoutes } from "./routes/health.js";

export interface AppDeps {
  repository: JobsRepository;
  jobsQueue: Queue;
  dlqQueue: Queue;
  statsRedis: IORedis;
  defaultMaxAttempts: number;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Single-user local demo, no auth/secrets in play - reflecting the request
  // origin keeps the dashboard (served from its own port) working without
  // hardcoding a specific origin. Not a pattern to carry into a real deployment.
  await app.register(cors, { origin: true });

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
  });

  await correlationIdPlugin(app);
  await metricsPlugin(app);

  await registerHealthRoutes(app, deps);
  await registerJobsRoutes(app, deps);
  await registerStatsRoutes(app, deps);
  await registerDlqRoutes(app, deps);

  return app;
}
