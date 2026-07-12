import { CircuitBreaker } from "@fluxpipe/shared";

export function createCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 5),
    resetTimeoutMs: Number(process.env.CIRCUIT_RESET_TIMEOUT_MS ?? 15_000),
    halfOpenSuccessesToClose: Number(process.env.CIRCUIT_HALF_OPEN_SUCCESSES ?? 1),
  });
}
