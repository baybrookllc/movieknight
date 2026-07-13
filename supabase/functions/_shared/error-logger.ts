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
      error_message: message.slice(0, 2000),
      stack_trace: stack,
      context: input.context ?? null,
      severity: "high",
    });
    if (error) {
      console.error(`[error-logger] insert failed for ${input.functionName}:`, error.message);
    }
  } catch (loggingErr) {
    console.error(`[error-logger] failed to persist error_log row for ${input.functionName}:`, loggingErr);
  }
}
