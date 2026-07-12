import { z } from "zod";

export const jobStatusSchema = z.enum([
  "queued",
  "active",
  "completed",
  "failed",
  "dead_letter",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const createJobRequestSchema = z.object({
  type: z.string().min(1, "type is required"),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export const jobRecordSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  status: jobStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  correlationId: z.string(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  lastError: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRecord = z.infer<typeof jobRecordSchema>;

export const queueCountsSchema = z.object({
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
});
export type QueueCounts = z.infer<typeof queueCountsSchema>;

export const statsResponseSchema = z.object({
  jobs: queueCountsSchema,
  dlq: queueCountsSchema,
  circuitBreaker: z.enum(["closed", "open", "half_open"]),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;
