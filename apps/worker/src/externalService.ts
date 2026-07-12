export class ExternalServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ExternalServiceError";
    this.status = status;
  }
}

export interface CallExternalServiceOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export async function callExternalService(
  payload: unknown,
  options: CallExternalServiceOptions,
): Promise<Record<string, unknown>> {
  const { baseUrl, timeoutMs = 5000 } = options;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ExternalServiceError(
      `external service request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new ExternalServiceError(`external service responded with status ${response.status}`, response.status);
  }

  return (await response.json()) as Record<string, unknown>;
}
