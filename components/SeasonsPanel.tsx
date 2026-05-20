'use client';

// ── SeasonsPanel ─────────────────────────────────────────────────────────────
// Lazy-loaded by DetailClient via next/dynamic — only shipped to the client
// for TV show detail pages, which avoids loading episode-tracking code for
// movies (the majority of detail page views).

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Episode {
  episode_number: number;
  name: string;
}

interface Season {
  season_number: number;
  name?: string;
  episode_count: number;
  episodes?: Episode[];
}

interface SeasonsPanelProps {
  seasons: Season[];
  titleId: string;
  user: { id: string } | null;
}

function SeasonAccordion({
  season,
  titleId,
  isOpen,
  onToggle,
  user,
}: {
  season: Season;
  titleId: string;
  isOpen: boolean;
  onToggle: () => void;
  user: { id: string } | null;
}) {
  const [watchedEps, setWatchedEps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !isOpen) return;
    supabase
      .from('watch_history')
      .select('episode_number')
      .eq('title_id', titleId)
      .eq('episode_season', season.season_number)
      .then(({ data }) => {
        setWatchedEps(new Set((data ?? []).map((r: any) => r.episode_number.toString())));
      });
  }, [user, isOpen, titleId, season.season_number]);

  const toggleEp = async (epNum: number) => {
    if (!user) return;
    const key = epNum.toString();
    const isWatched = watchedEps.has(key);
    const next = new Set(watchedEps);
    if (isWatched) {
      next.delete(key);
      await supabase
        .from('watch_history')
        .delete()
        .eq('title_id', titleId)
        .eq('episode_season', season.season_number)
        .eq('episode_number', epNum);
    } else {
      next.add(key);
      await supabase.from('watch_history').upsert(
        {
          title_id: titleId,
          status: 'watched',
          episode_season: season.season_number,
          episode_number: epNum,
        },
        { onConflict: 'user_id,title_id,episode_season,episode_number' }
      );
    }
    setWatchedEps(next);
  };

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--bg-surface)',
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {season.name || `Season ${season.season_number}`}
          </span>
          <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {season.episode_count} eps
            {watchedEps.size > 0 && ` · ${watchedEps.size} watched`}
          </span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Episodes */}
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {(season.episodes ?? []).map((ep) => {
            const watched = watchedEps.has(ep.episode_number.toString());
            return (
              <div
                key={ep.episode_number}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  background: watched ? 'rgba(255,0,60,0.05)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <button
                  onClick={() => toggleEp(ep.episode_number)}
                  style={{
                    width: 20, height: 20, flexShrink: 0, borderRadius: 4,
                    border: '1px solid ' + (watched ? 'var(--accent)' : 'var(--border)'),
                    background: watched ? 'var(--accent)' : 'transparent',
                    color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: user ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {watched ? '✓' : ''}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 32 }}>
                  E{ep.episode_number}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {ep.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SeasonsPanel({ seasons, titleId, user }: SeasonsPanelProps) {
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(new Set());

  const toggleSeason = (seasonNumber: number) => {
    setOpenSeasons(prev => {
      const next = new Set(prev);
      next.has(seasonNumber) ? next.delete(seasonNumber) : next.add(seasonNumber);
      return next;
    });
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Episodes</h2>
      {seasons.map(s => (
        <SeasonAccordion
          key={s.season_number}
          season={s}
          titleId={titleId}
          isOpen={openSeasons.has(s.season_number)}
          onToggle={() => toggleSeason(s.season_number)}
          user={user}
        />
      ))}
    </section>
  );
}
