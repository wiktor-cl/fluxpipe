import { Worker, type Queue } from "bullmq";
import type { Redis as IORedis } from "ioredis";
import { JOBS_QUEUE, computeBackoffDelay, type CircuitBreaker, type Logger } from "@fluxpipe/shared";
import type { JobsRepository } from "@fluxpipe/db";
import { processJob, type JobData } from "./processors/processJob.js";
import { jobsProcessedTotal, jobDurationSeconds } from "./metrics.js";

export interface CreateWorkerDeps {
  connection: IORedis;
  repository: JobsRepository;
  dlqQueue: Queue;
  breaker: CircuitBreaker;
  externalServiceUrl: string;
  logger: Logger;
  concurrency?: number;
}

/**
 * BullMQ job.id is always set explicitly to the Postgres jobs.id at enqueue
 * time (see apps/api/src/routes/jobs.ts), so the two ids never diverge and
 * we can use job.id directly as the repository key.
 *
 * All Postgres/DLQ side effects happen *inside* the processor function,
 * before it resolves or rejects - not in separate 'completed'/'failed' event
 * listeners. Worker#close() during graceful shutdown only waits for the
 * active processor promise to settle, so if the DB write happened in a
 * fire-and-forget event handler instead, shutdown could complete before the
 * write lands, losing the final state of the in-flight job.
 */
export function createWorker(deps: CreateWorkerDeps): Worker<JobData> {
  const worker = new Worker<JobData>(
    JOBS_QUEUE,
    async (job) => {
      const jobId = job.id;
      if (!jobId) {
        throw new Error("job is missing an id - jobs must always be enqueued with an explicit jobId");
      }
      const currentAttempt = job.attemptsMade + 1;
      const log = deps.logger.child({ jobId, correlationId: job.data.correlationId, attempt: currentAttempt });
      log.info({ type: job.data.type }, "processing job");
      await deps.repository.markActive(jobId);

      const stopTimer = jobDurationSeconds.startTimer();
      try {
        const result = await processJob(job, {
          breaker: deps.breaker,
          externalServiceUrl: deps.externalServiceUrl,
        });
        stopTimer();
        jobsProcessedTotal.inc({ outcome: "completed" });
        await deps.repository.markCompleted(jobId, result);
        log.info("job completed");
        return result;
      } catch (err) {
        stopTimer();
        const message = err instanceof Error ? err.message : String(err);
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinal = currentAttempt >= maxAttempts;

        if (isFinal) {
          jobsProcessedTotal.inc({ outcome: "dead_letter" });
          // Enqueue into the DLQ *before* flipping the Postgres status to
          // dead_letter - the DB row is what callers (dashboard, tests) poll
          // to know the job has "settled", so it must not be visible as
          // dead_letter until the DLQ entry it implies actually exists.
          // The DLQ add is best-effort here: a failure to enqueue it must
          // not prevent the terminal Postgres status write, or the job's
          // final state would never settle at all.
          try {
            await deps.dlqQueue.add(
              "dead-letter",
              {
                originalJobId: jobId,
                type: job.data.type,
                payload: job.data.payload,
                correlationId: job.data.correlationId,
                error: message,
              },
              { jobId: `dlq:${jobId}` },
            );
          } catch (dlqErr) {
            log.error(
              { err: dlqErr instanceof Error ? dlqErr.message : String(dlqErr) },
              "failed to enqueue dead-letter entry",
            );
          }
          await deps.repository.markDeadLetter(jobId, currentAttempt, message);
          log.error({ err: message }, "job exhausted retries, moved to dead-letter queue");
        } else {
          jobsProcessedTotal.inc({ outcome: "failed_retrying" });
          await deps.repository.markFailedAttempt(jobId, currentAttempt, message);
          log.warn({ err: message, maxAttempts }, "job attempt failed, will retry");
        }

        throw err;
      }
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 5,
      settings: {
        backoffStrategy: (attemptsMade: number) => computeBackoffDelay(attemptsMade),
      },
    },
  );

  return worker;
}
