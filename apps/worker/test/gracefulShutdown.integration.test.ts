import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { createDatabase, JobsRepository, runMigrations } from "@fluxpipe/db";
import { CircuitBreaker, DLQ_QUEUE, JOBS_QUEUE } from "@fluxpipe/shared";
import { createRedisConnection } from "../src/redis.js";
import { createWorker } from "../src/worker.js";
import { isPostgresReachable, isRedisReachable } from "./testInfra.js";
import { silentLogger, startSlowServer, waitFor, type MockServerHandle } from "./helpers.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://fluxpipe:fluxpipe@localhost:5432/fluxpipe";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const hasInfra = (await isPostgresReachable(DATABASE_URL)) && (await isRedisReachable(REDIS_URL));

describe.skipIf(!hasInfra)("worker graceful shutdown", () => {
  let pool: ReturnType<typeof createDatabase>["pool"];
  let repository: JobsRepository;
  let producerConnection: ReturnType<typeof createRedisConnection>;
  let jobsQueue: Queue;
  let mockServer: MockServerHandle | undefined;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL);
    const database = createDatabase(DATABASE_URL);
    pool = database.pool;
    repository = new JobsRepository(database.db);
    producerConnection = createRedisConnection(REDIS_URL);
    jobsQueue = new Queue(JOBS_QUEUE, { connection: producerConnection });
  });

  afterEach(async () => {
    mockServer?.server.close();
    mockServer = undefined;
    await pool.query("TRUNCATE TABLE jobs");
    await jobsQueue.obliterate({ force: true }).catch(() => {});
  });

  afterAll(async () => {
    await jobsQueue.close();
    await producerConnection.quit();
    await pool.end();
  });

  it("Worker#close() waits for the active job to finish instead of abandoning it", async () => {
    const DELAY_MS = 1500;
    mockServer = await startSlowServer(DELAY_MS);

    const dlqConnection = createRedisConnection(REDIS_URL);
    const dlqQueue = new Queue(DLQ_QUEUE, { connection: dlqConnection });
    const workerConnection = createRedisConnection(REDIS_URL);
    const worker = createWorker({
      connection: workerConnection,
      repository,
      dlqQueue,
      breaker: new CircuitBreaker({ failureThreshold: 1000 }),
      externalServiceUrl: mockServer.url,
      logger: silentLogger(),
      concurrency: 1,
    });

    try {
      const { job } = await repository.createIfNotExists({
        idempotencyKey: randomUUID(),
        type: "send-webhook",
        payload: {},
        correlationId: randomUUID(),
        maxAttempts: 3,
      });

      await jobsQueue.add(
        job.type,
        { type: job.type, payload: job.payload, correlationId: job.correlationId },
        { jobId: job.id, attempts: job.maxAttempts, backoff: { type: "custom" } },
      );

      // Wait until the worker has actually picked up the job and marked it active
      // before triggering shutdown - otherwise close() might race the pickup.
      await waitFor(async () => {
        const current = await repository.findById(job.id);
        return current?.status === "active";
      }, 5_000);

      // This is exactly what registerGracefulShutdown() calls on SIGTERM/SIGINT.
      const shutdownStartedAt = Date.now();
      await worker.close();
      const shutdownDurationMs = Date.now() - shutdownStartedAt;

      // close() must not resolve before the in-flight (artificially slow) job finished.
      expect(shutdownDurationMs).toBeGreaterThanOrEqual(DELAY_MS - 200);

      const finalRow = await repository.findById(job.id);
      expect(finalRow?.status).toBe("completed"); // not lost, not left dangling as "active"
    } finally {
      await dlqQueue.close();
      await dlqConnection.quit();
      await workerConnection.quit().catch(() => {});
    }
  }, 15_000);
});
