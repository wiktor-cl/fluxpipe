export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures (in closed state) before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing a half-open trial. */
  resetTimeoutMs?: number;
  /** Consecutive successes in half-open needed to fully close the circuit. */
  halfOpenSuccessesToClose?: number;
  /** Injectable clock, so tests can simulate time passing deterministically. */
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(message = "circuit breaker is open") {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private consecutiveHalfOpenSuccesses = 0;
  private openedAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessesToClose: number;
  private readonly now: () => number;
  private listeners: Array<(state: CircuitState) => void> = [];

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessesToClose = options.halfOpenSuccessesToClose ?? 1;
    this.now = options.now ?? Date.now;
  }

  /** Reading the state can itself trigger the open -> half_open transition once the timeout elapses. */
  getState(): CircuitState {
    if (this.state === "open" && this.now() - this.openedAt >= this.resetTimeoutMs) {
      this.transitionTo("half_open");
    }
    return this.state;
  }

  onStateChange(listener: (state: CircuitState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((registered) => registered !== listener);
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.getState() === "open") {
      throw new CircuitOpenError();
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      this.consecutiveHalfOpenSuccesses += 1;
      if (this.consecutiveHalfOpenSuccesses >= this.halfOpenSuccessesToClose) {
        this.consecutiveFailures = 0;
        this.consecutiveHalfOpenSuccesses = 0;
        this.transitionTo("closed");
      }
      return;
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    if (this.state === "half_open") {
      this.transitionTo("open");
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(state: CircuitState): void {
    if (state === this.state) return;
    this.state = state;
    if (state === "open") {
      this.openedAt = this.now();
      this.consecutiveHalfOpenSuccesses = 0;
    }
    for (const listener of this.listeners) listener(state);
  }
}
