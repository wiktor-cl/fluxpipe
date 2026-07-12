import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, DATABASE_URL, REDIS_URL, type TestContext } from "./setup.js";
import { isPostgresReachable, isRedisReachable } from "./testInfra.js";

const hasInfra = (await isPostgresReachable(DATABASE_URL)) && (await isRedisReachable(REDIS_URL));

describe.skipIf(!hasInfra)("POST /jobs idempotency", () => {
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

  it("does not create a second job when the same Idempotency-Key is replayed", async () => {
    const idempotencyKey = randomUUID();
    const payload = { type: "send-webhook", payload: { url: "https://example.com" } };

    const first = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "idempotency-key": idempotencyKey, "content-type": "application/json" },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();

    const second = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "idempotency-key": idempotencyKey, "content-type": "application/json" },
      payload,
    });
    expect(second.statusCode).toBe(200); // replay, not a new creation
    const secondBody = second.json();

    expect(secondBody.id).toBe(firstBody.id);

    const found = await ctx.repository.findByIdempotencyKey(idempotencyKey);
    expect(found?.id).toBe(firstBody.id);

    const counts = await ctx.jobsQueue.getJobCounts("waiting", "active", "delayed", "completed");
    const totalEnqueued = counts.waiting + counts.active + counts.delayed + counts.completed;
    expect(totalEnqueued).toBe(1); // only ever enqueued once, despite two POSTs
  });

  it("creates separate jobs for different Idempotency-Keys", async () => {
    const first = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "idempotency-key": randomUUID(), "content-type": "application/json" },
      payload: { type: "send-webhook", payload: {} },
    });
    const second = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "idempotency-key": randomUUID(), "content-type": "application/json" },
      payload: { type: "send-webhook", payload: {} },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().id).not.toBe(second.json().id);
  });

  it("rejects requests missing the Idempotency-Key header", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "content-type": "application/json" },
      payload: { type: "send-webhook", payload: {} },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an invalid body", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/jobs",
      headers: { "idempotency-key": randomUUID(), "content-type": "application/json" },
      payload: { payload: {} }, // missing required `type`
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 for an unknown job id", async () => {
    const response = await ctx.app.inject({ method: "GET", url: `/jobs/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
  });
});
