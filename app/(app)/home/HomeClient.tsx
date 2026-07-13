'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import TrackerRow from '@/components/TrackerRow';
import { FUNCTIONS_URL, TMDB_BACKDROP, TMDB_IMG, truncate, getAvatarUrl, timeAgo, getAuthHeader } from '@/lib/utils';
import { activateOnKey } from '@/lib/a11y';

/* ── Types (exported so the server page can reference them) ────── */
export interface MatchTitle {
  id: string;
  title: string;
  overview: string;
  backdrop_path: string | null;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average: number;
  release_date: string;
  runtime?: number;
  similarity?: number;
}

export interface QuickPick {
  id: string;
  title: string;
  poster_path: string | null;
  vote_average: number;
  similarity?: number;
}

interface FriendActivity {
  user_id: string;
  display_name: string;
  avatar_id: string | null;
  title: string;
  watched_at: string;
}

interface PopularList {
  id: string;
  title: string;
  item_count: number;
  like_count: number;
}

interface OnlineFriend {
  user_id: string;
  display_name: string;
  avatar_id: string | null;
  is_online: boolean;
}

/* ── Mood definitions ──────────────────────────────────────────── */
const MOODS = [
  { label: 'Mind-blowing', emoji: '🤯', query: 'mind-blowing psychological mind-bending thriller' },
  { label: 'Funny', emoji: '😂', query: 'hilarious comedy laugh out loud funny' },
  { label: 'Easy Watch', emoji: '😌', query: 'easy feel-good light entertaining watch' },
  { label: 'Emotional', emoji: '💔', query: 'emotional moving heartfelt drama tearjerker' },
  { label: 'Thrilling', emoji: '⚡', query: 'thrilling intense suspense action edge of seat' },
  { label: 'Romantic', emoji: '💕', query: 'romantic love story date night couple' },
  { label: 'Scary', emoji: '👻', query: 'scary horror terrifying creepy' },
  { label: 'Epic', emoji: '⚔️', query: 'epic adventure fantasy action blockbuster' },
];

