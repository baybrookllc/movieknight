// Shared error-logging helper for MovieKnight edge functions.
// Persists caught errors to the error_logs table — the same table
// client-side (lib/debug-logger.ts, lib/client-error-report.ts) and
// API-route (lib/server-error-logger.ts) errors land in, so every
// runtime's failures are visible in one place.
// Import: import { logEdgeError } from "../_shared/error-logger.ts";
//
// Never throws — a logging failure must not mask or replace the
// original error being reported.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Same targeted scrub as lib/pii-redact.ts (duplicated here since Deno edge
// functions can't import from the Next.js app's lib/ path aliases) — emails,
// bearer/JWT tokens, and inline password/token/secret key-value pairs.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const KEY_VALUE_SECRET_RE =
  /\b(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)(["']?\s*[:=]\s*["']?)([^"'\s,}&]+)/gi;

function redactPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(BEARER_RE, "Bearer [redacted-token]")
    .replace(JWT_RE, "[redacted-jwt]")
    .replace(KEY_VALUE_SECRET_RE, (_m, key, sep) => `${key}${sep}[redacted]`);
}

function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const out = { ...context };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string") out[key] = redactPII(out[key] as string);
  }
  return out;
}

export interface EdgeErrorInput {
  functionName: string;
  error: unknown;
  context?: Record<string, unknown>;
  userId?: string | null;
}

export async function logEdgeError(input: EdgeErrorInput): Promise<void> {
  try {
    const err = input.error;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? null : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("error_logs").insert({
      user_id: input.userId ?? null,
      error_type: `edge_function:${input.functionName}`,
      error_message: redactPII(message.slice(0, 2000)),
      stack_trace: stack,
      context: input.context ? redactContext(input.context) : null,
      severity: "high",
    });
    if (error) {
      console.error(`[error-logger] insert failed for ${input.functionName}:`, error.message);
    }
  } catch (loggingErr) {
    console.error(`[error-logger] failed to persist error_log row for ${input.functionName}:`, loggingErr);
  }
}
