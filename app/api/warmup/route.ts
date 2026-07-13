/**
 * GET /api/warmup — keeps the Supabase connection pool warm so users never
 * hit an 8-10s cold start. Protected by optional CRON_SECRET (Vercel sends
 * it automatically on scheduled invocations); falls open when unset so it
 * can be invoked manually during diagnosis.
 *
 * Currently superseded by a Supabase pg_cron job that runs an equivalent
 * SELECT every 5 minutes inside the database. Kept as a manual probe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const start = Date.now();
  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('titles').select('id', { head: true, count: 'exact' });
    if (error) throw error;
    return NextResponse.json({ ok: true, latency_ms: Date.now() - start, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[warmup]', err);
    await logServerError({ errorType: 'api:warmup', error: err, severity: 'high' });
    return NextResponse.json({ ok: false, error: 'Warmup failed', latency_ms: Date.now() - start }, { status: 500 });
  }
}
