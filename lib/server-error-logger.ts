/**
 * Server-side (Next.js API route) error logger. Persists caught errors
 * directly to the error_logs table via the service-role client, bypassing
 * RLS — the same table client-side errors (lib/debug-logger.ts,
 * lib/client-error-report.ts) and edge-function errors
 * (supabase/functions/_shared/error-logger.ts) land in, so every runtime's
 * failures are visible in one place.
 *
 * Never throws — a logging failure must not mask or replace the original
 * error being reported.
 */

import { createSupabaseServiceClient } from '@/lib/supabase-server';

export interface ServerErrorLogInput {
  errorType: string;
  error: unknown;
  context?: Record<string, unknown> | null;
  userId?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export async function logServerError(input: ServerErrorLogInput): Promise<void> {
  try {
    const err = input.error;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? null : null;

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('error_logs').insert({
      user_id: input.userId ?? null,
      error_type: input.errorType,
      error_message: message.slice(0, 2000),
      stack_trace: stack,
      context: input.context ?? null,
      severity: input.severity ?? 'high',
    });
    if (error) {
      console.error(`[server-error-logger] insert failed for ${input.errorType}:`, error.message);
    }
  } catch (loggingErr) {
    console.error(`[server-error-logger] failed to persist error_log row for ${input.errorType}:`, loggingErr);
  }
}
