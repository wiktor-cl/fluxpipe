import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      await deps.statsRedis.ping();
      return reply.send({ status: "ok" });
    } catch (err) {
      return reply
        .status(503)
        .send({ status: "unavailable", error: err instanceof Error ? err.message : String(err) });
    }
  });
}
