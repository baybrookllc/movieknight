// health-monitor — periodic health check + Slack alert edge function
//
// Triggered by Supabase cron every 5 minutes.
// Checks: Supabase DB ping, app /api/health, TMDB reachability.
// Sends Slack alert when any check fails.
//
// Secrets required:
//   MONITOR_SECRET      — shared secret for cron calls (Bearer token)
//   SLACK_WEBHOOK_URL   — from Slack > Incoming Webhooks app
//   TMDB_API_KEY        — for TMDB reachability check
//
// Deploy: supabase functions deploy health-monitor
// Cron in Supabase Dashboard → Edge Functions → Schedules:
//   schedule: */5 * * * *

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { makeCors } from '../_shared/cors-utils.ts';

const MONITOR_SECRET = Deno.env.get('MONITOR_SECRET') ?? '';
const SLACK_WEBHOOK  = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const TMDB_API_KEY   = Deno.env.get('TMDB_API_KEY') ?? '';
const APP_URL        = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://movieknight.ca';

// Module-level client — reused across invocations within the same isolate
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const cors = makeCors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (!MONITOR_SECRET) {
    console.error('[health-monitor] MONITOR_SECRET not set');
    return new Response('Server misconfigured', { status: 503 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${MONITOR_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results = await runChecks();
  const allOk = Object.values(results).every((r) => r.ok);

  if (!allOk && SLACK_WEBHOOK) {
    await sendSlackAlert(results);
  }

  return new Response(
    JSON.stringify({ status: allOk ? 'ok' : 'degraded', checks: results }),
    { status: allOk ? 200 : 503, headers: { 'Content-Type': 'application/json', ...cors } }
  );
});

async function runChecks(): Promise<Record<string, CheckResult>> {
  // Run all checks in parallel — they are fully independent
  const [database, app, tmdb] = await Promise.all([
    check('database', async () => {
      const { error } = await sb.from('titles').select('id').limit(1);
      if (error) throw new Error(error.message);
    }),
    check('app', async () => {
      const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    TMDB_API_KEY
      ? check('tmdb', async () => {
          const res = await fetch(
            `https://api.themoviedb.org/3/configuration?api_key=${TMDB_API_KEY}`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
        })
      : Promise.resolve(null),
  ]);

  const results: Record<string, CheckResult> = { database, app };
  if (tmdb) results.tmdb = tmdb;
  return results;
}

async function check(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    console.error(`[health-monitor] ${name} failed:`, err);
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendSlackAlert(checks: Record<string, CheckResult>): Promise<void> {
  const failing = Object.entries(checks)
    .filter(([, r]) => !r.ok)
    .map(([name, r]) => `• *${name}*: ${r.error ?? 'failed'} (${r.latencyMs}ms)`)
    .join('\n');

  const payload = {
    text: `🔴 *Movieknight health check degraded*`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `🔴 *Movieknight health check degraded*\n${failing}` },
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}> · <${APP_URL}/api/health|View health endpoint>`,
        }],
      },
    ],
  };

  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[health-monitor] Slack alert failed:', err);
  }
}
