import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 4100);
const FAILURE_RATE = Number(process.env.FAILURE_RATE ?? 0.35);
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 150);

/**
 * Stands in for a flaky third-party dependency so the demo (docker compose up)
 * visibly exercises the worker's circuit breaker and retry/backoff without
 * needing any real external API or credentials.
 */
const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.post("/process", async (request, reply) => {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  if (Math.random() < FAILURE_RATE) {
    return reply.status(503).send({ error: "simulated upstream failure" });
  }

  return reply.status(200).send({
    received: request.body ?? null,
    processedAt: new Date().toISOString(),
  });
});

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`mock-partner-api listening on :${PORT} (failureRate=${FAILURE_RATE})`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
