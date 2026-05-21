/**
 * GET /api/health
 *
 * Lightweight health check endpoint for UptimeRobot (polls every 5 min).
 * Checks: Supabase DB connectivity, env var presence.
 * Returns 200 OK with JSON payload when healthy.
 * Returns 503 with details when degraded.
 *
 * Does NOT check: external APIs (TMDB, OpenAI, Anthropic) — those are
 * best-effort and their failure is handled by timeout + retry + circuit breaker.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // ── 1. Env var check ─────────────────────────────────────────────────────
  const missingEnv = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  checks.env = {
    ok: missingEnv.length === 0,
    ...(missingEnv.length > 0 && { error: `Missing: ${missingEnv.join(', ')}` }),
  };

  // ── 2. Supabase DB ping (anon client, simple query) ──────────────────────
  try {
    const dbStart = Date.now();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await Promise.race([
      supabase.from('titles').select('id').limit(1),
      new Promise<{ error: Error }>((_, rej) =>
        setTimeout(() => rej(new Error('DB ping timeout (5s)')), 5000)
      ),
    ]) as any;

    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStart,
      ...(error && { error: String(error.message ?? error) }),
    };
  } catch (err) {
    checks.database = { ok: false, error: String(err) };
  }

  // ── Evaluate overall health ───────────────────────────────────────────────
  const allOk = Object.values(checks).every((c) => c.ok);
  const totalMs = Date.now() - start;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks,
      uptimeMs: totalMs,
      ts: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
