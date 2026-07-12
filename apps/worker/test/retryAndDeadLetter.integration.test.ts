import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue, type Worker } from "bullmq";
import { createDatabase, JobsRepository, runMigrations } from "@fluxpipe/db";
import { CircuitBreaker, DLQ_QUEUE, JOBS_QUEUE } from "@fluxpipe/shared";
import { createRedisConnection } from "../src/redis.js";
import { createWorker } from "../src/worker.js";
import { isPostgresReachable, isRedisReachable } from "./testInfra.js";
import { silentLogger, startFlakyServer, waitFor, type MockServerHandle } from "./helpers.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://fluxpipe:fluxpipe@localhost:5432/fluxpipe";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const hasInfra = (await isPostgresReachable(DATABASE_URL)) && (await isRedisReachable(REDIS_URL));

describe.skipIf(!hasInfra)("worker retry/backoff and dead-letter handling", () => {
  let pool: ReturnType<typeof createDatabase>["pool"];
  let repository: JobsRepository;
  let producerConnection: ReturnType<typeof createRedisConnection>;
  let jobsQueue: Queue;
  let mockServer: MockServerHandle | undefined;
  let activeWorker: Worker | undefined;
  let activeDlqQueue: Queue | undefined;
  let activeDlqConnection: ReturnType<typeof createRedisConnection> | undefined;
  let activeWorkerConnection: ReturnType<typeof createRedisConnection> | undefined;

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
    if (activeWorker) {
      await activeWorker.close();
      activeWorker = undefined;
    }
    if (activeDlqQueue) {
      await activeDlqQueue.close();
      activeDlqQueue = undefined;
    }
    if (activeDlqConnection) {
      await activeDlqConnection.quit();
      activeDlqConnection = undefined;
    }
    if (activeWorkerConnection) {
      await activeWorkerConnection.quit().catch(() => {});
      activeWorkerConnection = undefined;
    }
    await pool.query("TRUNCATE TABLE jobs");
    await jobsQueue.obliterate({ force: true }).catch(() => {});
  });

  afterAll(async () => {
    await jobsQueue.close();
    await producerConnection.quit();
    await pool.end();
  });

  async function setUpWorker(externalServiceUrl: string) {
    const dlqConnection = createRedisConnection(REDIS_URL);
    const dlqQueue = new Queue(DLQ_QUEUE, { connection: dlqConnection });
    const workerConnection = createRedisConnection(REDIS_URL);
    const worker = createWorker({
      connection: workerConnection,
      repository,
      dlqQueue,
      breaker: new CircuitBreaker({ failureThreshold: 1000 }), // effectively disabled for this test
      externalServiceUrl,
      logger: silentLogger(),
      concurrency: 1,
    });
    activeWorker = worker;
    activeDlqQueue = dlqQueue;
    activeDlqConnection = dlqConnection;
    activeWorkerConnection = workerConnection;
    return { worker, dlqQueue, dlqConnection, workerConnection };
  }

  it("retries a failing job with backoff and eventually completes", async () => {
    mockServer = await startFlakyServer(2); // fails twice, succeeds on the 3rd attempt
    await setUpWorker(mockServer.url);

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

    await waitFor(async () => {
      const current = await repository.findById(job.id);
      return current?.status === "completed";
    }, 15_000);

    expect(mockServer.getCallCount()).toBe(3);
  }, 20_000);

  it("moves a job to the dead-letter queue after exhausting all retries", async () => {
    mockServer = await startFlakyServer(Infinity); // always fails
    const { dlqQueue } = await setUpWorker(mockServer.url);

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

    await waitFor(async () => {
      const current = await repository.findById(job.id);
      return current?.status === "dead_letter";
    }, 25_000);

    expect(mockServer.getCallCount()).toBe(3); // exactly maxAttempts calls, no more

    const finalRow = await repository.findById(job.id);
    expect(finalRow?.lastError).toContain("503");

    let dlqJob: Awaited<ReturnType<typeof dlqQueue.getJob>> | undefined;
    await waitFor(async () => {
      dlqJob = await dlqQueue.getJob(`dlq:${job.id}`);
      return dlqJob !== undefined;
    }, 5_000);
    expect(dlqJob).toBeDefined();
    expect(dlqJob?.data).toMatchObject({ originalJobId: job.id, type: "send-webhook" });
  }, 35_000);
});
