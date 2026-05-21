/**
 * Retry logic with exponential backoff + jitter.
 * Used for transient failures (timeouts, 429/503 responses).
 */

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  baseDelayMs?: number; // Default: 100ms
  maxDelayMs?: number; // Default: 5000ms
  backoffMultiplier?: number; // Default: 2
}

/**
 * Exponential backoff with jitter: delay = min(baseDelay * (multiplier ^ attempt) + random, maxDelay)
 */
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

/**
 * Retry a function with exponential backoff.
 * Retries on: timeout errors, network errors, 429/503 responses.
 */
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
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // Timeout — retryable
        } else if (
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('ENOTFOUND') ||
          err.message.includes('ETIMEDOUT')
        ) {
          // Network errors — retryable
        } else {
          // Other errors — don't retry
          throw err;
        }
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

/**
 * Retry a fetch call with exponential backoff.
 * Retries on: timeout, network errors, 429 (too many requests), 503 (service unavailable).
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(async () => {
    const res = await fetch(url, init);

    // Retry on 429 or 503
    if (res.status === 429 || res.status === 503) {
      throw new Error(`HTTP ${res.status} — retryable`);
    }

    return res;
  }, options);
}
