import { afterEach, describe, expect, it } from "vitest";
import { CircuitBreaker } from "@fluxpipe/shared";
import { callExternalService } from "../src/externalService.js";
import { startFlakyServer, type MockServerHandle } from "./helpers.js";

describe("circuit breaker wired to the (real, loopback) external service call", () => {
  let handle: MockServerHandle;

  afterEach(() => {
    handle?.server.close();
  });

  it("opens after consecutive failures and fast-fails without hitting the server again", async () => {
    handle = await startFlakyServer(Infinity); // always fails
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 });
    const call = () => callExternalService({}, { baseUrl: handle.url });

    await expect(breaker.execute(call)).rejects.toThrow();
    await expect(breaker.execute(call)).rejects.toThrow();
    await expect(breaker.execute(call)).rejects.toThrow();
    expect(breaker.getState()).toBe("open");
    expect(handle.getCallCount()).toBe(3);

    // Circuit is open: further calls must fast-fail without ever reaching the server
    await expect(breaker.execute(call)).rejects.toMatchObject({ name: "CircuitOpenError" });
    expect(handle.getCallCount()).toBe(3); // unchanged
  });

  it("recovers through half-open once the external service starts succeeding again", async () => {
    handle = await startFlakyServer(2); // fails twice, then succeeds forever
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5_000, now: () => now });
    const call = () => callExternalService({ hello: "world" }, { baseUrl: handle.url });

    await expect(breaker.execute(call)).rejects.toThrow();
    await expect(breaker.execute(call)).rejects.toThrow();
    expect(breaker.getState()).toBe("open");

    now += 5_001; // resetTimeout elapsed
    expect(breaker.getState()).toBe("half_open");

    const result = await breaker.execute(call);
    expect(result).toMatchObject({ received: { hello: "world" } });
    expect(breaker.getState()).toBe("closed");
  });
});
