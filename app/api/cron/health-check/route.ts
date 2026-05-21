/**
 * POST /api/cron/health-check
 *
 * Vercel Cron Job: Triggers health-monitor edge function every 5 minutes.
 * Configured in vercel.json as: { path: "/api/cron/health-check", schedule: "*/5 * * * *" }
 *
 * This endpoint:
 * 1. Verifies the request comes from Vercel (via X-Vercel-Deployment-Url header)
 * 2. Calls the health-monitor edge function with MONITOR_SECRET
 * 3. Returns the health check results
 *
 * Cron payloads from Vercel include:
 *   X-Vercel-Deployment-Url: https://movieknight.ca
 *   Authorization: Bearer {CRON_SECRET} (if set)
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Only allow POST requests from Vercel cron scheduler
export async function POST(req: NextRequest) {
  const deploymentUrl = req.headers.get('X-Vercel-Deployment-Url');
  const monitorSecret = process.env.MONITOR_SECRET;

  // ── Verify request is from Vercel (deployment URL header) ────────────────
  if (!deploymentUrl) {
    return NextResponse.json(
      { error: 'Missing X-Vercel-Deployment-Url header' },
      { status: 401 }
    );
  }

  if (!monitorSecret) {
    return NextResponse.json(
      { error: 'MONITOR_SECRET not configured' },
      { status: 503 }
    );
  }

  try {
    // ── Call health-monitor edge function ────────────────────────────────
    const healthMonitorUrl = process.env.SUPABASE_FUNCTION_URL
      ? `${process.env.SUPABASE_FUNCTION_URL}/health-monitor`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health-monitor`;

    const response = await fetch(healthMonitorUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${monitorSecret}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      console.error('[cron/health-check] health-monitor returned:', response.status);
    }

    const data = await response.json();

    return NextResponse.json({
      success: response.ok,
      message: 'Health check triggered',
      status: data.status,
      checks: data.checks,
    });
  } catch (err) {
    console.error('[cron/health-check] Error calling health-monitor:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// Reject GET and other methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
