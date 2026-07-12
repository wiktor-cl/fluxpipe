import client from "prom-client";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    metricsStartTime?: bigint;
  }
}

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "fluxpipe_api_" });

export const httpRequestsTotal = new client.Counter({
  name: "fluxpipe_api_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: "fluxpipe_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export async function metricsPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("metricsStartTime", undefined);

  app.addHook("onRequest", async (request) => {
    request.metricsStartTime = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (request, reply) => {
    const start = request.metricsStartTime;
    const durationSeconds = start ? Number(process.hrtime.bigint() - start) / 1e9 : 0;
    const route = request.routeOptions.url ?? request.url;
    const labels = { method: request.method, route, status: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });
}
