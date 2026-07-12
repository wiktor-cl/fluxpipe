import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, DATABASE_URL, REDIS_URL, type TestContext } from "./setup.js";
import { isPostgresReachable, isRedisReachable } from "./testInfra.js";

const hasInfra = (await isPostgresReachable(DATABASE_URL)) && (await isRedisReachable(REDIS_URL));

describe.skipIf(!hasInfra)("DLQ routes", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanupBetweenTests();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it("lists dead-lettered jobs and allows retrying one", async () => {
    const { job } = await ctx.repository.createIfNotExists({
      idempotencyKey: randomUUID(),
      type: "send-webhook",
      payload: { foo: "bar" },
      correlationId: randomUUID(),
      maxAttempts: 3,
    });
    await ctx.repository.markDeadLetter(job.id, 3, "boom");

    const listResponse = await ctx.app.inject({ method: "GET", url: "/dlq" });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as { jobs: Array<{ id: string }> };
    expect(listBody.jobs.some((row) => row.id === job.id)).toBe(true);

    const retryResponse = await ctx.app.inject({ method: "POST", url: `/dlq/${job.id}/retry` });
    expect(retryResponse.statusCode).toBe(200);
    const retried = retryResponse.json();
    expect(retried.status).toBe("queued");
    expect(retried.attempts).toBe(0);

    const counts = await ctx.jobsQueue.getJobCounts("waiting", "active", "delayed");
    expect(counts.waiting + counts.active + counts.delayed).toBe(1);
  });

  it("returns 409 when retrying a job that is not dead-lettered", async () => {
    const { job } = await ctx.repository.createIfNotExists({
      idempotencyKey: randomUUID(),
      type: "send-webhook",
      payload: {},
      correlationId: randomUUID(),
      maxAttempts: 3,
    });
    const response = await ctx.app.inject({ method: "POST", url: `/dlq/${job.id}/retry` });
    expect(response.statusCode).toBe(409);
  });

  it("returns 404 for an unknown job id", async () => {
    const response = await ctx.app.inject({ method: "POST", url: `/dlq/${randomUUID()}/retry` });
    expect(response.statusCode).toBe(404);
  });

  it("exposes queue counts and circuit breaker state via /stats", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/stats" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("jobs");
    expect(body).toHaveProperty("dlq");
    expect(["closed", "open", "half_open"]).toContain(body.circuitBreaker);
  });
});
