'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { getAvatarUrl, TMDB_IMG, releaseYear } from '@/lib/utils';
import TriggerWarnings from '@/components/TriggerWarnings';

// AskClaude — lazy-loaded AI assistant
const AskClaude = dynamic(() => import('@/components/AskClaude'), { ssr: false });

const card: React.CSSProperties = {
  padding: 24,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 42,
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)', padding: '0 14px',
  fontSize: 14, fontFamily: 'inherit', outline: 'none',
};

interface WatchStats {
  total: number;
  watched: number;
  watching: number;
  want: number;
}

interface GenreCount { name: string; count: number; }
interface RecentTitle {
  id: string; title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  release_date: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<WatchStats>({ total: 0, watched: 0, watching: 0, want: 0 });
  const [genres, setGenres] = useState<GenreCount[]>([]);
  const [recent, setRecent] = useState<RecentTitle[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Batch queries sequentially to avoid connection pool saturation

      // 1. Fetch watch history for stats
      const histRes = await supabase
        .from('watch_history')
        .select('status')
        .eq('user_id', user.id)
        .is('episode_season', null);

      if (histRes.data) {
        const hist = histRes.data;
        const watched  = hist.filter(h => h.status === 'watched').length;
        const watching = hist.filter(h => h.status === 'watching').length;
        const want     = hist.filter(h => h.status === 'want_to_watch').length;
        setStats({ total: hist.length, watched, watching, want });
      }

      // 2. Fetch genre DNA from taste RPC
      const tasteRes = await supabase.rpc('get_user_taste_data', { user_id: user.id });
      if (tasteRes.data) {
        const taste = tasteRes.data as any;
        const axes = [
          { name: 'Action', count: Math.round((taste.action ?? 0) * 10) },
          { name: 'Comedy', count: Math.round((taste.comedy ?? 0) * 10) },
          { name: 'Drama / Emotional', count: Math.round((taste.emotional ?? 0) * 10) },
          { name: 'Mind-bending', count: Math.round((taste.mind_bending ?? 0) * 10) },
          { name: 'Thrilling', count: Math.round((taste.thrilling ?? 0) * 10) },
        ].filter(a => a.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
        if (axes.length > 0) setGenres(axes);
      }

      // 3. Fetch recently watched titles
      const { data: recentData } = await supabase
        .from('watch_history')
        .select('title_id, titles(id,title,poster_path,media_type,release_date)')
        .in('status', ['watched', 'watching'])
        .is('episode_season', null)
        .order('updated_at', { ascending: false })
        .limit(8);

      if (recentData) {
        setRecent((recentData as any[])
          .filter(r => r.titles)
          .map(r => r.titles as RecentTitle));
      }

      setStatsLoading(false);
    })();
  }, [user]);

  if (!user) {
    return (
      <div className="empty-state">
        <p>Sign in to view your profile.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>Sign In</button>
      </div>
    );
  }

  const avatarUrl = getAvatarUrl(profile?.avatar_id, user.email?.split('@')[0]);
  const name = profile?.display_name || user.email?.split('@')[0] || 'User';

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id);
    if (error) { showToast('Failed to save', 'error'); }
    else { showToast('Profile updated!', 'success'); await refreshProfile(); setEditing(false); }
    setSaving(false);
  };

  const maxGenreCount = genres[0]?.count || 1;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 28 }}>Profile</h1>

      {/* Avatar + name */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name}
          style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
        </div>
      </div>

      {/* Watch stats */}
      {!statsLoading && (
        <div style={{ ...card, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
            Watch Stats
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Total', value: stats.total, color: 'var(--text)' },
              { label: 'Watched', value: stats.watched, color: '#10b981' },
              { label: 'Watching', value: stats.watching, color: '#f59e0b' },
              { label: 'Want', value: stats.want, color: 'var(--accent)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Genre DNA */}
      {genres.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
            Genre DNA
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {genres.map(({ name: g, count }) => (
              <div key={g}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span>{g}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{count}</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxGenreCount) * 100}%`,
                    background: 'linear-gradient(90deg, #4158D0, #C850C0, #FF2E63)',
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently watched */}
      {recent.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
            Recently Watched
          </h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {recent.map(t => (
              <div key={t.id} style={{ flexShrink: 0, cursor: 'pointer', width: 80 }}
                onClick={() => router.push(`/${t.id}`)}>
                <div style={{ width: 80, height: 120, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  {t.poster_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${TMDB_IMG}${t.poster_path}`} alt={t.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)', padding: 4, textAlign: 'center' }}>
                      {t.title}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {releaseYear(t.release_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account settings */}
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 20 }}>
          Account Settings
        </h2>
        {editing ? (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}>
              Display name
            </label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              maxLength={50} style={{ ...inputStyle, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn btn-ghost"
                onClick={() => { setEditing(false); setDisplayName(profile?.display_name || ''); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Display name</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{name}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
          </div>
        )}
      </div>

      {/* Content Warnings — Does the Dog Die */}
      {user && <TriggerWarnings userId={user.id} />}

      {/* Ask Claude — taste analyzer */}
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
          AI Assistant
        </h2>
        <AskClaude modes={['taste', 'similar']} />
      </div>

      {/* Quick links */}
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
          Quick Links
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { label: 'My Lists', href: '/lists' },
            { label: 'Friends', href: '/friends' },
            { label: 'Messages', href: '/messages' },
            { label: 'Notifications', href: '/notifications' },
          ].map(({ label, href }) => (
            <button key={href} onClick={() => router.push(href)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 0', background: 'none', border: 'none',
                borderBottom: '1px solid var(--border)', color: 'var(--text)',
                cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
              }}>
              {label}
              <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-ghost" onClick={async () => { await signOut(); router.push('/login'); }}
        style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
        Sign Out
      </button>
    </div>
  );
}
