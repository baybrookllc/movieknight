/**
 * Upstash Redis rate limiter via REST API — no npm package required.
 *
 * Uses INCR + EXPIRE NX (fixed window) to count requests per key.
 * Falls back silently to "allow" when UPSTASH_REDIS_REST_URL / _TOKEN are unset,
 * so the function still works in local dev without Upstash configured.
 *
 * Env vars (set via `supabase secrets set`):
 *   UPSTASH_REDIS_REST_URL   — e.g. https://xxxxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — REST token from Upstash console
 */

import { logEdgeError } from "./error-logger.ts";

// Alert at most once per isolate lifetime — the fail-open condition is
// static per-isolate (env vars don't change mid-process), so logging it on
// every single request would just flood error_logs with an identical row.
let alertedThisIsolate = false;
function alertFailOpenOnce(key: string): void {
  if (alertedThisIsolate) return;
  alertedThisIsolate = true;
  logEdgeError({
    functionName: "rate-limit-shared",
    error: new Error("Rate limiter disabled — UPSTASH env vars not set, all requests allowed"),
    context: { key },
  }).catch(() => {});
}

/**
 * Check whether the caller is within their rate limit.
 *
 * @param key         Unique identifier for this rate limit bucket (e.g. IP or user ID)
 * @param maxRequests Maximum allowed requests in the window
 * @param windowSecs  Window length in seconds (e.g. 60)
 * @returns           true = allowed, false = rate limit exceeded
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSecs: number,
): Promise<boolean> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  // FAIL OPEN when intentionally unconfigured. If Upstash env vars are absent
  // we treat this as "no rate limiter wired up" rather than "block everyone",
  // because failing closed makes every endpoint return 429 to all callers and
  // breaks the entire app. Network/HTTP errors below still fail closed so a
  // misbehaving Upstash cannot be used to bypass real rate limits.
  if (!url || !token) {
    console.warn(
      "[checkRateLimit] UPSTASH env vars not set — allowing request (rate limiter disabled)"
    );
    alertFailOpenOnce(key);
    return true;
  }

  try {
    // Pipeline: INCR key, then EXPIRE key windowSecs NX (set only if no TTL yet)
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSecs, "NX"],
      ]),
      signal: AbortSignal.timeout(3000), // 3s timeout on Upstash call
    });

    if (!res.ok) {
      console.error("[checkRateLimit] Upstash HTTP error:", res.status);
      return false; // on HTTP error, fail closed
    }

    const results = await res.json();
    const count = results[0]?.result as number;
    return count <= maxRequests;
  } catch (err) {
    console.error("[checkRateLimit] Network/timeout error:", err);
    return false; // on network error, fail closed (deny)
  }
}
