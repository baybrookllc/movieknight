'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { TMDB_IMG, releaseYear, getAvatarUrl } from '@/lib/utils';
import { normalizeForYouFeed } from '@/lib/matching';

export default function ForYouClient() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const { data: items, isPending } = useQuery({
    queryKey: ['for-you', user?.id],
    enabled: !!user,
    // get_for_you_feed RETURNS TABLE → PostgREST gives an array; guard the
    // unwrap (see lib/matching.ts). React Query's retry/cache replaces the
    // former hand-rolled Promise.race timeout.
    queryFn: async () => {
      const { data } = await supabase.rpc('get_for_you_feed', { p_limit: 40 });
      return normalizeForYouFeed(data);
    },
  });

  // Loading while auth resolves, or while the (enabled) query is in flight.
  const loading = authLoading || (!!user && isPending);

  if (!user && !authLoading) {
    return (
      <div className="empty-state">
        <p>Sign in to see your personalized picks.</p>
        <Link href="/login" className="btn btn-primary">Sign In</Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>For You</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Picked based on your taste, watch history, and what friends are watching.
        </p>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (items ?? []).length === 0 ? (
        <div className="empty-state">
          <p>Watch a few titles to unlock your personalized feed.</p>
          <Link href="/browse" className="btn btn-primary">Browse Titles</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20 }}>
          {(items ?? []).map(item => (
            <div key={item.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/${item.id}`)}>
              <div style={{
                position: 'relative', borderRadius: 'var(--radius)',
                overflow: 'hidden', border: '1px solid var(--border)',
                background: 'var(--bg-surface)', aspectRatio: '2/3',
              }}>
                {item.poster_path ? (
                  <Image
                    src={`${TMDB_IMG}${item.poster_path}`}
                    alt={item.title}
                    fill
                    sizes="160px"
                    loading="lazy"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    {item.title}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 8, left: 8,
                  background: 'linear-gradient(135deg, #4158D0, #C850C0, #FF2E63)',
                  borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#fff',
                }}>
                  {item.match_pct}% match
                </div>
                {item.friend_count > 0 && item.friend_avatars?.length > 0 && (
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}>
                    {/* friend_avatars carries DiceBear seeds; plain <img> since next/image blocks SVG */}
                    {item.friend_avatars.slice(0, 2).map((av, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={getAvatarUrl(av)} alt="" width={20} height={20}
                        style={{ borderRadius: '50%', border: '1px solid var(--bg)', marginLeft: i > 0 ? -6 : 0 }} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {[releaseYear(item.release_date), item.media_type === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
                  {item.friend_count > 0 && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>{item.friend_count} friend{item.friend_count > 1 ? 's' : ''}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
