import type { JobRow } from "@fluxpipe/db";
import type { JobRecord } from "@fluxpipe/shared";

export function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    correlationId: row.correlationId,
    result: (row.result as Record<string, unknown> | null) ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
