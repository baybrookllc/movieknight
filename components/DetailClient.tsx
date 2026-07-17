'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/lib/a11y';
import {
  TMDB_BACKDROP, TMDB_IMG, FUNCTIONS_URL,
  fmtRuntime, fmtMoney, releaseYear, COUNTRY_NAMES,
  getAuthHeader,
} from '@/lib/utils';
import type { WatchStatus } from '@/lib/types';
import type { AwardsData } from '@/components/AwardsSection';

// ── Lazy-loaded heavy sections ────────────────────────────────────────────────
// AwardsSection is only needed when a title has wins/nominations (~30% of titles)
// SeasonsPanel is only needed for TV shows (~40% of detail views)
// Neither is ever included in the critical-path bundle.
const AwardsSection = dynamic(() => import('@/components/AwardsSection'), {
  loading: () => (
    <div style={{ marginTop: 28, height: 52, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }} />
  ),
  ssr: false,
});

const SeasonsPanel = dynamic(() => import('@/components/SeasonsPanel'), {
  loading: () => (
    <div style={{ marginTop: 32 }}>
      <div style={{ height: 28, width: 120, background: 'var(--bg-surface)', borderRadius: 4, marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 48, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }} />
      ))}
    </div>
  ),
  ssr: false,
});

// AskClaude — only loaded for logged-in users on detail pages
const AskClaude = dynamic(() => import('@/components/AskClaude'), { ssr: false });

interface CastMember {
  id?: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface Season {
  season_number: number;
  name: string;
  episode_count: number;
  episodes?: { episode_number: number; name: string }[];
}

interface UserList {
  id: string;
  title: string;
}


// Shape of the cached TMDB "watch/providers" blob (normalized into `countries` by tmdb-cache)
interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}
interface WatchProviderCountry {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}
interface WatchProvidersData {
  countries?: Record<string, WatchProviderCountry>;
}

interface TmdbTitleData {
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  runtime?: number;
  episode_run_time?: number[];
  certification_ca?: string | null;
  origin_country?: string[];
  original_language?: string;
  budget?: number;
  revenue?: number;
  spoken_languages?: string[];
  writers?: string[];
  watch_providers_json?: WatchProvidersData | null;
  awards_json?: AwardsData | null;
  genres?: { id: number; name: string }[];
  cast?: CastMember[];
  [key: string]: unknown;
}

interface DetailClientProps {
  titleId: string;
  mediaType: 'movie' | 'tv';
  data: TmdbTitleData;
}

