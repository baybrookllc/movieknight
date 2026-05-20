'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { TMDB_IMG } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { SearchResult } from '@/lib/types';

export default function SearchOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const genRef = useRef(0);

  // Open on ⌘K or Ctrl+K or /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
          (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA')) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      startTransition(() => {
        setQuery('');
        setResults([]);
      });
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const gen = ++genRef.current;
    setLoading(true);
    try {
      const [tmdbInvoke, semInvoke] = await Promise.all([
        supabase.functions.invoke(`tmdb-cache?action=search&query=${encodeURIComponent(q)}`, { method: 'GET', signal: AbortSignal.timeout(8000) }),
        supabase.functions.invoke(`semantic-search?query=${encodeURIComponent(q)}&limit=10`, { method: 'GET', signal: AbortSignal.timeout(8000) }),
      ]);
      if (gen !== genRef.current) return;
      const [tmdb, sem] = [
        tmdbInvoke.data ?? { results: [] },
        semInvoke.data ?? { results: [] },
      ];
      const tmdbList: SearchResult[] = (tmdb.results ?? []).slice(0, 8);
      const semList: SearchResult[] = (sem.results ?? []).slice(0, 6);
      const seen = new Set(tmdbList.map(r => r.id));
      const merged = [...tmdbList, ...semList.filter(r => !seen.has(r.id))].slice(0, 12);
      if (gen === genRef.current) setResults(merged);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 350);
    return () => clearTimeout(t);
  }, [query, search]);

  const navigate = (id: string) => {
    router.push(`/${id}`);
    setOpen(false);
  };

  const goToBrowse = () => {
    if (query.trim()) router.push(`/browse?q=${encodeURIComponent(query.trim())}`);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', justifyContent: 'center', paddingTop: 80,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: '100%', maxWidth: 640, height: 'fit-content',
          background: 'var(--bg-surface)',
          border: 'var(--border-width) solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--border-light)', padding: '0 16px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && goToBrowse()}
            placeholder="Search for anything..."
            style={{
              flex: 1, height: 52, padding: '0 16px',
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 16,
              fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0,
            }}
          />
          {loading && <div className="spinner" style={{ width: 16, height: 16 }} />}
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, padding: '2px 6px', cursor: 'pointer', marginLeft: 8 }}>
            ESC
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.map(r => {
              const year = (r.release_date || '').slice(0, 4);
              return (
                <button key={r.id} onClick={() => navigate(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '10px 16px',
                    background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  {/* Poster */}
                  <div style={{ width: 36, height: 54, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border-light)', overflow: 'hidden', position: 'relative' }}>
                    {r.poster_path && (
                      <Image src={`${TMDB_IMG}${r.poster_path}`} alt="" fill sizes="36px" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {[year, r.media_type === 'tv' ? 'Series' : 'Film', r.vote_average ? `★ ${r.vote_average.toFixed(1)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2}>
                    <polyline points="9 6 15 12 9 18"/>
                  </svg>
                </button>
              );
            })}

            {/* View all results */}
            <button onClick={goToBrowse}
              style={{
                display: 'block', width: '100%', padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, color: 'var(--accent)', textAlign: 'left',
              }}>
              SEE ALL RESULTS FOR &quot;{query}&quot; →
            </button>
          </div>
        )}

        {/* Empty state */}
        {query.length > 1 && !loading && results.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No results found for &quot;{query}&quot;
          </div>
        )}

        {/* Hint when empty */}
        {!query && (
          <div style={{ padding: 20, fontSize: 11, color: 'var(--text-dim)' }}>
            <span>Type to search · Press </span>
            <kbd style={{ border: '1px solid var(--border-light)', padding: '1px 5px', fontSize: 10 }}>Enter</kbd>
            <span> for full browse</span>
          </div>
        )}
      </div>
    </div>
  );
}