/* ── Helpers ───────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { time: 'morning', emoji: '☀️' };
  if (h < 17) return { time: 'afternoon', emoji: '🌤️' };
  if (h < 21) return { time: 'evening', emoji: '🌙' };
  return { time: 'night', emoji: '🕯️' };
}

function fmtYear(date?: string) {
  return date ? date.slice(0, 4) : '';
}

function fmtRuntime(mins?: number) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function semanticSearch(query: string, limit = 8): Promise<MatchTitle[]> {
  try {
    // Cache-bust with timestamp to avoid stale embedding caches
    const cacheKey = `${Date.now()}-${Math.random()}`;
    // Use supabase.functions.invoke() so the SDK handles publishable-key → JWT
    // auth internally, avoiding the 401 we get when passing sb_publishable__ as
    // a raw Bearer token in fetch().
    const { data, error } = await supabase.functions.invoke(
      `semantic-search?query=${encodeURIComponent(query)}&limit=${limit}&cb=${cacheKey}`,
      { method: 'GET', signal: AbortSignal.timeout(12000) }
    );
    if (error) {
      console.warn('[semanticSearch] semantic search failed, trying keyword fallback:', error?.message);
      // Fallback to keyword search
      return keywordSearch(query, limit);
    }
    const results = data?.results ?? [];
    console.log(`[semanticSearch] query="${query.slice(0, 30)}..." returned ${results.length} results`);
    return results;
  } catch (err) {
    console.warn('[semanticSearch] exception, trying keyword fallback:', err);
    // Fallback to keyword search on any error
    return keywordSearch(query, limit);
  }
}

async function keywordSearch(query: string, limit = 8): Promise<MatchTitle[]> {
  try {
    console.log('[keywordSearch] Falling back to keyword search for:', query.slice(0, 30) + '...');
    const { data, error } = await supabase.rpc('get_titles_by_keywords', {
      p_query: query,
      p_media_type: null,
      p_limit: limit,
    });
    if (error) {
      console.error('[keywordSearch] error:', error);
      return [];
    }
    const results = (data ?? []) as MatchTitle[];
    console.log('[keywordSearch] returned', results.length, 'results');
    return results;
  } catch (err) {
    console.error('[keywordSearch] exception:', err);
    return [];
  }
}

/* ── Right Sidebar ─────────────────────────────────────────────── */
function RightSidebar() {
  const { user } = useAuth();
  const router = useRouter();
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [lists, setLists] = useState<PopularList[]>([]);
  const [online, setOnline] = useState<OnlineFriend[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const a = await supabase.rpc('get_friend_activity', { p_limit: 4 });
        setActivity(a.data ?? []);
      } catch (e) {
        console.error('get_friend_activity failed:', e);
      }
      try {
        const l = await supabase.rpc('get_popular_lists', { p_limit: 4 });
        setLists(l.data ?? []);
      } catch (e) {
        console.error('get_popular_lists failed:', e);
      }
      try {
        const o = await supabase.rpc('get_online_friends');
        setOnline(o.data ?? []);
      } catch (e) {
        console.error('get_online_friends failed:', e);
      }
    };
    load();
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
  }, [user]);

  const panelStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    marginBottom: 20,
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  };

  if (!user) {
    return (
      <div style={{ width: 280, flexShrink: 0 }}>
        {['Friend Activity', 'Popular Lists', 'Online Friends'].map(label => (
          <div key={label} style={panelStyle}>
            <div style={headerStyle}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>View all</span>
            </div>
            <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link> to see activity
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      {/* Friend Activity */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Friend Activity</span>
          <Link href="/friends" style={{ fontSize: 11, color: 'var(--text-muted)' }}>View all</Link>
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No recent activity
          </div>
        ) : (
          activity.slice(0, 4).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getAvatarUrl(a.avatar_id, a.user_id)} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{a.display_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{timeAgo(a.watched_at)}</div>
            </div>
          ))
        )}
      </div>

      {/* Popular Lists */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Popular Lists</span>
          <Link href="/lists" style={{ fontSize: 11, color: 'var(--text-muted)' }}>View all</Link>
        </div>
        {lists.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No public lists yet
          </div>
        ) : (
          lists.slice(0, 4).map((l) => (
            <div key={l.id} role="button" tabIndex={0} aria-label={`Open list: ${l.title}`}
              style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => router.push(`/list/${l.id}`)}
              onKeyDown={activateOnKey(() => router.push(`/list/${l.id}`))}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{l.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {l.item_count} titles · {l.like_count} likes
              </div>
            </div>
          ))
        )}
      </div>

      {/* Online Friends */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Online Friends</span>
          <Link href="/friends" style={{ fontSize: 11, color: 'var(--text-muted)' }}>See all</Link>
        </div>
        {online.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No friends online
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16 }}>
            {online.slice(0, 8).map((f) => (
              <div key={f.user_id} title={f.display_name} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getAvatarUrl(f.avatar_id, f.user_id)} alt={f.display_name}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border)' }} />
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 10, height: 10, borderRadius: '50%',
                  background: f.is_online ? '#22c55e' : 'var(--text-dim)',
                  border: '2px solid var(--bg-surface)',
                }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Props ─────────────────────────────────────────────────────── */
interface HomeClientProps {
  /** Server-pre-fetched default recommendation (MOODS[0] / Mind-blowing). */
  initialMatch: MatchTitle | null;
  /** Server-pre-fetched quick picks to accompany the initial hero. */
  initialQuickPicks: QuickPick[];
}

/* ── Main Home Client ──────────────────────────────────────────── */
export default function HomeClient({ initialMatch, initialQuickPicks }: HomeClientProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [activeMood, setActiveMood] = useState<number>(0);
  const [match, setMatch] = useState<MatchTitle | null>(initialMatch);
  const [quickPicks, setQuickPicks] = useState<QuickPick[]>(initialQuickPicks);
  // Start as loaded when SSR provided data; otherwise show spinner until client fetch
  const [loading, setLoading] = useState(!initialMatch);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [greeting, setGreeting] = useState<{ time: string; emoji: string }>({ time: 'day', emoji: '🎬' });

  // Track whether SSR provided initial data so we skip the initial client fetch
  const hasInitialData = useRef(!!initialMatch);

  // Set greeting client-side only to avoid SSR/CSR hydration mismatch.
  // The eslint-disable is intentional: this is the canonical pattern to avoid
  // SSR hydration mismatches when state depends on browser APIs (Date().getHours()).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(getGreeting());
  }, []);

  const { time, emoji } = greeting;

  const loadRecommendation = useCallback(async (moodIdx: number, skip?: Set<string>) => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await semanticSearch(MOODS[moodIdx].query, 12);

      if (results.length === 0) {
        console.warn('[HomeClient] semantic search returned no results for mood:', MOODS[moodIdx].label);
        setMatch(null);
        setQuickPicks([]);
        setLoadError('No recommendations found. Try a different mood.');
        return;
      }

      // Enrich with backdrop_path and runtime from DB (semantic-search doesn't return these)
      const ids = results.map(r => r.id);
      const { data: extras } = await supabase
        .from('titles')
        .select('id,backdrop_path,runtime')
        .in('id', ids);
      const extrasMap = Object.fromEntries((extras ?? []).map(e => [e.id, e]));
      for (const r of results) {
        Object.assign(r, extrasMap[r.id] ?? {});
      }

      const skipSet = skip ?? dismissed;
      const filtered = results.filter(r => !skipSet.has(r.id));
      const topMatch = filtered[0] ?? results[0] ?? null;
      setMatch(topMatch);
      setQuickPicks(filtered.slice(1, 8));
      setTrailerKey(null);
      console.log('[HomeClient] recommendation loaded:', topMatch?.title);

      // Fetch trailer for the top match in background
      if (topMatch) {
        const [, tmdbId] = topMatch.id.split(':');
        const headers = await getAuthHeader();
        fetch(`${FUNCTIONS_URL}/tmdb-cache?action=videos&tmdb_id=${tmdbId}&media_type=${topMatch.media_type}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .then(vd => { if (vd?.trailer?.key) setTrailerKey(vd.trailer.key); })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[HomeClient] loadRecommendation failed:', err);
      setMatch(null);
      setQuickPicks([]);
      setLoadError('Failed to load recommendation. Please try again.');
    } finally {
      // Always clear the spinner, even on error — prevents infinite loading state
      setLoading(false);
    }
  }, [dismissed]);

  useEffect(() => {
    // SSR already provided data for the default mood — skip redundant client fetch
    if (hasInitialData.current) {
      console.log('[HomeClient] SSR provided initial data, skipping client fetch');
      return;
    }
    console.log('[HomeClient] No SSR data, fetching client-side for mood:', MOODS[activeMood].label);
    loadRecommendation(activeMood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net: if we're in an error state and stay there for 30s, reset
  useEffect(() => {
    if (!loading && !match && !loadError) return;

    // If stuck loading for more than 15 seconds, show error
    // (keyword fallback should complete within 5-10s, so this is a safety net)
    const timeout = setTimeout(() => {
      if (loading && !match && !loadError) {
        console.error('[HomeClient] Recommendation load timeout after 15s');
        setLoading(false);
        setLoadError('Taking too long to find recommendations. Please refresh the page.');
      }
    }, 15000);

    return () => clearTimeout(timeout);
  }, [loading, match, loadError]);

  const handleMood = (idx: number) => {
    if (idx === activeMood) return;
    setActiveMood(idx);
    hasInitialData.current = false; // subsequent mood changes always fetch client-side
    loadRecommendation(idx);
  };

  const handleTryAnother = () => {
    if (!match) return;
    const next = new Set(dismissed).add(match.id);
    setDismissed(next);
    hasInitialData.current = false;
    loadRecommendation(activeMood, next);
  };

  // Semantic similarity (cosine) is typically 0.3–0.85 for useful results.
  // We rescale to a user-friendly 70–99% range so "Perfect Match" is always
  // credible, while still reflecting relative ranking between results.
  const rawSim = match?.similarity ?? null;
  const matchPct = match
    ? rawSim != null
      ? Math.round(70 + (rawSim * 29)) // maps 0–1 cosine → 70–99%
      : Math.min(99, Math.round(((match.vote_average ?? 0) / 10) * 100 * 0.85 + 15))
    : 0;

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Greeting */}
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }}>
            Good {time} {emoji}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            What should we watch{' '}
            <span style={{
              background: 'linear-gradient(135deg, #4158D0, #C850C0, #FF2E63)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {time === 'night' ? 'tonight?' : `this ${time}?`}
            </span>
          </h1>
        </div>

        {/* Mood pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {MOODS.map((m, i) => (
            <button
              key={m.label}
              onClick={() => handleMood(i)}
              className={`mood-chip${activeMood === i ? ' active' : ''}`}
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>

        {/* Perfect Match Card */}
        {loading ? (
          <div style={{
            height: 380,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div className="spinner" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Finding your perfect match...</span>
          </div>
        ) : loadError ? (
          <div style={{
            height: 200,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-error, var(--border))',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{loadError}</div>
            <button
              className="btn btn-outline"
              onClick={() => loadRecommendation(activeMood)}
              style={{ gap: 6, marginTop: 8 }}
            >
              Try Again
            </button>
          </div>
        ) : match ? (
          <div className="match-card">
            {/* Backdrop */}
            {match.backdrop_path && (
              <div className="match-backdrop">
                <Image
                  src={`${TMDB_BACKDROP}${match.backdrop_path}`}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 1280px"
                  style={{ objectFit: 'cover', objectPosition: 'center top' }}
                />
              </div>
            )}
            <div className="match-gradient" />

            {/* Match score badge */}
            <div className="match-score">
              <div className="match-score-pct">{matchPct}%</div>
              <div className="match-score-label">Match Score</div>
            </div>

            {/* Content */}
            <div className="match-content">
              <div className="match-label">✦ Perfect Match</div>

              <h2 className="match-title">{match.title}</h2>

              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                {truncate(match.overview, 140)}
              </p>

              {/* Meta */}
              <div className="match-meta">
                <span>⭐ {match.vote_average.toFixed(1)}/10</span>
                <span style={{ color: 'var(--accent)' }}>
                  {matchPct}% Match
                </span>
                {match.runtime && <span>⏱ {fmtRuntime(match.runtime)}</span>}
                {match.release_date && <span>📅 {fmtYear(match.release_date)}</span>}
              </div>

              {/* Actions */}
              <div className="match-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => router.push(`/${match.id}`)}
                  style={{ gap: 6 }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Watch Now
                </button>
                <button className="btn btn-outline" onClick={handleTryAnother} style={{ gap: 6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                  </svg>
                  Try Another
                </button>
                {trailerKey && (
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowTrailer(true)}
                    style={{ gap: 6 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Watch Trailer
                  </button>
                )}
              </div>

              {/* Why chips */}
              <div className="match-why-chips">
                <span className="match-why-chip">
                  🎯 Matches your {MOODS[activeMood].label} mood
                </span>
                <span className="match-why-chip">
                  ✨ {matchPct}% semantic match
                </span>
                {match.vote_average >= 7 && (
                  <span className="match-why-chip">
                    ⭐ Solid {match.vote_average.toFixed(1)}/10 rating
                  </span>
                )}
              </div>

              {/* Based on */}
              <div className="match-based-on">
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>This match is based on</span>
                {match.release_date && (
                  <span className="match-tag">From {fmtYear(match.release_date)}</span>
                )}
                <span className="match-tag">You enjoy {MOODS[activeMood].label}</span>
                {match.vote_average >= 8 && <span className="match-tag">Top rated</span>}
                <span className="match-tag">Highly similar vibes</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            height: 200,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            No recommendations found. Try a different mood.
          </div>
        )}

        {/* Quick picks */}
        {quickPicks.length > 0 && (
          <div>
            <div className="section-header">
              <h3 className="section-title">Quick picks for you</h3>
              <span role="button" tabIndex={0} aria-label="Show more recommendations"
                style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}
                onClick={() => loadRecommendation(activeMood)}
                onKeyDown={activateOnKey(() => loadRecommendation(activeMood))}>
                Swipe to explore more →
              </span>
            </div>
            <div className="quick-picks-row">
              {quickPicks.map(p => {
                const pct = p.similarity != null
                  ? Math.round(70 + (p.similarity * 29)) // rescale cosine → 70–99%
                  : Math.min(99, Math.round(((p.vote_average ?? 0) / 10) * 100 * 0.85 + 15));
                return (
                  <div
                    key={p.id}
                    className="quick-pick-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${p.title}`}
                    onClick={() => router.push(`/${p.id}`)}
                    onKeyDown={activateOnKey(() => router.push(`/${p.id}`))}
                  >
                    {p.poster_path ? (
                      <Image
                        src={`${TMDB_IMG}${p.poster_path}`}
                        alt={p.title}
                        width={140}
                        height={200}
                        loading="lazy"
                        style={{ objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: 140, height: 200, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
                        {p.title}
                      </div>
                    )}
                    <div className="quick-pick-badge">{pct}% Match</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Continue Watching Tracker */}
        {user && (
          <div>
            <TrackerRow userId={user.id} showLabel={true} />
          </div>
        )}
      </div>

      {/* ── Right sidebar ────────────────────────────────────────── */}
      <div className="home-right-sidebar">
        <RightSidebar />
      </div>

      {/* ── Trailer modal ────────────────────────────────────────── */}
      {showTrailer && trailerKey && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trailer"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onClick={() => setShowTrailer(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowTrailer(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, outline: 'none',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, position: 'relative' }}>
            <button
              onClick={() => setShowTrailer(false)}
              style={{
                position: 'absolute', top: -40, right: 0,
                background: 'none', border: 'none', color: '#fff',
                fontSize: 28, cursor: 'pointer', lineHeight: 1,
              }}
              aria-label="Close trailer"
            >
              ×
            </button>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%', border: 'none',
                  borderRadius: 'var(--radius-lg)',
                }}
                allow="autoplay; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="no-referrer"
                title="Trailer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
