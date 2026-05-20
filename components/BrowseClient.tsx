'use client';

import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { FUNCTIONS_URL, getAuthHeader } from '@/lib/utils';
import TitleCard from '@/components/TitleCard';
import type { Title } from '@/lib/types';

const PAGE_SIZE = 24;

interface FilterState {
  format: string;
  minRating: number;
  yearFrom: string;
  yearTo: string;
  country: string;
  language: string;
  cvrs: string;
  runtime: string;
  genres: number[];
  platforms: number[];
}

const DEFAULT_FILTERS: FilterState = {
  format: '', minRating: 0, yearFrom: '', yearTo: '',
  country: '', language: '', cvrs: '', runtime: '', genres: [], platforms: [],
};

interface BrowseClientProps {
  initialQuery: string;
  initialFormat: string;
}

/* ── Filter helper components ─────────────────────────────────── */
const DD_STYLE: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
  background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
  zIndex: 60, minWidth: 160, padding: 8,
};

function FilterDropdown({ label, isOpen, onToggle, children, wide }: {
  label: string; isOpen: boolean; onToggle: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`btn btn-ghost${isOpen ? ' active' : ''}`}
        onClick={onToggle}
        style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap' }}
      >
        {label} ▾
      </button>
      {isOpen && (
        <div style={{ ...DD_STYLE, minWidth: wide ? 280 : 160 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FilterOpt({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '7px 10px', fontSize: 12, fontWeight: active ? 600 : 400,
      background: active ? 'rgba(255,46,99,0.15)' : 'none',
      color: active ? 'var(--accent)' : 'var(--text)',
      border: 'none', borderRadius: 4, cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export default function BrowseClient({ initialQuery, initialFormat }: BrowseClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [inputVal, setInputVal] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS, format: initialFormat });
  const [results, setResults] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [genreList, setGenreList] = useState<{ id: number; name: string }[]>([]);
  const [platformList, setPlatformList] = useState<{ id: number; name: string }[]>([]);
  const genRef = useRef(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-filter-dropdown]')) setActiveFilter(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activeFilter || !results.length) return;
      // Calculate actual columns from grid layout
      const resultsGrid = document.querySelector('[style*="gridTemplateColumns"]') as HTMLElement;
      const cols = resultsGrid
        ? Math.max(1, Math.floor(resultsGrid.offsetWidth / 176)) // 160px + 16px gap
        : Math.ceil(window.innerWidth / 176);
      const maxIdx = results.length - 1;
      let newIdx = focusedIndex !== null ? focusedIndex : 0;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        newIdx = Math.min(newIdx + cols, maxIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        newIdx = Math.max(newIdx - cols, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        newIdx = Math.min(newIdx + 1, maxIdx);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newIdx = Math.max(newIdx - 1, 0);
      } else if (e.key === 'Enter' && focusedIndex !== null) {
        e.preventDefault();
        const el = document.querySelector(`[data-title-idx="${focusedIndex}"]`) as HTMLElement;
        el?.click();
      } else {
        return;
      }

      setFocusedIndex(newIdx);
      const el = document.querySelector(`[data-title-idx="${newIdx}"]`) as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIndex, activeFilter, results.length]);

  // Load genres and platforms once — sessionStorage cache (1hr TTL) avoids
  // a 2-4s cold Supabase fetch on every page visit within the same tab session.
  useEffect(() => {
    const CACHE_KEY = 'browse_filter_lists';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { genres, platforms, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          // startTransition defers these non-urgent updates, satisfying the linter
          // and avoiding a synchronous render cascade during the effect.
          startTransition(() => {
            setGenreList(genres);
            setPlatformList(platforms);
          });
          return; // skip network fetch entirely
        }
      }
    } catch { /* sessionStorage unavailable — fall through to fetch */ }

    Promise.all([
      supabase.from('genres').select('id,name').order('name'),
      supabase.from('streaming_platforms').select('id,name').order('name'),
    ]).then(([genResult, platResult]) => {
      const genres = genResult.data ?? [];
      const platforms = platResult.data ?? [];
      setGenreList(genres);
      setPlatformList(platforms);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ genres, platforms, ts: Date.now() }));
      } catch { /* storage full — silently skip caching */ }
    });
  }, []);

  // Debounced search on input change
  useEffect(() => {
    const t = setTimeout(() => setQuery(inputVal), 400);
    return () => clearTimeout(t);
  }, [inputVal]);

  const runSearch = useCallback(async (append = false) => {
    const gen = ++genRef.current;
    setLoading(true);
    if (!append) offsetRef.current = 0;

    try {
      let data: Title[] = [];

      if (query.trim()) {
        const authHeaders = await getAuthHeader();
        const [tmdbRes, semRes] = await Promise.all([
          fetch(`${FUNCTIONS_URL}/tmdb-cache?action=search&query=${encodeURIComponent(query)}${filters.format ? `&type=${filters.format}` : ''}`,
            { headers: authHeaders }),
          fetch(`${FUNCTIONS_URL}/semantic-search?query=${encodeURIComponent(query)}&limit=20${filters.format ? `&media_type=${filters.format}` : ''}`,
            { headers: authHeaders }),
        ]);
        const [tmdb, sem] = await Promise.all([
          tmdbRes.json().catch(() => ({ results: [] })),
          semRes.json().catch(() => ({ results: [] })),
        ]);
        const tmdbList: Title[] = tmdb.results ?? [];
        const semList: Title[] = sem.results ?? [];
        const seen = new Set(tmdbList.map(r => r.id));
        data = [...tmdbList, ...semList.filter(r => !seen.has(r.id))];
      } else {
        const rpcParams = buildParams(filters, append ? offsetRef.current : 0);
        const { data: rows, error } = await supabase.rpc('browse_titles', rpcParams);
        if (error) throw error;
        data = (rows ?? []) as Title[];

        if (gen !== genRef.current) return;
        const hasMorePage = data.length > PAGE_SIZE;
        if (hasMorePage) data = data.slice(0, PAGE_SIZE);
        setHasMore(hasMorePage);
        offsetRef.current += data.length;
      }

      if (gen !== genRef.current) return;
      if (append) setResults(prev => [...prev, ...data]);
      else setResults(data);
    } catch (err) {
      console.error('[BrowseClient] runSearch failed:', err);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [query, filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runSearch(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  const setFilter = (key: keyof FilterState, val: string | number | number[]) => {
    // Validate year range: yearFrom should not be > yearTo
    if (key === 'yearFrom' && typeof val === 'string') {
      const from = val ? parseInt(val, 10) : null;
      const to = filters.yearTo ? parseInt(filters.yearTo, 10) : null;
      if (from && to && from > to) {
        console.warn(`Invalid year range: ${from} > ${to}`);
        return;
      }
    }
    if (key === 'yearTo' && typeof val === 'string') {
      const to = val ? parseInt(val, 10) : null;
      const from = filters.yearFrom ? parseInt(filters.yearFrom, 10) : null;
      if (to && from && from > to) {
        console.warn(`Invalid year range: ${from} > ${to}`);
        return;
      }
    }
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const toggle = (key: string) => setActiveFilter(p => p === key ? null : key);

  const hasActiveFilters = filters.format || filters.minRating > 0 || filters.yearFrom ||
    filters.genres.length > 0 || filters.runtime || filters.language || filters.country || filters.cvrs || filters.platforms.length > 0;

  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; clearFn: () => void }> = [];
    if (filters.format) chips.push({ label: `Format: ${filters.format === 'movie' ? 'Movies' : 'TV'}`, clearFn: () => setFilter('format', '') });
    if (filters.minRating > 0) chips.push({ label: `Rating ${filters.minRating}+`, clearFn: () => setFilter('minRating', 0) });
    if (filters.yearFrom || filters.yearTo) {
      const year = filters.yearFrom && filters.yearTo
        ? `${filters.yearFrom}–${filters.yearTo}`
        : filters.yearFrom ? `${filters.yearFrom}+` : filters.yearTo ? `Until ${filters.yearTo}` : '';
      if (year) chips.push({ label: `Year: ${year}`, clearFn: () => { setFilter('yearFrom', ''); setFilter('yearTo', ''); } });
    }
    if (filters.genres.length > 0) {
      const genreNames = filters.genres.map(id => genreList.find(g => g.id === id)?.name).filter(Boolean);
      chips.push({ label: `Genres: ${genreNames.join(', ')}`, clearFn: () => setFilter('genres', []) });
    }
    if (filters.runtime) {
      const runtimeLabel = {
        short: 'Short (< 90 min)',
        medium: 'Medium (90–120 min)',
        long: 'Long (2+ hrs)',
        'series-short': 'Series (< 30 min/ep)',
        'series-long': 'Series (45+ min/ep)',
      }[filters.runtime] || filters.runtime;
      chips.push({ label: `Runtime: ${runtimeLabel}`, clearFn: () => setFilter('runtime', '') });
    }
    if (filters.language) chips.push({ label: `Language: ${filters.language.toUpperCase()}`, clearFn: () => setFilter('language', '') });
    if (filters.country) chips.push({ label: `Country: ${filters.country}`, clearFn: () => setFilter('country', '') });
    if (filters.cvrs) chips.push({ label: `CVRS: ${filters.cvrs}`, clearFn: () => setFilter('cvrs', '') });
    if (filters.platforms.length > 0) {
      const platformNames = filters.platforms.map(id => platformList.find(p => p.id === id)?.name).filter(Boolean);
      chips.push({ label: `Platforms: ${platformNames.join(', ')}`, clearFn: () => setFilter('platforms', []) });
    }
    return chips;
  };

  const activeChips = getActiveFilterChips();

  const heading = query
    ? `Results for "${query}"`
    : filters.format === 'movie' ? 'Movies'
    : filters.format === 'tv' ? 'TV Shows'
    : 'Browse All';

  return (
    <div data-filter-dropdown>
      {/* Search bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', maxWidth: 600 }}>
          <input
            type="text" value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="Search for anything..."
            style={{
              width: '100%', height: 46,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--text)',
              fontFamily: 'inherit', fontSize: 14, padding: '0 44px 0 16px', outline: 'none',
            }}
          />
          {inputVal && (
            <button onClick={() => { setInputVal(''); setQuery(''); }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer' }}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }} data-filter-dropdown>

        <FilterDropdown label={`Format${filters.format ? `: ${filters.format === 'movie' ? 'Movies' : 'TV'}` : ''}`} isOpen={activeFilter === 'format'} onToggle={() => toggle('format')}>
          {[{ v: '', l: 'All' }, { v: 'movie', l: 'Movies' }, { v: 'tv', l: 'TV' }].map(({ v, l }) => (
            <FilterOpt key={v} label={l} active={filters.format === v} onClick={() => { setFilter('format', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Rating${filters.minRating > 0 ? ` ${filters.minRating}+` : ''}`} isOpen={activeFilter === 'rating'} onToggle={() => toggle('rating')}>
          {[0, 6, 7, 8, 9].map(v => (
            <FilterOpt key={v} label={v === 0 ? 'Any' : `${v}.0+`} active={filters.minRating === v} onClick={() => { setFilter('minRating', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Year${filters.yearFrom ? ` ${filters.yearFrom}${filters.yearTo ? `–${filters.yearTo}` : '+'}` : ''}`} isOpen={activeFilter === 'year'} onToggle={() => toggle('year')}>
          {[
            { from: '', to: '', l: 'Any year' },
            { from: '2020', to: '', l: '2020s' },
            { from: '2010', to: '2019', l: '2010s' },
            { from: '2000', to: '2009', l: '2000s' },
            { from: '1990', to: '1999', l: '1990s' },
            { from: '1980', to: '1989', l: '1980s' },
            { from: '', to: '1979', l: 'Classic (pre-1980)' },
          ].map(({ from, to, l }) => (
            <FilterOpt key={l} label={l} active={filters.yearFrom === from && filters.yearTo === to}
              onClick={() => { setFilter('yearFrom', from); setFilter('yearTo', to); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Genre${filters.genres.length > 0 ? ` (${filters.genres.length})` : ''}`} isOpen={activeFilter === 'genre'} onToggle={() => toggle('genre')} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
            {genreList.map(g => {
              const active = filters.genres.includes(g.id);
              return (
                <button key={g.id} onClick={() => setFilter('genres', active ? filters.genres.filter(x => x !== g.id) : [...filters.genres, g.id])}
                  style={{
                    textAlign: 'left', padding: '7px 10px', fontSize: 12, fontWeight: active ? 600 : 400,
                    background: active ? 'rgba(255,46,99,0.15)' : 'none',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                  }}>
                  {g.name}
                </button>
              );
            })}
          </div>
          {filters.genres.length > 0 && (
            <button onClick={() => setFilter('genres', [])} style={{ marginTop: 8, padding: '4px 8px', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear genres
            </button>
          )}
        </FilterDropdown>

        <FilterDropdown label={`Runtime${filters.runtime ? ' ·' : ''}`} isOpen={activeFilter === 'runtime'} onToggle={() => toggle('runtime')}>
          {[
            { v: '', l: 'Any' },
            { v: 'short', l: 'Short (< 90 min)' },
            { v: 'medium', l: 'Medium (90–120 min)' },
            { v: 'long', l: 'Long (2+ hrs)' },
            { v: 'series-short', l: 'Series (< 30 min/ep)' },
            { v: 'series-long', l: 'Series (45+ min/ep)' },
          ].map(({ v, l }) => (
            <FilterOpt key={v} label={l} active={filters.runtime === v} onClick={() => { setFilter('runtime', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Language${filters.language ? ` · ${filters.language.toUpperCase()}` : ''}`} isOpen={activeFilter === 'language'} onToggle={() => toggle('language')}>
          {[
            { v: '', l: 'Any' }, { v: 'en', l: 'English' }, { v: 'fr', l: 'French' },
            { v: 'es', l: 'Spanish' }, { v: 'de', l: 'German' }, { v: 'ja', l: 'Japanese' },
            { v: 'ko', l: 'Korean' }, { v: 'zh', l: 'Mandarin' }, { v: 'hi', l: 'Hindi' },
            { v: 'pt', l: 'Portuguese' }, { v: 'it', l: 'Italian' },
          ].map(({ v, l }) => (
            <FilterOpt key={v} label={l} active={filters.language === v} onClick={() => { setFilter('language', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Country${filters.country ? ` · ${filters.country}` : ''}`} isOpen={activeFilter === 'country'} onToggle={() => toggle('country')}>
          {[
            { v: '', l: 'Any' }, { v: 'US', l: 'United States' }, { v: 'CA', l: 'Canada' },
            { v: 'GB', l: 'United Kingdom' }, { v: 'AU', l: 'Australia' }, { v: 'FR', l: 'France' },
            { v: 'DE', l: 'Germany' }, { v: 'JP', l: 'Japan' }, { v: 'KR', l: 'South Korea' },
            { v: 'IN', l: 'India' }, { v: 'IT', l: 'Italy' }, { v: 'ES', l: 'Spain' },
          ].map(({ v, l }) => (
            <FilterOpt key={v} label={l} active={filters.country === v} onClick={() => { setFilter('country', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`CVRS${filters.cvrs ? ` · ${filters.cvrs}` : ''}`} isOpen={activeFilter === 'cvrs'} onToggle={() => toggle('cvrs')}>
          {[
            { v: '', l: 'Any' }, { v: 'G', l: 'G (General Audiences)' },
            { v: 'PG', l: 'PG (Parental Guidance)' }, { v: '14A', l: '14A' },
            { v: '18A', l: '18A (Restricted)' }, { v: 'R', l: 'R (Restricted)' },
            { v: 'NC-17', l: 'NC-17 (No one under 17)' },
          ].map(({ v, l }) => (
            <FilterOpt key={v} label={l} active={filters.cvrs === v} onClick={() => { setFilter('cvrs', v); setActiveFilter(null); }} />
          ))}
        </FilterDropdown>

        <FilterDropdown label={`Platforms${filters.platforms.length > 0 ? ` (${filters.platforms.length})` : ''}`} isOpen={activeFilter === 'platforms'} onToggle={() => toggle('platforms')} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
            {platformList.map(p => {
              const active = filters.platforms.includes(p.id);
              return (
                <button key={p.id} onClick={() => setFilter('platforms', active ? filters.platforms.filter(x => x !== p.id) : [...filters.platforms, p.id])}
                  style={{
                    textAlign: 'left', padding: '7px 10px', fontSize: 12, fontWeight: active ? 600 : 400,
                    background: active ? 'rgba(255,46,99,0.15)' : 'none',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                  }}>
                  {p.name}
                </button>
              );
            })}
          </div>
          {filters.platforms.length > 0 && (
            <button onClick={() => setFilter('platforms', [])} style={{ marginTop: 8, padding: '4px 8px', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear platforms
            </button>
          )}
        </FilterDropdown>

        {hasActiveFilters && (
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--accent)', borderColor: 'rgba(255,46,99,0.4)' }}
            onClick={() => setFilters({ ...DEFAULT_FILTERS, format: initialFormat })}>
            Clear all ×
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          {activeChips.map((chip, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(41, 98, 255, 0.15)', color: 'var(--accent)',
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              }}
            >
              {chip.label}
              <button
                onClick={chip.clearFn}
                style={{
                  background: 'none', border: 'none', color: 'inherit',
                  cursor: 'pointer', fontSize: 14, padding: 0, display: 'flex', alignItems: 'center',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Heading */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{heading}</h1>
        {loading && <div className="spinner" style={{ width: 18, height: 18 }} />}
      </div>

      {/* Results */}
      {!loading && results.length === 0 ? (
        <div className="empty-state">
          <p>{query ? `No results for "${query}"` : 'No titles match your filters.'}</p>
          <button className="btn btn-primary" onClick={() => { setInputVal(''); setQuery(''); setFilters(DEFAULT_FILTERS); }}>
            Clear Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {results.map((t, idx) => (
            <div
              key={t.id}
              data-title-idx={idx}
              onClick={() => setFocusedIndex(idx)}
              onMouseEnter={() => setFocusedIndex(idx)}
              onMouseLeave={() => setFocusedIndex(null)}
              style={{
                outline: focusedIndex === idx ? '2px solid var(--accent)' : 'none',
                borderRadius: 'var(--radius)',
              }}
            >
              <TitleCard {...t} priority={idx < 6} />
            </div>
          ))}
        </div>
      )}

      {hasMore && !query && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button className="btn" onClick={() => runSearch(true)} disabled={loading} style={{ minWidth: 140 }}>
            {loading ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

function buildParams(f: FilterState, currentOffset: number) {
  const params: Record<string, unknown> = {
    p_limit: PAGE_SIZE + 1, p_offset: currentOffset,
    p_media_type: f.format || null,
    p_genre_ids: f.genres.length > 0 ? f.genres : null,
    p_min_rating: f.minRating || 0,
    p_year_from: f.yearFrom ? parseInt(f.yearFrom, 10) : null,
    p_year_to: f.yearTo ? parseInt(f.yearTo, 10) : null,
    p_country: f.country || null,
    p_cvrs: f.cvrs || null,
    p_language: f.language || null,
    p_platform_ids: f.platforms.length > 0 ? f.platforms : null,
    p_runtime_min: null, p_runtime_max: null,
  };
  switch (f.runtime) {
    case 'short':        params.p_runtime_max = 89; break;
    case 'medium':       params.p_runtime_min = 90; params.p_runtime_max = 120; break;
    case 'long':         params.p_runtime_min = 121; break;
    case 'series-short': params.p_runtime_max = 29; break;
    case 'series-long':  params.p_runtime_min = 45; break;
  }
  return params;
}
