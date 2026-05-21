// POST /api/cron/health-check
//
// Health check endpoint triggered by GitHub Actions every 5 minutes.
// Calls the health-monitor Supabase edge function to verify system health.
// Requires X-Vercel-Deployment-Url header from GitHub Actions.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const deploymentUrl = req.headers.get('X-Vercel-Deployment-Url');
  const monitorSecret = process.env.MONITOR_SECRET;

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
    const healthMonitorUrl = process.env.SUPABASE_FUNCTION_URL
      ? `${process.env.SUPABASE_FUNCTION_URL}/health-monitor`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health-monitor`;

    const response = await fetch(healthMonitorUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${monitorSecret}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
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

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
