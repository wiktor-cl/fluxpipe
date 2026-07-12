import { describe, expect, it } from "vitest";
import { computeBackoffDelay } from "../src/backoff.js";

describe("computeBackoffDelay", () => {
  it("throws for attemptsMade < 1", () => {
    expect(() => computeBackoffDelay(0)).toThrow(RangeError);
  });

  it("grows exponentially with attempts, bounded by equal jitter", () => {
    // random() pinned to 0 and 1 gives the lower/upper bound of the jitter window
    const lowerBound1 = computeBackoffDelay(1, { baseMs: 1000, factor: 2 }, () => 0);
    const upperBound1 = computeBackoffDelay(1, { baseMs: 1000, factor: 2 }, () => 1);
    expect(lowerBound1).toBe(500); // half of 1000
    expect(upperBound1).toBe(1000); // full exponential

    const lowerBound2 = computeBackoffDelay(2, { baseMs: 1000, factor: 2 }, () => 0);
    const upperBound2 = computeBackoffDelay(2, { baseMs: 1000, factor: 2 }, () => 1);
    expect(lowerBound2).toBe(1000); // half of 2000
    expect(upperBound2).toBe(2000);

    const lowerBound3 = computeBackoffDelay(3, { baseMs: 1000, factor: 2 }, () => 0);
    const upperBound3 = computeBackoffDelay(3, { baseMs: 1000, factor: 2 }, () => 1);
    expect(lowerBound3).toBe(2000); // half of 4000
    expect(upperBound3).toBe(4000);
  });

  it("caps the exponential growth at maxMs", () => {
    const delay = computeBackoffDelay(10, { baseMs: 1000, factor: 2, maxMs: 5000 }, () => 1);
    expect(delay).toBe(5000);
  });

  it("always returns a value within [half, full] of the capped exponential", () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      for (const rand of [0, 0.25, 0.5, 0.75, 1]) {
        const delay = computeBackoffDelay(attempt, { baseMs: 200, factor: 2, maxMs: 10_000 }, () => rand);
        const exponential = Math.min(10_000, 200 * 2 ** (attempt - 1));
        expect(delay).toBeGreaterThanOrEqual(Math.round(exponential / 2));
        expect(delay).toBeLessThanOrEqual(exponential);
      }
    }
  });
});