const STATUS_OPTIONS: { value: WatchStatus | ''; label: string }[] = [
  { value: '', label: 'Not tracked' },
  { value: 'want_to_watch', label: 'Want to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'watched', label: 'Watched' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'not_interested', label: 'Not Interested' },
];

export default function DetailClient({ titleId, mediaType, data }: DetailClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [detailData, setDetailData] = useState<TmdbTitleData>(data);
  const [watchProviders, setWatchProviders] = useState<WatchProvidersData | null>(data.watch_providers_json || null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus | ''>('');
  const [showAddToList, setShowAddToList] = useState(false);
  const [myLists, setMyLists] = useState<UserList[]>([]);
  const [userRating, setUserRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [trailer, setTrailer] = useState<{ key: string; name: string } | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [awardsData, setAwardsData] = useState<AwardsData | null>(
    data.awards_json && (data.awards_json.total_wins > 0 || data.awards_json.total_nominations > 0) 
      ? data.awards_json 
      : null
  );
  const [awardsOpen, setAwardsOpen] = useState(false);

  const addToListRef = useRef<HTMLDivElement>(null);
  const trailerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(addToListRef, showAddToList, () => setShowAddToList(false));
  useFocusTrap(trailerRef, showTrailer, () => setShowTrailer(false));

  // Decode titleId for use in API calls
  const decodedTitleId = decodeURIComponent(titleId);

  const year = releaseYear(data.release_date);
  const backdropUrl = detailData.backdrop_path
    ? `${TMDB_BACKDROP}${detailData.backdrop_path}`
    : detailData.poster_path ? `${TMDB_BACKDROP}${detailData.poster_path}` : '';

  // Load watch history + trailer + cast + awards + seasons in parallel
  useEffect(() => {
    const tmdbId = decodedTitleId.split(':')[1];
    const controller = new AbortController();
    const { signal } = controller;

    const fetchJson = async (url: string, headers: Record<string, string>) => {
      try {
        const r = await fetch(url, { headers, signal });
        return r.ok ? await r.json() : null;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return null;
        if (process.env.NODE_ENV === 'development') console.error('Fetch failed:', url, err);
        return null;
      }
    };

    (async () => {
      const authHeader = await getAuthHeader();
      if (signal.aborted) return;

      const needsCastFetch = !data.cast?.length;
      if (data.cast?.length) setCast(data.cast.slice(0, 12));

      const [videos, detail, awards, seasons, providers] = await Promise.all([
        fetchJson(`${FUNCTIONS_URL}/tmdb-cache?action=videos&tmdb_id=${tmdbId}&media_type=${mediaType}`, authHeader),
        needsCastFetch
          ? fetchJson(`${FUNCTIONS_URL}/tmdb-cache?action=detail&tmdb_id=${tmdbId}&media_type=${mediaType}`, authHeader)
          : Promise.resolve(null),
        !data.awards_json
          ? fetchJson(`${FUNCTIONS_URL}/tmdb-cache?action=awards&tmdb_id=${tmdbId}&media_type=${mediaType}`, authHeader)
          : Promise.resolve(null),
        mediaType === 'tv'
          ? fetchJson(`${FUNCTIONS_URL}/tv-seasons?tmdb_id=${tmdbId}`, authHeader)
          : Promise.resolve(null),
        !data.watch_providers_json
          ? fetchJson(`${FUNCTIONS_URL}/tmdb-cache?action=watch-providers&tmdb_id=${tmdbId}&media_type=${mediaType}`, authHeader)
          : Promise.resolve(null),
      ]);

      if (signal.aborted) return;
      if (videos?.trailer?.key) setTrailer(videos.trailer);
      if (providers) setWatchProviders(providers);
      if (detail) {
        setDetailData(prev => ({ ...prev, ...detail }));
        if (detail.cast?.length) setCast(detail.cast.slice(0, 12));
      }
      if (awards && (awards.total_wins > 0 || awards.total_nominations > 0)) setAwardsData(awards);
      if (seasons?.seasons) setSeasons(seasons.seasons.filter((s: { season_number: number }) => s.season_number > 0));
    })();

    if (user) {
      supabase
        .from('watch_history')
        .select('status, rating')
        .eq('title_id', decodedTitleId)
        .is('episode_season', null)
        .abortSignal(signal)
        .maybeSingle()
        .then(({ data: wh }) => {
          if (signal.aborted || !wh) return;
          setWatchStatus(wh.status as WatchStatus);
          setUserRating(wh.rating ? wh.rating / 2 : 0);
        });
    }

    return () => { controller.abort(); };
  }, [titleId, mediaType, user, decodedTitleId, data.cast]);

  const openAddToList = async () => {
    if (!user) { router.push('/login'); return; }
    const { data } = await supabase.from('custom_lists').select('id,title').order('created_at', { ascending: false });
    setMyLists(data ?? []);
    setShowAddToList(true);
  };

  const addToList = async (listId: string, listTitle: string) => {
    const { error } = await supabase.from('list_items').insert({ list_id: listId, title_id: titleId });
    if (error?.code === '23505') { showToast('Already in this list'); }
    else if (error) { showToast('Failed to add', 'error'); }
    else { showToast(`Added to "${listTitle}"`, 'success'); }
    setShowAddToList(false);
  };

  const handleStatusChange = async (status: WatchStatus | '') => {
    if (!user) { router.push('/login'); return; }
    setStatusLoading(true);
    const prev = watchStatus;
    setWatchStatus(status);
    try {
      if (!status) {
        await supabase.from('watch_history')
          .delete()
          .eq('title_id', titleId)
          .is('episode_season', null);
      } else {
        await supabase.from('watch_history').upsert({
          title_id: titleId,
          status,
          episode_season: null,
          episode_number: null,
        }, { onConflict: 'user_id,title_id,episode_season,episode_number' });
      }
    } catch {
      setWatchStatus(prev); // revert on error
    } finally {
      setStatusLoading(false);
    }
  };

  const handleRating = async (stars: number) => {
    if (!user) { router.push('/login'); return; }
    const ratingInt = stars * 2;
    const prev = userRating;
    setUserRating(stars);
    const { error } = await supabase.from('watch_history').upsert({
      title_id: titleId,
      status: watchStatus || 'watched',
      rating: ratingInt,
      episode_season: null,
      episode_number: null,
    }, { onConflict: 'user_id,title_id,episode_season,episode_number' });
    if (error) {
      setUserRating(prev);
      showToast('Failed to save rating', 'error');
    }
  };

  // Handles both TMDB format {id, name} and Supabase join format {genre_id, genres: {name}}
  const genres: string[] = (detailData.genres ?? [])
    .map((g: string | { name?: string; genres?: { name?: string } }) => typeof g === 'string' ? g : (g.name ?? g.genres?.name ?? null))
    .filter((g): g is string => g != null);

  return (
    <div>
      {/* Back button */}
      <button className="btn btn-ghost" onClick={() => router.back()}
        style={{ marginBottom: 20, fontSize: 12, padding: '6px 12px' }}>
        ← Back
      </button>

      {/* Backdrop */}
      {backdropUrl && (
        <div style={{
          width: '100%', height: 340, position: 'relative',
          marginBottom: 24, overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <Image src={backdropUrl} alt={detailData.title ?? ''} fill priority
            sizes="(max-width: 900px) 100vw, 900px"
            style={{ objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 60%)',
          }} />
          {/* Overlay title */}
          <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>
              {detailData.title}
            </h1>
          </div>
        </div>
      )}

      {/* Main layout: poster + info */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 28 }}>
        {/* Poster */}
        {detailData.poster_path && (
          <div style={{ flexShrink: 0 }}>
            <Image src={`${TMDB_IMG}${detailData.poster_path}`} alt={detailData.title ?? ''}
              width={180} height={270}
              style={{
                objectFit: 'cover',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-sm)',
              }} />
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 240 }}>
          {!backdropUrl && (
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
              {detailData.title}
            </h1>
          )}

          {/* Badges row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              {mediaType === 'tv' ? 'TV Series' : 'Movie'}
            </span>
            {year && (
              <span style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                {year}
              </span>
            )}
            {detailData.certification_ca && (
              <span style={{ padding: '4px 10px', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
                {detailData.certification_ca}
              </span>
            )}
            {(detailData.vote_average ?? 0) > 0 && (
              <span style={{ padding: '4px 10px', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600 }}>
                ★ {(detailData.vote_average ?? 0).toFixed(1)}
              </span>
            )}
          </div>

          {/* Genre chips */}
          {genres.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {genres.map((g: string) => (
                <span key={g} style={{
                  padding: '4px 10px', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
                }}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {detailData.overview && (
            <p style={{
              fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)',
              marginBottom: 20,
            }}>
              {detailData.overview}
            </p>
          )}

          {/* Watch status selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
              Track this title
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.filter(o => o.value).map(opt => (
                <button key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  disabled={statusLoading}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: watchStatus === opt.value ? 'var(--accent)' : 'var(--bg-surface)',
                    color: watchStatus === opt.value ? '#fff' : 'var(--text)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Star rating (Watched only) */}
          {(watchStatus === 'watched' || userRating > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
                Your rating
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star}
                    onClick={() => handleRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onFocus={() => setHoverRating(star)}
                    onBlur={() => setHoverRating(0)}
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 28,
                      color: star <= (hoverRating || userRating) ? '#f5c518' : 'var(--border)',
                      transition: 'color 0.1s',
                    }}>
                    ★
                  </button>
                ))}
                {userRating > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 6 }}>
                    {userRating}/5
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {trailer && (
              <button className="btn btn-primary" onClick={() => setShowTrailer(true)}
                style={{ fontSize: 12, padding: '8px 20px' }}>
                ▶ Watch Trailer
              </button>
            )}
            {user && (
              <button className="btn btn-ghost" onClick={openAddToList}
                style={{ fontSize: 12, padding: '8px 20px' }}>
                + Add to List
              </button>
            )}
          </div>
        </div>
      </div>

      {/* About section */}
      <StreamingSection providers={watchProviders} />

      {/* About section */}
      <AboutSection data={detailData} mediaType={mediaType} />

      {/* Cast section */}
      {cast.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Cast</h2>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
            {cast.map((actor) => (
              <div key={actor.id ?? actor.name} style={{ flexShrink: 0, width: 90, textAlign: 'center' }}>
                <div style={{
                  width: 90, height: 90, borderRadius: '50%', overflow: 'hidden',
                  border: '2px solid var(--border)', background: 'var(--bg-surface)',
                  margin: '0 auto 8px',
                }}>
                  {actor.profile_path ? (
                    <Image src={`${TMDB_IMG}${actor.profile_path}`} alt={actor.name}
                      width={90} height={90}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 28, color: 'var(--text-muted)',
                    }}>👤</div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
                  {actor.name}
                </div>
                {actor.character && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    {actor.character}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Awards section — lazy-loaded, collapsed by default */}
      {awardsData && (
        <AwardsSection
          awardsData={awardsData}
          awardsOpen={awardsOpen}
          onToggle={() => setAwardsOpen(v => !v)}
        />
      )}

      {/* TV Seasons — lazy-loaded, only ships code for TV detail pages */}
      {mediaType === 'tv' && seasons.length > 0 && (
        <SeasonsPanel seasons={seasons} titleId={titleId} user={user} />
      )}

      {/* Ask Claude — AI assistant (logged-in users only) */}
      {user && (
        <AskClaude titleId={titleId} modes={['why_watch', 'similar']} />
      )}

      {/* Add to List modal */}
      {showAddToList && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setShowAddToList(false)}>
          <div ref={addToListRef} role="dialog" aria-modal="true" aria-label="Add to list" tabIndex={-1}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 28, width: 360, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add to List</h2>
            {myLists.length === 0 ? (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  No lists yet. Create one first.
                </p>
                <button className="btn btn-primary" onClick={() => { setShowAddToList(false); router.push('/lists'); }} style={{ fontSize: 12 }}>
                  Go to Lists
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                {myLists.map((l) => (
                  <button key={l.id} onClick={() => addToList(l.id, l.title)}
                    style={{
                      padding: '10px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface-2)')}>
                    {l.title}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" onClick={() => setShowAddToList(false)} style={{ marginTop: 12, fontSize: 12, width: '100%', justifyContent: 'center' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Trailer modal */}
      {showTrailer && trailer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowTrailer(false)}>
          <div ref={trailerRef} role="dialog" aria-modal="true" aria-label={`${detailData.title} trailer`} tabIndex={-1}
            style={{ position: 'relative', width: '90vw', maxWidth: 900 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ paddingTop: '56.25%', position: 'relative' }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-lg)' }}
                allow="autoplay; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="no-referrer"
                title={`${detailData.title} trailer`}
              />
            </div>
            <button onClick={() => setShowTrailer(false)} aria-label="Close trailer"
              style={{
                position: 'absolute', top: -40, right: 0,
                background: 'none', border: 'none', color: '#fff',
                fontSize: 28, cursor: 'pointer', fontWeight: 700,
              }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── About section ───────────────────────────────────────────────
function AboutSection({ data, mediaType }: { data: TmdbTitleData; mediaType: string }) {
  const rows: [string, string][] = [];

  const year = releaseYear(data.release_date);
  if (year) rows.push(['Release Year', year]);

  if (data.origin_country) {
    const code = Array.isArray(data.origin_country) ? data.origin_country[0] : data.origin_country;
    const name = (code ? COUNTRY_NAMES[code] || code : null);
    if (name) rows.push(['Country', name]);
  }

  const runtime = fmtRuntime(data.runtime ?? null, mediaType);
  if (runtime) rows.push(['Runtime', runtime]);

  const studios = Array.isArray(data.studios) && data.studios.length ? data.studios.join(', ') : null;
  if (studios) rows.push(['Studio', studios]);

  const directors = Array.isArray(data.directors) && data.directors.length ? data.directors.join(', ') : null;
  if (directors) rows.push([mediaType === 'tv' ? 'Created By' : 'Director', directors]);

  const writers = Array.isArray(data.writers) && data.writers.length ? data.writers.join(', ') : null;
  if (writers) rows.push(['Writer', writers]);

  const language = Array.isArray(data.spoken_languages) && data.spoken_languages.length
    ? data.spoken_languages.join(', ')
    : data.original_language ? data.original_language.toUpperCase() : null;
  if (language) rows.push(['Language', language]);

  const budget = fmtMoney(data.budget ?? null);
  if (budget) rows.push(['Budget', budget]);

  const revenue = fmtMoney(data.revenue ?? null);
  if (revenue) rows.push(['Box Office', revenue]);

  if (!rows.length) return null;

  return (
    <section style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-surface)',
      boxShadow: 'var(--shadow-sm)',
      padding: 20, marginTop: 24,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
        About
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px' }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
              {label}
            </div>
            <div style={{ fontSize: 13 }}>
              {value}
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// SeasonAccordion and AwardsSection have been extracted into lazy-loaded
// components: SeasonsPanel.tsx and AwardsSection.tsx respectively.
// They are imported via next/dynamic above — not included in the
// critical-path bundle.

// ── Streaming Providers section ───────────────────────────────────────────────
function StreamingSection({ providers }: { providers: WatchProvidersData | null }) {
  if (!providers?.countries) return null;

  let country = providers.countries.US;
  if (!country || (!country.flatrate?.length && !country.rent?.length && !country.buy?.length)) {
    country = providers.countries.CA;
  }
  if (!country) return null;

  const flatrate: WatchProvider[] = country.flatrate || [];
  const rent: WatchProvider[] = country.rent || [];
  const buy: WatchProvider[] = country.buy || [];

  if (flatrate.length === 0 && rent.length === 0 && buy.length === 0) return null;

  const rentOrBuy: WatchProvider[] = [...rent];
  for (const b of buy) {
    if (!rentOrBuy.find((r) => r.provider_id === b.provider_id)) {
      rentOrBuy.push(b);
    }
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Where to Watch
      </h2>
      
      {flatrate.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Streaming On</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {flatrate.map((p) => (
              <div key={p.provider_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Image 
                  src={`https://image.tmdb.org/t/p/w154${p.logo_path}`} 
                  alt={p.provider_name} 
                  width={52} height={52} 
                  style={{ borderRadius: 12, boxShadow: 'var(--shadow-sm)' }} 
                />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.provider_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rentOrBuy.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Rent or Buy</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {rentOrBuy.map((p) => (
              <div key={p.provider_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Image 
                  src={`https://image.tmdb.org/t/p/w154${p.logo_path}`} 
                  alt={p.provider_name} 
                  width={52} height={52} 
                  style={{ borderRadius: 12, boxShadow: 'var(--shadow-sm)' }} 
                />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.provider_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {country.link && (
        <a href={country.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4, display: 'inline-block' }}>
          View all providers on TMDB →
        </a>
      )}
    </section>
  );
}
