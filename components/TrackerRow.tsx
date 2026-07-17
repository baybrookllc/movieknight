'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import TitleCard from '@/components/TitleCard';

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
  const { data: items = [], isPending } = useQuery({
    queryKey: ['tracker-row', userId],
    enabled: !!userId,
    queryFn: async (): Promise<TrackerItem[]> => {
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
  });

  // `isPending` is true for a disabled query (it has no data and never will
  // until enabled), so gate on userId to keep the logged-out branch reachable.
  const loading = !!userId && isPending;

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

          return (
            <div key={`${item.title_id}-${item.status}`} style={{ flexShrink: 0 }}>
              <TitleCard
                id={t.id}
                title={t.title}
                poster_path={t.poster_path}
                media_type={t.media_type}
                vote_average={t.vote_average}
                size="md"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
