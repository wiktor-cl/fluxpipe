export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
}

const DEFAULT_OPTIONS: Required<BackoffOptions> = {
  baseMs: 500,
  maxMs: 30_000,
  factor: 2,
};

/**
 * Exponential backoff with "equal jitter" (AWS-style): half the exponential
 * delay is fixed, the other half is randomized. This keeps a floor on the
 * delay (avoiding thundering-herd retries too close together) while still
 * spreading retries out to avoid synchronized retry storms.
 */
export function computeBackoffDelay(
  attemptsMade: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  if (attemptsMade < 1) {
    throw new RangeError("attemptsMade must be >= 1");
  }
  const { baseMs, maxMs, factor } = { ...DEFAULT_OPTIONS, ...options };
  const exponential = Math.min(maxMs, baseMs * factor ** (attemptsMade - 1));
  const half = exponential / 2;
  return Math.round(half + random() * half);
}
