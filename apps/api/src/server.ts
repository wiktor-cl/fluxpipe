import { createDatabase, JobsRepository, runMigrations } from "@fluxpipe/db";
import { createRedisConnection } from "./redis.js";
import { createQueues } from "./queues.js";
import { buildApp } from "./app.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://fluxpipe:fluxpipe@localhost:5432/fluxpipe";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS ?? 5);

async function main() {
  await runMigrations(DATABASE_URL);

  const { db } = createDatabase(DATABASE_URL);
  const repository = new JobsRepository(db);

  const queueConnection = createRedisConnection(REDIS_URL);
  const statsConnection = createRedisConnection(REDIS_URL);
  const { jobsQueue, dlqQueue } = createQueues(queueConnection);

  const app = await buildApp({
    repository,
    jobsQueue,
    dlqQueue,
    statsRedis: statsConnection,
    defaultMaxAttempts: DEFAULT_MAX_ATTEMPTS,
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`api listening on :${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
