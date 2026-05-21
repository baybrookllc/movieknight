// Circuit breaker pattern for external service calls in Deno edge functions
// Prevents cascading failures when a service is degraded
//
// States:
// - CLOSED: Normal operation, requests go through
// - OPEN: Service failed too many times, requests immediately rejected
// - HALF_OPEN: Testing if service recovered, allows 1 request to pass

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Failures before opening (default: 3)
  resetTimeoutMs?: number; // Time before trying to recover (default: 30000ms)
  monitoringWindowMs?: number; // Window for counting failures (default: 60000ms)
}

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private openedAt: number | null = null;

  private failureThreshold: number;
  private resetTimeoutMs: number;
  private monitoringWindowMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.monitoringWindowMs = options.monitoringWindowMs ?? 60000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN → HALF_OPEN
    if (this.state === "OPEN") {
      const now = Date.now();
      if (this.openedAt && now - this.openedAt >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        this.failureCount = 0;
      } else {
        throw new Error(`Circuit breaker OPEN — service unavailable`);
      }
    }

    try {
      const result = await fn();

      // Success — reset on HALF_OPEN, or do nothing on CLOSED
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.openedAt = null;
      }

      return result;
    } catch (err) {
      this.recordFailure();

      if (this.state === "HALF_OPEN") {
        // Failure during recovery attempt — reopen immediately
        this.state = "OPEN";
        this.openedAt = Date.now();
      }

      throw err;
    }
  }

  private recordFailure(): void {
    const now = Date.now();

    // Clear failures older than the monitoring window
    if (
      this.lastFailureTime &&
      now - this.lastFailureTime > this.monitoringWindowMs
    ) {
      this.failureCount = 1;
    } else {
      this.failureCount++;
    }

    this.lastFailureTime = now;

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = now;
    }
  }

  getState(): State {
    return this.state;
  }
}
