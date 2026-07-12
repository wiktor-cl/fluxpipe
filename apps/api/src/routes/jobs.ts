import type { FastifyInstance } from "fastify";
import { createJobRequestSchema } from "@fluxpipe/shared";
import type { AppDeps } from "../app.js";
import { toJobRecord } from "../serialize.js";

const IDEMPOTENCY_HEADER = "idempotency-key";

export async function registerJobsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post("/jobs", async (request, reply) => {
    const idempotencyKey = request.headers[IDEMPOTENCY_HEADER];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return reply.status(400).send({ error: `${IDEMPOTENCY_HEADER} header is required` });
    }

    const parsed = createJobRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid request body", details: parsed.error.flatten() });
    }

    const { job, created } = await deps.repository.createIfNotExists({
      idempotencyKey,
      type: parsed.data.type,
      payload: parsed.data.payload,
      correlationId: request.correlationId,
      maxAttempts: deps.defaultMaxAttempts,
    });

    if (created) {
      await deps.jobsQueue.add(
        job.type,
        { type: job.type, payload: job.payload, correlationId: job.correlationId },
        {
          jobId: job.id,
          attempts: job.maxAttempts,
          backoff: { type: "custom" },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86_400, count: 1000 },
        },
      );
      request.log.info({ jobId: job.id, idempotencyKey }, "job enqueued");
    } else {
      request.log.info({ jobId: job.id, idempotencyKey }, "idempotent replay - no new job enqueued");
    }

    return reply.status(created ? 201 : 200).send(toJobRecord(job));
  });

  app.get("/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await deps.repository.findById(id);
    if (!job) {
      return reply.status(404).send({ error: "job not found" });
    }
    return reply.send(toJobRecord(job));
  });
}
