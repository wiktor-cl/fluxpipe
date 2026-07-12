import { Queue } from "bullmq";
import { DLQ_QUEUE, JOBS_QUEUE } from "@fluxpipe/shared";
import type { Redis as IORedis } from "ioredis";

export function createQueues(connection: IORedis): { jobsQueue: Queue; dlqQueue: Queue } {
  const jobsQueue = new Queue(JOBS_QUEUE, { connection });
  const dlqQueue = new Queue(DLQ_QUEUE, { connection });
  return { jobsQueue, dlqQueue };
}
