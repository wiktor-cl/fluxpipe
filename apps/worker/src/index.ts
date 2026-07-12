import { Queue } from "bullmq";
import { createLogger, CIRCUIT_STATE_REDIS_KEY, DLQ_QUEUE } from "@fluxpipe/shared";
import { createDatabase, JobsRepository, runMigrations } from "@fluxpipe/db";
import { createRedisConnection } from "./redis.js";
import { createCircuitBreaker } from "./circuitBreakerInstance.js";
import { createWorker } from "./worker.js";
import { registerGracefulShutdown } from "./shutdown.js";
import { startMetricsServer } from "./metricsServer.js";
import { circuitBreakerStateGauge } from "./metrics.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://fluxpipe:fluxpipe@localhost:5432/fluxpipe";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const EXTERNAL_SERVICE_URL = process.env.EXTERNAL_SERVICE_URL ?? "http://localhost:4100";
const METRICS_PORT = Number(process.env.WORKER_METRICS_PORT ?? 9100);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

const logger = createLogger({ name: "fluxpipe-worker" });

async function main() {
  await runMigrations(DATABASE_URL);

  const { db, pool } = createDatabase(DATABASE_URL);
  const repository = new JobsRepository(db);

  const workerConnection = createRedisConnection(REDIS_URL);
  const dlqQueueConnection = createRedisConnection(REDIS_URL);
  const circuitStateConnection = createRedisConnection(REDIS_URL);
  const dlqQueue = new Queue(DLQ_QUEUE, { connection: dlqQueueConnection });

  const breaker = createCircuitBreaker();
  breaker.onStateChange((state) => {
    circuitBreakerStateGauge.set(state === "closed" ? 0 : state === "half_open" ? 1 : 2);
    logger.info({ state }, "circuit breaker state changed");
    void circuitStateConnection.set(CIRCUIT_STATE_REDIS_KEY, state);
  });

  const worker = createWorker({
    connection: workerConnection,
    repository,
    dlqQueue,
    breaker,
    externalServiceUrl: EXTERNAL_SERVICE_URL,
    logger,
    concurrency: CONCURRENCY,
  });

  const metricsServer = startMetricsServer(METRICS_PORT);
  logger.info({ port: METRICS_PORT }, "worker metrics server listening");

  registerGracefulShutdown(worker, logger, async () => {
    await dlqQueue.close();
    await workerConnection.quit();
    await dlqQueueConnection.quit();
    await circuitStateConnection.quit();
    await pool.end();
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
  });

  logger.info("worker started");
}

main().catch((err) => {
  logger.error(err, "worker failed to start");
  process.exit(1);
});
