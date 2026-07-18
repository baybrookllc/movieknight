// notify-watchlist — weekly digest edge function
// Triggered by Supabase cron or HTTP POST from scheduler
// Sends personalised "new titles matching your taste" emails via Resend
//
// Secrets required:
//   RESEND_API_KEY   — from resend.com dashboard
//   NOTIFY_SECRET    — shared secret for cron-triggered calls
//
// Deploy: supabase functions deploy notify-watchlist
// Set cron in Supabase Dashboard → Edge Functions → Schedules:
//   schedule: 0 17 * * 5   (every Friday at 5pm UTC)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logEdgeError } from '../_shared/error-logger.ts';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!;
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';
// Set FROM_EMAIL via: supabase secrets set FROM_EMAIL="MovieKnight <your@verified-domain.com>"
// Until a verified domain is configured, Resend only delivers to the Resend account owner's email.
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'MovieKnight <onboarding@resend.dev>';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// Map genre_id → category name for email copy
const GENRE_LABELS: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 14: 'Fantasy',
  27: 'Horror', 10749: 'Romance', 878: 'Sci-Fi', 9648: 'Mystery',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

serve(async (req) => {
  // Auth check — cron calls pass the secret as a Bearer token.
  // FAIL CLOSED: if secret is unset or mismatched, deny.
  const auth = req.headers.get('Authorization') ?? '';
  if (!NOTIFY_SECRET) {
    console.error('[notify-watchlist] NOTIFY_SECRET env var not set — refusing to run');
    return new Response('Server misconfigured', { status: 503 });
  }
  if (auth !== `Bearer ${NOTIFY_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const results = await runDigest();
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-watchlist]', err);
    await logEdgeError({ functionName: 'notify-watchlist', error: err });
    // Don't expose internal error details (may include email addresses from Resend responses)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});

interface DigestPickRow {
  user_id: string;
  display_name: string | null;
  top_genre_ids: number[];
  title_id: string;
  title: string;
  overview: string | null;
  media_type: string;
  vote_average: number;
  score: number;
}

async function runDigest() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // One set-based RPC computes every eligible user's picks (eligibility,
  // top genres, already-watched exclusion, scoring — same formula as the
  // For You feed), replacing the former 2-queries-per-user loop.
  const { data: picks, error } = await sb.rpc('get_weekly_digest_picks', {
    p_since: since,
    p_per_user: 5,
  });
  if (error) throw error;
  if (!picks?.length) return { sent: 0, skipped: 'no eligible users or no new titles this week' };

  const byUser = new Map<string, DigestPickRow[]>();
  for (const row of picks as DigestPickRow[]) {
    const rows = byUser.get(row.user_id) ?? [];
    rows.push(row);
    byUser.set(row.user_id, rows);
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [userId, rows] of byUser) {
    try {
      // Get user email via auth admin API
      const { data: userData } = await sb.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) continue;

      const titles = rows.map(r => ({
        id: r.title_id,
        title: r.title,
        overview: r.overview ?? '',
        media_type: r.media_type,
        vote_average: r.vote_average,
      }));
      await sendDigestEmail(email, rows[0].display_name ?? 'there', titles, rows[0].top_genre_ids ?? []);
      sent++;
    } catch (e) {
      // Log full error server-side but only return count in response (may contain PII)
      console.error('[notify-watchlist] send error:', e);
      errors.push('send_failed');
    }
  }

  return { sent, errors: errors.length ? errors : undefined };
}

/** HTML-escape user-controlled strings to prevent email injection / rendering issues */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendDigestEmail(
  to: string,
  name: string,
  titles: Array<{ title: string; overview: string; vote_average: number; media_type: string; id: string }>,
  topGenreIds: number[],
) {
  const topGenreNames = topGenreIds
    .map(id => GENRE_LABELS[id])
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

  const titleRows = titles.map(t => {
    const type = t.media_type === 'tv' ? 'TV Series' : 'Movie';
    const rating = t.vote_average ? `⭐ ${t.vote_average.toFixed(1)}` : '';
    const blurb = t.overview ? escHtml(t.overview.substring(0, 100)) + '…' : '';
    return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #1e1e2e">
          <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">${escHtml(t.title)}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${type} ${rating}</div>
          <div style="font-size:13px;color:#a1a1aa;line-height:1.5">${blurb}</div>
        </td>
      </tr>`;
  }).join('');

  const safeName = escHtml(name);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0B0B0F;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="100%" style="max-width:520px">

        <!-- Header -->
        <tr><td style="padding-bottom:32px">
          <div style="font-size:22px;font-weight:900;letter-spacing:1px;color:#fff">
            CINE<span style="color:#FF2E63">STREAM</span>
          </div>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:24px">
          <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#fff;line-height:1.2">
            Your weekly picks, ${safeName} 🎬
          </h1>
          <p style="margin:0;font-size:14px;color:#6b7280">
            ${topGenreNames ? `Based on your love of ${escHtml(topGenreNames)}` : 'Handpicked for you this week'}
          </p>
        </td></tr>

        <!-- Titles -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${titleRows}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:32px 0">
          <a href="https://cinestream-app-lake.vercel.app/v2"
             style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4158D0,#C850C0,#FF2E63);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:99px">
            Open MovieKnight
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;border-top:1px solid #1e1e2e">
          <p style="margin:0;font-size:11px;color:#374151;line-height:1.6">
            You're receiving this because you enabled weekly digests in MovieKnight.<br>
            <a href="https://cinestream-app-lake.vercel.app/v2" style="color:#6b7280">Manage preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject: `Your weekly picks are here 🎬`, html }),
    signal: AbortSignal.timeout(10000), // 10s timeout for email send
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}
