// Shared utilities for CineStream Next.js app

export const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
export const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w1280';
export const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

/** Escape HTML for safe innerHTML use */
export function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Time-ago string from ISO date */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** Format runtime in minutes → human string */
export function fmtRuntime(mins: number | null, mediaType: string): string | null {
  if (!mins) return null;
  if (mediaType === 'tv') return `${mins} min/ep`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Format money amount */
export function fmtMoney(n: number | null): string | null {
  if (!n) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B USD`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M USD`;
  return `$${n.toLocaleString()} USD`;
}

/** Get DiceBear avatar URL */
export function getAvatarUrl(avatarId?: string | null, fallbackSeed?: string | null): string {
  const seed = avatarId || fallbackSeed || 'default';
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

/** Status label for watch history */
export function statusLabel(status: string): string {
  switch (status) {
    case 'want_to_watch': return 'Want to Watch';
    case 'watching':      return 'Watching';
    case 'watched':       return 'Watched';
    case 'dropped':       return 'Dropped';
    case 'not_interested': return 'Not Interested';
    default: return status;
  }
}

/** Status progress percentage for tracker bar */
export function statusProgress(status: string): number {
  switch (status) {
    case 'watching':       return 55;
    case 'watched':        return 100;
    case 'want_to_watch':  return 10;
    default: return 0;
  }
}

/** Get auth header — uses session JWT if available.
 *
 * Resolution order:
 * 1. supabase.auth.getSession() (fast when session is in localStorage)
 * 2. Manually read the Supabase SSR cookie (base64-encoded JSON) —
 *    needed when @supabase/ssr stores the session in httpOnly-style
 *    cookies that getSession() misses in the browser client.
 * 3. Empty header — callers that use supabase.functions.invoke() handle
 *    auth internally; this fallback only affects raw fetch() callers. */
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    // 1. Try the SDK first (covers localStorage-based sessions)
    const { supabase } = await import('@/lib/supabase');
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 2000));
    const result = await Promise.race([supabase.auth.getSession(), timeout]);
    const sdkToken = result?.data?.session?.access_token;
    if (sdkToken) return { Authorization: `Bearer ${sdkToken}` };

    // 2. SDK missed it — manually decode the Supabase SSR auth cookie.
    //    Format: sb-{projectRef}-auth-token = base64-<base64url(JSON)>
    if (typeof document !== 'undefined') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
      if (projectRef) {
        const cookieName = `sb-${projectRef}-auth-token`;
        const raw = document.cookie
          .split(';')
          .map(c => c.trim())
          .find(c => c.startsWith(`${cookieName}=`))
          ?.split('=').slice(1).join('=') ?? '';
        if (raw) {
          try {
            const b64 = raw.startsWith('base64-') ? raw.slice(7) : raw;
            const session = JSON.parse(atob(b64));
            const cookieToken = session?.access_token;
            const expiresAt: number = session?.expires_at ?? 0;
            if (cookieToken && expiresAt > Date.now() / 1000) {
              return { Authorization: `Bearer ${cookieToken}` };
            }
          } catch { /* malformed cookie — continue */ }
        }
      }
    }
  } catch { /* ignore */ }

  // 3. No session found — return empty (supabase.functions.invoke() handles
  //    its own auth; raw fetch() callers will get a 401 and should handle it)
  return {};
}

/** Truncate string to maxLen */
export function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/** Extract year from release_date */
export function releaseYear(dateStr: string | null | undefined): string {
  return (dateStr || '').slice(0, 4);
}

/** Country name map */
export const COUNTRY_NAMES: Record<string, string> = {
  US:'United States', CA:'Canada', GB:'United Kingdom', AU:'Australia',
  FR:'France', DE:'Germany', JP:'Japan', KR:'South Korea', CN:'China',
  IN:'India', IT:'Italy', ES:'Spain', MX:'Mexico', BR:'Brazil',
  SE:'Sweden', DK:'Denmark', NO:'Norway', NZ:'New Zealand', IE:'Ireland',
  NL:'Netherlands', PL:'Poland', AT:'Austria', CH:'Switzerland', BE:'Belgium',
  PT:'Portugal', RU:'Russia', TR:'Turkey', TH:'Thailand', HK:'Hong Kong',
};
