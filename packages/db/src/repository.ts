import { desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { jobs, type JobRow } from "./schema.js";

export interface CreateJobInput {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  correlationId: string;
  maxAttempts?: number;
}

export interface CreateJobResult {
  job: JobRow;
  created: boolean;
}

export class JobsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Inserts a job unless one already exists for this idempotency key, in a single
   * atomic statement (ON CONFLICT DO NOTHING). This is the source of truth for
   * dedup - the queue's own jobId dedup is a secondary safety net, not the primary
   * mechanism, because it does not persist status/results across job removal.
   */
  async createIfNotExists(input: CreateJobInput): Promise<CreateJobResult> {
    const inserted = await this.db
      .insert(jobs)
      .values({
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        payload: input.payload,
        correlationId: input.correlationId,
        maxAttempts: input.maxAttempts ?? 5,
      })
      .onConflictDoNothing({ target: jobs.idempotencyKey })
      .returning();

    const insertedRow = inserted[0];
    if (insertedRow) {
      return { job: insertedRow, created: true };
    }

    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!existing) {
      throw new Error(
        `Idempotency key conflict but no existing row found for key ${input.idempotencyKey}`,
      );
    }
    return { job: existing, created: false };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<JobRow | undefined> {
    const rows = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, idempotencyKey))
      .limit(1);
    return rows[0];
  }

  async findById(id: string): Promise<JobRow | undefined> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return rows[0];
  }

  async markActive(id: string): Promise<void> {
    await this.db.update(jobs).set({ status: "active", updatedAt: new Date() }).where(eq(jobs.id, id));
  }

  async markCompleted(id: string, result: Record<string, unknown>): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "completed", result, lastError: null, updatedAt: new Date() })
      .where(eq(jobs.id, id));
  }

  async markFailedAttempt(id: string, attempts: number, error: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "failed", attempts, lastError: error, updatedAt: new Date() })
      .where(eq(jobs.id, id));
  }

  async markDeadLetter(id: string, attempts: number, error: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "dead_letter", attempts, lastError: error, updatedAt: new Date() })
      .where(eq(jobs.id, id));
  }

  async listDeadLetter(limit = 50): Promise<JobRow[]> {
    return this.db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "dead_letter"))
      .orderBy(desc(jobs.updatedAt))
      .limit(limit);
  }

  async requeueFromDeadLetter(id: string): Promise<JobRow | undefined> {
    const rows = await this.db
      .update(jobs)
      .set({ status: "queued", attempts: 0, lastError: null, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return rows[0];
  }
}
