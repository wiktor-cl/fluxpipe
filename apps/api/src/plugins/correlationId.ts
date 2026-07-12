import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

const HEADER = "x-correlation-id";

/**
 * Not registered via app.register() on purpose - it mutates `app` directly
 * so the onRequest hook applies at the root encapsulation context instead of
 * being scoped to a child plugin instance.
 */
export async function correlationIdPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("correlationId", "");

  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers[HEADER];
    const correlationId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    request.correlationId = correlationId;
    request.log = request.log.child({ correlationId });
    reply.header(HEADER, correlationId);
  });
}
