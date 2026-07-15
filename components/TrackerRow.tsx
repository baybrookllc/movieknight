'use client';

import { useAsyncData } from '@/lib/hooks/useAsyncData';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { TMDB_IMG, statusProgress } from '@/lib/utils';

interface TrackerItem {
  title_id: string;
  status: 'watching' | 'watched' | 'want_to_watch';
  watched_at: string;
  titles: {
    id: string;
    title: string;
    poster_path: string | null;
    vote_average: number;
    media_type: 'movie' | 'tv';
  } | null;
}

interface TrackerRowProps {
  userId?: string;
  showLabel?: boolean;
}

export default function TrackerRow({ userId, showLabel = true }: TrackerRowProps) {
  const { data: items, loading } = useAsyncData<TrackerItem[]>(
    async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('title_id, status, watched_at, titles(id,title,poster_path,vote_average,media_type)')
        .eq('user_id', userId!)
        .is('episode_season', null)
        .in('status', ['watching', 'watched', 'want_to_watch'])
        .order('watched_at', { ascending: false })
        .limit(12);

      if (error) throw error;
      return (data ?? []) as unknown as TrackerItem[];
    },
    [userId],
    {
      initialData: [],
      enabled: !!userId,
      onError: (err) => console.error('Failed to load tracker row:', err),
    },
  );

  if (!userId && !loading) {
    return (
      <div style={{ padding: '8px 4px', minWidth: 260, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link> to track what you&apos;re watching.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 8, overflow: 'hidden' }}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              width: 140,
              height: 200,
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius)',
              flexShrink: 0,
              animation: 'pulse 2s infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '8px 4px', minWidth: 260, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Your tracker is empty. Start marking titles as Watching or Watched.
      </div>
    );
  }

  return (
    <div>
      {showLabel && (
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Continue Watching</h3>
      )}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {items.filter(item => item.titles).map(item => {
          const t = item.titles!;
          const pct = statusProgress(item.status);
          const poster = t.poster_path
            ? `${TMDB_IMG}${t.poster_path}`
            : undefined;

          return (
            <Link
              key={`${item.title_id}-${item.status}`}
              href={`/${t.id}`}
              style={{
                position: 'relative',
                flexShrink: 0,
                width: 140,
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'block',
                textDecoration: 'none',
              }}
              onFocus={e => {
                const el = e.currentTarget.querySelector<HTMLElement>('[data-tracker-overlay]');
                if (el) { el.style.opacity = '1'; el.style.background = 'rgba(0,0,0,0.7)'; }
              }}
              onBlur={e => {
                const el = e.currentTarget.querySelector<HTMLElement>('[data-tracker-overlay]');
                if (el) { el.style.opacity = '0'; el.style.background = 'rgba(0,0,0,0)'; }
              }}
            >
              {/* Poster */}
              {poster ? (
                <Image
                  src={poster}
                  alt={t.title}
                  width={140}
                  height={200}
                  loading="lazy"
                  style={{ objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: 200,
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    padding: 8,
                    textAlign: 'center',
                  }}
                >
                  {t.title}
                </div>
              )}

              {/* Rating badge */}
              {t.vote_average > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#ffc107',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span>★</span>
                  {t.vote_average.toFixed(1)}
                </div>
              )}

              {/* Progress bar */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: 'rgba(255,255,255,0.1)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background:
                      pct === 100
                        ? '#22c55e'          /* watched — green */
                        : pct > 10
                          ? 'var(--accent)'  /* watching — brand accent */
                          : 'var(--accent3)', /* want to watch — blue */
                    width: `${pct}%`,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>

              {/* Title overlay on hover (and keyboard focus — see onFocus/onBlur on the Link above) */}
              <div
                data-tracker-overlay
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0)',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 8,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.opacity = '1';
                  el.style.background = 'rgba(0,0,0,0.7)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.opacity = '0';
                  el.style.background = 'rgba(0,0,0,0)';
                }}
              >
                <div style={{ fontSize: 11, color: '#fff', lineHeight: 1.3 }}>
                  {t.title.length > 20 ? t.title.slice(0, 20) + '...' : t.title}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
