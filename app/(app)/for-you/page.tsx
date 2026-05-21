'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { TMDB_IMG, releaseYear } from '@/lib/utils';
import type { ForYouResult } from '@/lib/types';

export default function ForYouPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ForYouResult[] | null>(null);
  // Derive loading: true while auth is resolving, or once we have a user but no data yet
  const loading = authLoading || (!!user && items === null);

  useEffect(() => {
    if (!user) return;

    // Wrap RPC call with timeout using Promise.race
    const rpcPromise = supabase.rpc('get_for_you_feed', { p_limit: 40 });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RPC timeout (10s)')), 10000)
    );

    Promise.race([rpcPromise, timeoutPromise])
      .then((result) => {
        const { data } = result as { data: ForYouResult[] | null };
        setItems(data ?? []);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes('timeout')) {
          console.warn('[for-you] RPC timeout (10s)');
        } else {
          console.error('[for-you] RPC error:', err);
        }
        setItems([]);
      });
  }, [user]);

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
                    {item.friend_avatars.slice(0, 2).map((av, i) => (
                      <Image key={i} src={av} alt="" width={20} height={20}
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
