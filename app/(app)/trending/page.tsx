import Link from 'next/link';
import { createSupabasePublicClient } from '@/lib/supabase-server';
import TitleCard from '@/components/TitleCard';
import type { TrendingResult } from '@/lib/types';

interface SearchParams { type?: string; }

const TAB_BASE: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 20, fontSize: 13,
  fontWeight: 600, textDecoration: 'none',
  border: '1px solid var(--border)', transition: 'all 0.15s',
};
const TAB_ACTIVE: React.CSSProperties = { ...TAB_BASE, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const TAB_INACTIVE: React.CSSProperties = { ...TAB_BASE, background: 'transparent', color: 'var(--text-muted)' };

export const revalidate = 300; // revalidate every 5 minutes

export default async function TrendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { type } = await searchParams;
  const supabase = createSupabasePublicClient();

  // Use get_trending_titles RPC for real watch_count data
  const { data: rpcData } = await supabase
    .rpc('get_trending_titles', {
      p_limit: 48,
      p_media_type: (type === 'movie' || type === 'tv') ? type : null,
    });

  // Fallback to popularity if RPC returns nothing
  let items = (rpcData ?? []) as TrendingResult[];
  if (items.length === 0) {
    let q = supabase
      .from('titles')
      .select('id,title,poster_path,media_type,release_date,vote_average')
      .order('popularity', { ascending: false })
      .limit(48);
    if (type === 'movie' || type === 'tv') q = q.eq('media_type', type);
    const { data } = await q;
    items = (data ?? []) as TrendingResult[];
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Trending</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          What everyone is watching right now.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        <Link href="/trending" style={!type ? TAB_ACTIVE : TAB_INACTIVE}>All</Link>
        <Link href="/trending?type=movie" style={type === 'movie' ? TAB_ACTIVE : TAB_INACTIVE}>Movies</Link>
        <Link href="/trending?type=tv" style={type === 'tv' ? TAB_ACTIVE : TAB_INACTIVE}>TV</Link>
      </div>

      {items.length === 0 ? (
        <div className="empty-state"><p>No trending titles found.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20 }}>
          {items.map((t, i) => (
            <div key={t.id} style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', top: -8, left: -6, zIndex: 2,
                fontSize: 11, fontWeight: 800, color: 'var(--text-dim)',
              }}>
                #{i + 1}
              </div>
              <TitleCard
                id={t.id} title={t.title}
                poster_path={t.poster_path} media_type={t.media_type}
                vote_average={t.vote_average ?? undefined}
                release_date={t.release_date}
                priority={i < 6}
              />
              {t.watch_count > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, textAlign: 'center' }}>
                  {t.watch_count} watching
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
