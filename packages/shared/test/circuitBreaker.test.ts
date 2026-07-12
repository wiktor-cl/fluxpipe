import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/circuitBreaker.js";

function failing(message = "boom") {
  return async () => {
    throw new Error(message);
  };
}

function succeeding<T>(value: T) {
  return async () => value;
}

describe("CircuitBreaker", () => {
  it("starts closed", () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after failureThreshold consecutive failures", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });

    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    expect(breaker.getState()).toBe("closed");
    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    expect(breaker.getState()).toBe("closed");
    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    expect(breaker.getState()).toBe("open");
  });

  it("rejects immediately with CircuitOpenError while open, without calling fn", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    expect(breaker.getState()).toBe("open");

    const fn = vi.fn(async () => "should not run");
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("transitions open -> half_open once resetTimeoutMs elapses", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
      now: () => now,
    });

    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    expect(breaker.getState()).toBe("open");

    now += 5_000;
    expect(breaker.getState()).toBe("open"); // not yet elapsed

    now += 5_001;
    expect(breaker.getState()).toBe("half_open");
  });

  it("half_open -> closed after enough consecutive successes", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1_000,
      halfOpenSuccessesToClose: 2,
      now: () => now,
    });

    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    now += 1_001;
    expect(breaker.getState()).toBe("half_open");

    await breaker.execute(succeeding("ok"));
    expect(breaker.getState()).toBe("half_open"); // only 1 of 2 successes so far

    await breaker.execute(succeeding("ok"));
    expect(breaker.getState()).toBe("closed");
  });

  it("half_open -> open immediately on a single trial failure", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1_000,
      now: () => now,
    });

    await expect(breaker.execute(failing())).rejects.toThrow("boom");
    now += 1_001;
    expect(breaker.getState()).toBe("half_open");

    await expect(breaker.execute(failing("still broken"))).rejects.toThrow("still broken");
    expect(breaker.getState()).toBe("open");
  });

  it("resets the consecutive failure counter on success while closed", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });

    await expect(breaker.execute(failing())).rejects.toThrow();
    await expect(breaker.execute(failing())).rejects.toThrow();
    await breaker.execute(succeeding("ok")); // resets counter
    await expect(breaker.execute(failing())).rejects.toThrow();
    await expect(breaker.execute(failing())).rejects.toThrow();
    expect(breaker.getState()).toBe("closed"); // still only 2 consecutive since reset
  });

  it("emits state change events", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const seen: string[] = [];
    breaker.onStateChange((state) => seen.push(state));

    await expect(breaker.execute(failing())).rejects.toThrow();
    expect(seen).toEqual(["open"]);
  });
});
