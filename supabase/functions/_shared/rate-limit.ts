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

  if (!url || !token) {
    // Upstash not configured — allow all requests (in-memory fallback below)
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
    });

    if (!res.ok) return true; // on HTTP error, allow

    const results = await res.json();
    const count = results[0]?.result as number;
    return count <= maxRequests;
  } catch {
    return true; // on network error, allow
  }
}
