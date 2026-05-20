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

/** Get auth header — uses session JWT if available, falls back to anon key */
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    // Dynamic import to avoid SSR issues
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return { Authorization: `Bearer ${token}` };
  } catch {
    return { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` };
  }
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
