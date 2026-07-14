/**
 * Lightweight PII scrubber for text headed into telemetry storage
 * (lib/debug-logger.ts's console/error capture). Not an exhaustive PII
 * classifier — targeted at what actually leaks through `console.log`
 * during debugging in this app: email addresses, bearer/JWT tokens, and
 * inline "password"/"token"/"secret" key-value pairs. Applied before
 * anything is buffered for /api/debug/ingest, not after.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
// Matches `password: "x"`, `password=x`, `"token":"x"`, etc. — redacts only the value.
const KEY_VALUE_SECRET_RE =
  /\b(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)(["']?\s*[:=]\s*["']?)([^"'\s,}&]+)/gi;

export function redactPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(BEARER_RE, 'Bearer [redacted-token]')
    .replace(JWT_RE, '[redacted-jwt]')
    .replace(KEY_VALUE_SECRET_RE, (_m, key, sep) => `${key}${sep}[redacted]`);
}

/** Shallow-redacts every string value in a context/metadata object. */
export function redactContext<T extends Record<string, unknown>>(context: T): T {
  const out = { ...context };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value === 'string') {
      (out as Record<string, unknown>)[key] = redactPII(value);
    }
  }
  return out;
}
