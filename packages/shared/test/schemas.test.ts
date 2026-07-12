import { describe, expect, it } from "vitest";
import { createJobRequestSchema, jobRecordSchema } from "../src/schemas.js";

describe("createJobRequestSchema", () => {
  it("accepts a minimal valid request and defaults payload to {}", () => {
    const parsed = createJobRequestSchema.parse({ type: "send-webhook" });
    expect(parsed).toEqual({ type: "send-webhook", payload: {} });
  });

  it("rejects an empty type", () => {
    const result = createJobRequestSchema.safeParse({ type: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing type", () => {
    const result = createJobRequestSchema.safeParse({ payload: { foo: "bar" } });
    expect(result.success).toBe(false);
  });

  it("accepts an arbitrary payload record", () => {
    const parsed = createJobRequestSchema.parse({
      type: "send-webhook",
      payload: { url: "https://example.com", retries: 3 },
    });
    expect(parsed.payload).toEqual({ url: "https://example.com", retries: 3 });
  });
});

describe("jobRecordSchema", () => {
  it("validates a full job record", () => {
    const record = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      idempotencyKey: "key-1",
      type: "send-webhook",
      payload: {},
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
      correlationId: "corr-1",
      result: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(jobRecordSchema.parse(record)).toMatchObject({ id: record.id, status: "queued" });
  });

  it("rejects an invalid status", () => {
    const record = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      idempotencyKey: "key-1",
      type: "send-webhook",
      payload: {},
      status: "not-a-real-status",
      attempts: 0,
      maxAttempts: 5,
      correlationId: "corr-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(jobRecordSchema.safeParse(record).success).toBe(false);
  });
});
