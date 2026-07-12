const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export type CircuitState = "closed" | "open" | "half_open";

export interface StatsResponse {
  jobs: QueueCounts;
  dlq: QueueCounts;
  circuitBreaker: CircuitState;
}

export interface JobRecord {
  id: string;
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  result: Record<string, unknown> | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `request to ${path} failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchStats(): Promise<StatsResponse> {
  return request<StatsResponse>("/stats");
}

export function fetchDlq(): Promise<{ jobs: JobRecord[] }> {
  return request<{ jobs: JobRecord[] }>("/dlq");
}

export function retryDlqJob(id: string): Promise<JobRecord> {
  return request<JobRecord>(`/dlq/${id}/retry`, { method: "POST" });
}
