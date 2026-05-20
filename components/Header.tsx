'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useNav } from '@/components/NavProvider';
import { getAvatarUrl } from '@/lib/utils';

const SURPRISE_QUERIES = [
  'mind-blowing psychological thriller',
  'cozy feel-good comedy',
  'epic sci-fi adventure',
  'critically acclaimed drama',
  'hidden gem underrated',
  'intense crime thriller',
  'heartwarming family movie',
  'thrilling action blockbuster',
];

export default function Header() {
  const { user, profile, signOut } = useAuth();
  const { toggle: toggleNav, mobileOpen } = useNav();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Note: '/' key is handled exclusively by SearchOverlay to avoid conflict

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/browse?q=${encodeURIComponent(query.trim())}`);
    setQuery('');
  };

  const handleSurprise = () => {
    const q = SURPRISE_QUERIES[Math.floor(Math.random() * SURPRISE_QUERIES.length)];
    router.push(`/browse?q=${encodeURIComponent(q)}`);
  };

  const avatarUrl = profile?.avatar_id
    ? getAvatarUrl(profile.avatar_id, user?.id ?? '')
    : user?.email
    ? `https://api.dicebear.com/7.x/thumbs/svg?seed=${user.email.split('@')[0]}`
    : null;

  return (
    <header className="app-header">
      {/* Hamburger — mobile only */}
      <button
        className="mobile-menu-btn"
        onClick={toggleNav}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        )}
      </button>

      <Link href="/home" className="app-logo">CINESTREAM</Link>

      {/* Centered search */}
      <form className="app-search" onSubmit={handleSearch}>
        <svg className="app-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          id="global-search"
          type="text"
          placeholder="Search movies, shows, actors or vibes..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
        <span className="search-shortcut">/</span>
      </form>

      {/* Right actions */}
      <div className="app-header-actions">
        <button
          className="btn btn-ghost"
          onClick={handleSurprise}
          style={{ fontSize: 13, gap: 6 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Surprise Me
        </button>

        {!user ? (
          <>
            <Link href="/login" className="btn btn-ghost" style={{ fontSize: 13 }}>Log In</Link>
            <Link href="/signup" className="btn btn-primary" style={{ fontSize: 13 }}>Sign Up</Link>
          </>
        ) : (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              style={{
                width: 36, height: 36,
                borderRadius: '50%',
                border: '2px solid var(--border)',
                background: 'var(--bg-surface)',
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {(profile?.display_name || user.email || 'U')[0].toUpperCase()}
                </span>
              )}
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: 'var(--bg-surface)',
                border: 'var(--border-width) solid rgba(255,255,255,0.15)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-md)',
                minWidth: 180,
                zIndex: 200,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {profile?.display_name || user.email}
                </div>
                <Link href="/profile" onClick={() => setDropdownOpen(false)}
                  style={{ display: 'block', padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>
                  Profile
                </Link>
                <Link href="/messages" onClick={() => setDropdownOpen(false)}
                  style={{ display: 'block', padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>
                  Messages
                </Link>
                <Link href="/notifications" onClick={() => setDropdownOpen(false)}
                  style={{ display: 'block', padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>
                  Notifications
                </Link>
                <button
                  onClick={() => { signOut(); setDropdownOpen(false); router.push('/'); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 13,
                    fontWeight: 500,
                    background: 'none',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
