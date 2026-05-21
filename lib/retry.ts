// Retry logic with exponential backoff + jitter.
// Retries on: AbortError (timeout), network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT).
// Does NOT retry on: application errors, HTTP 4xx/5xx — use retryFetch for HTTP status retries.

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
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return (
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ENOTFOUND') ||
    err.message.includes('ETIMEDOUT')
  );
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

      if (!isRetryableError(err)) throw err;
      if (attempt === maxRetries) break;

      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, backoffMultiplier);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// Wraps fetch with retry on 429 (rate limited) and 503 (unavailable) in addition to network errors.
export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(async () => {
    const res = await fetch(url, init);
    if (res.status === 429 || res.status === 503) {
      throw new Error(`HTTP ${res.status} — retryable`);
    }
    return res;
  }, options);
}
