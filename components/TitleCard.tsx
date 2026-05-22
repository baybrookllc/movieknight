'use client';

import Link from 'next/link';
import Image from 'next/image';
import { TMDB_IMG, releaseYear } from '@/lib/utils';

interface TitleCardProps {
  id: string;
  title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average?: number | null;
  release_date?: string | null;
  status?: string | null;
  size?: 'sm' | 'md' | 'lg';
  priority?: boolean;
  triggerTopics?: Array<{ topicKey: string; topicName: string }>;
  userTriggerPrefs?: Record<string, 'flag' | 'hide'>;
}

const SIZE_MAP = {
  sm: { width: 120, height: 180 },
  md: { width: 160, height: 240 },
  lg: { width: 200, height: 300 },
};

export default function TitleCard({
  id, title, poster_path, media_type, vote_average, release_date, status, size = 'md', priority = false,
  triggerTopics, userTriggerPrefs
}: TitleCardProps) {
  const { width, height } = SIZE_MAP[size];
  const posterSrc = poster_path ? `${TMDB_IMG}${poster_path}` : null;
  const year = releaseYear(release_date);

  // Calculate flagged triggers
  const flaggedTriggers = triggerTopics?.filter(t => userTriggerPrefs?.[t.topicKey] === 'flag') || [];

  return (
    <Link href={`/${id}`} style={{ display: 'block', width, flexShrink: 0 }}>
      <div style={{ width, cursor: 'pointer' }}>
        {/* Poster */}
        <div
          style={{
            width, height,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            position: 'relative',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = '';
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          {posterSrc ? (
            <Image
              src={posterSrc}
              alt={title}
              fill
              sizes={`${width}px`}
              priority={priority}
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textAlign: 'center', padding: 8,
            }}>
              {title}
            </div>
          )}

          {/* Rating badge */}
          {vote_average && vote_average > 0 && (
            <div style={{
              position: 'absolute', top: 8, left: 8,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(4px)',
              borderRadius: 4,
              padding: '3px 7px',
              fontSize: 10, fontWeight: 700,
              color: '#fff',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f5c518">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {vote_average.toFixed(1)}
            </div>
          )}

          {/* Trigger warnings badge */}
          {flaggedTriggers.length > 0 && (
            <div
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(245, 158, 11, 0.9)',
                backdropFilter: 'blur(4px)',
                borderRadius: 4,
                padding: '4px 7px',
                fontSize: 9, fontWeight: 700,
                color: '#000',
                display: 'flex', alignItems: 'center', gap: 3,
                cursor: 'help',
              }}
              title={`Triggers: ${flaggedTriggers.map(t => t.topicName).join(', ')}`}
            >
              ⚠ {flaggedTriggers.length}
            </div>
          )}

          {/* Status badge */}
          {status && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.85)',
              borderTop: '1px solid rgba(255,46,99,0.4)',
              padding: '4px 8px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--accent)', textAlign: 'center',
            }}>
              {status === 'watching'      ? '▶ Watching' :
               status === 'watched'       ? '✓ Watched'  :
               status === 'want_to_watch' ? '+ Want'     : status}
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div style={{ marginTop: 8, width }}>
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            color: 'var(--text)',
          }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            {[year, media_type === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </Link>
  );
}
