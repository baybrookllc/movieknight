/**
 * POST /api/debug/ingest — receives batched browser telemetry from
 * lib/debug-logger.ts and fans events out to the matching Supabase tables.
 *
 * The client-supplied `userId` is IGNORED. The real user_id is derived
 * server-side from the Supabase auth cookie so a malicious caller cannot
 * forge logs attributed to another user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient, getVerifiedUserId } from '@/lib/supabase-server';
import type {
  ConsoleEvent, ErrorEvent, NetworkEvent, PerfEvent,
  DebugEvent, LogLevel,
} from '@/lib/debug-logger';

export const runtime = 'nodejs';

interface IngestBody {
  sessionId: string;
  events: DebugEvent[];
}

let supabaseInstance: ReturnType<typeof createSupabaseServiceClient> | null = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseServiceClient();
  }
  return supabaseInstance;
}

function toSeverity(level: LogLevel): 'high' | 'medium' | 'low' {
  if (level === 'error') return 'high';
  if (level === 'warn') return 'medium';
  return 'low';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: IngestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || !Array.isArray(body.events)) {
      return NextResponse.json({ error: 'Body must contain an "events" array' }, { status: 400 });
    }
    if (body.events.length === 0) {
      return NextResponse.json({ ok: true, ingested: 0 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase env vars not configured' }, { status: 500 });
    }

    const supabase = getSupabaseClient();
    const userId = await getVerifiedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { sessionId, events } = body;

    const consoleRows: Record<string, unknown>[] = [];
    const errorRows: Record<string, unknown>[] = [];
    const networkRows: Record<string, unknown>[] = [];
    const perfRows: Record<string, unknown>[] = [];

    for (const e of events) {
      switch (e.type) {
        case 'console': {
          const c = e as ConsoleEvent;
          consoleRows.push({
            session_id: sessionId, user_id: userId,
            level: c.level, message: c.message,
            context: c.context ?? null, stack_trace: c.stack ?? null,
            timestamp: c.timestamp,
          });
          break;
        }
        case 'error': {
          const err = e as ErrorEvent;
          errorRows.push({
            session_id: sessionId, user_id: userId,
            error_type: 'client_error',
            error_message: err.message,
            stack_trace: err.stack ?? null,
            context: err.context ?? null,
            severity: toSeverity(err.level ?? 'error'),
            timestamp: err.timestamp,
          });
          break;
        }
        case 'network': {
          const n = e as NetworkEvent;
          networkRows.push({
            session_id: sessionId, user_id: userId,
            url: n.url, method: n.method,
            status_code: n.status, response_time_ms: n.responseTime,
            timestamp: n.timestamp,
          });
          break;
        }
        case 'perf': {
          const p = e as PerfEvent;
          perfRows.push({
            session_id: sessionId, user_id: userId,
            metric_name: p.metricName, value: p.value,
            page: p.context?.page ?? null,
            timestamp: p.timestamp,
          });
          break;
        }
      }
    }

    const tables: Array<[string, Record<string, unknown>[]]> = [
      ['debug_logs', consoleRows],
      ['error_logs', errorRows],
      ['network_metrics', networkRows],
      ['performance_metrics', perfRows],
    ];
    const inserts = tables
      .filter(([, rows]) => rows.length > 0)
      .map(async ([table, rows]) => {
        const { error } = await supabase.from(table).insert(rows);
        return error ? 0 : rows.length;
      });

    const results = await Promise.allSettled(inserts);
    const ingested = results.reduce(
      (sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0),
      0
    );

    return NextResponse.json({ ok: true, ingested });
  } catch (err) {
    console.error('[debug/ingest]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
