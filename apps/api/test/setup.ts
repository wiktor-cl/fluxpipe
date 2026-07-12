import type { Pool } from "pg";
import type { Queue } from "bullmq";
import type { Redis as IORedis } from "ioredis";
import { createDatabase, JobsRepository, runMigrations } from "@fluxpipe/db";
import { buildApp, type AppDeps } from "../src/app.js";
import { createRedisConnection } from "../src/redis.js";
import { createQueues } from "../src/queues.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://fluxpipe:fluxpipe@localhost:5432/fluxpipe";
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export interface TestContext {
  app: Awaited<ReturnType<typeof buildApp>>;
  repository: JobsRepository;
  pool: Pool;
  connection: IORedis;
  jobsQueue: Queue;
  dlqQueue: Queue;
  cleanupBetweenTests: () => Promise<void>;
  teardown: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  await runMigrations(DATABASE_URL);
  const { db, pool } = createDatabase(DATABASE_URL);
  const repository = new JobsRepository(db);
  const connection = createRedisConnection(REDIS_URL);
  const { jobsQueue, dlqQueue } = createQueues(connection);

  const deps: AppDeps = {
    repository,
    jobsQueue,
    dlqQueue,
    statsRedis: connection,
    defaultMaxAttempts: 5,
  };
  const app = await buildApp(deps);

  return {
    app,
    repository,
    pool,
    connection,
    jobsQueue,
    dlqQueue,
    cleanupBetweenTests: async () => {
      await pool.query("TRUNCATE TABLE jobs");
      await jobsQueue.obliterate({ force: true }).catch(() => {});
      await dlqQueue.obliterate({ force: true }).catch(() => {});
    },
    teardown: async () => {
      await app.close();
      await jobsQueue.close();
      await dlqQueue.close();
      await connection.quit();
      await pool.end();
    },
  };
}
