// Retry logic with exponential backoff + jitter for Deno edge functions
// Retries on: timeout errors (AbortError), network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT)
// Does NOT retry on: application errors, HTTP error responses

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  baseDelayMs?: number; // Default: 100ms
  maxDelayMs?: number; // Default: 5000ms
  backoffMultiplier?: number; // Default: 2
}

function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(multiplier, attempt);
  const jitter = Math.random() * exponentialDelay * 0.1; // 10% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true; // Timeout
    const msg = err.message;
    if (
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ETIMEDOUT")
    ) {
      return true; // Network errors
    }
  }
  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on non-retryable errors
      if (!isRetryableError(err)) {
        throw err;
      }

      if (attempt === maxRetries) {
        break; // Last attempt, will throw below
      }

      const delayMs = calculateBackoffDelay(
        attempt,
        baseDelayMs,
        maxDelayMs,
        backoffMultiplier
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(async () => {
    const res = await fetch(url, init);

    // Retry on 429 (too many requests) or 503 (service unavailable)
    if (res.status === 429 || res.status === 503) {
      throw new Error(`HTTP ${res.status} — retryable`);
    }

    return res;
  }, options);
}
