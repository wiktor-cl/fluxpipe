import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { toJobRecord } from "../serialize.js";

export async function registerDlqRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/dlq", async () => {
    const rows = await deps.repository.listDeadLetter();
    return { jobs: rows.map(toJobRecord) };
  });

  app.post("/dlq/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await deps.repository.findById(id);
    if (!job) {
      return reply.status(404).send({ error: "job not found" });
    }
    if (job.status !== "dead_letter") {
      return reply.status(409).send({ error: `job is not in dead_letter status (current: ${job.status})` });
    }

    const existingBullJob = await deps.jobsQueue.getJob(id);
    if (existingBullJob) {
      await existingBullJob.remove();
    }

    const updated = await deps.repository.requeueFromDeadLetter(id);
    if (!updated) {
      return reply.status(500).send({ error: "failed to requeue job" });
    }

    await deps.jobsQueue.add(
      updated.type,
      { type: updated.type, payload: updated.payload, correlationId: updated.correlationId },
      {
        jobId: updated.id,
        attempts: updated.maxAttempts,
        backoff: { type: "custom" },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86_400, count: 1000 },
      },
    );

    request.log.info({ jobId: id }, "job requeued from dead-letter queue");
    return reply.send(toJobRecord(updated));
  });
}
