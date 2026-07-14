/**
 * Standalone error reporter for React error boundaries (app/error.tsx,
 * app/(app)/error.tsx). Deliberately independent of the debugLogger
 * singleton's init/buffer state — a boundary can fire in a context where
 * the providers that call debugLogger.init() have already unmounted (most
 * notably the root-level boundary, which replaces the entire document),
 * so this does a single direct POST to the same /api/debug/ingest endpoint
 * rather than relying on debugLogger's buffer being alive.
 *
 * Reuses debugLogger's session id (same sessionStorage key) so a boundary
 * report lands in the same session as any telemetry already collected.
 */

import { INGEST_URL, getOrCreateSessionId, type ErrorEvent } from '@/lib/debug-logger';
import { redactPII, redactContext } from '@/lib/pii-redact';

export function reportClientError(
  error: Error & { digest?: string },
  context: Record<string, unknown> = {}
): void {
  try {
    const event: ErrorEvent = {
      type: 'error',
      level: 'error',
      message: redactPII((error.message || 'Unknown error').slice(0, 2000)),
      context: redactContext({ page: window.location.pathname, digest: error.digest ?? null, ...context }),
      stack: error.stack ?? null,
      timestamp: new Date().toISOString(),
    };

    const payload = {
      sessionId: getOrCreateSessionId(),
      userId: null, // server derives the real user_id from the auth cookie
      events: [event],
    };

    fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Silently discard — an error reporter must never itself throw or retry-loop
    });
  } catch {
    // Never throw from an error reporter
  }
}
