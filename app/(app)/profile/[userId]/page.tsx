'use client';

import { useState, useRef, use } from 'react';
import Image from 'next/image';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { getAvatarUrl, TMDB_IMG, releaseYear } from '@/lib/utils';
import { useFocusTrap } from '@/lib/a11y';

interface FriendProfile {
  display_name: string;
  avatar_id: string | null;
  recent_titles: {
    id: string; title: string;
    poster_path: string | null;
    media_type: 'movie' | 'tv';
    release_date: string | null;
    status: string;
  }[];
}

export default function FriendProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params); // Next.js 16: params is a Promise
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [recTitle, setRecTitle] = useState('');
  const [recMsg, setRecMsg] = useState('');
  const [showRecModal, setShowRecModal] = useState(false);
  const recModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(recModalRef, showRecModal, () => setShowRecModal(false));

  const { data: { friendData, tasteMatch }, loading } = useAsyncData<{
    friendData: FriendProfile | null;
    tasteMatch: { compatibility_pct: number; titles_in_common: number } | null;
  }>(
    async () => {
      const [profileRes, tasteRes] = await Promise.all([
        supabase.rpc('get_friend_profile', { p_friend_id: userId }),
        supabase.rpc('get_taste_match', { p_friend_id: userId }),
      ]);
      return {
        friendData: profileRes.data ?? null,
        tasteMatch: tasteRes.data ?? null,
      };
    },
    [user, userId],
    { initialData: { friendData: null, tasteMatch: null }, enabled: !!user },
  );

  const handleRemoveFriend = async () => {
    await supabase.rpc('remove_friend', { p_user_id: userId });
    showToast('Friend removed');
    router.push('/friends');
  };

  const handleSendRec = async () => {
    if (!recTitle.trim()) return;
    setSending(true);
    // Find title by search
    // Escape SQL LIKE wildcards to prevent unintended pattern matching
    const safeTitleSearch = recTitle.trim().replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
      .from('titles')
      .select('id')
      .ilike('title', `%${safeTitleSearch}%`)
      .limit(1)
      .single();
    if (!data) { showToast('Title not found', 'error'); setSending(false); return; }
    await supabase.rpc('send_recommendation', {
      p_friend_id: userId,
      p_title_id: data.id,
      p_message: recMsg.trim(),
    });
    showToast('Recommendation sent!');
    setShowRecModal(false);
    setRecTitle(''); setRecMsg('');
    setSending(false);
  };

  if (!user) return <div className="empty-state"><p>Sign in to view profiles.</p></div>;
  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!friendData) return <div className="empty-state"><p>Profile not found.</p></div>;

  const avatarUrl = getAvatarUrl(friendData.avatar_id, userId);
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, background: 'var(--bg-surface-2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    color: 'var(--text)', padding: '0 12px', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', marginBottom: 10,
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <button className="btn btn-ghost" onClick={() => router.push('/friends')} style={{ marginBottom: 24 }}>
        ← Back to Friends
      </button>

      {/* Header */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={friendData.display_name}
          style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{friendData.display_name}</div>
          {tasteMatch && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: 'linear-gradient(135deg, #4158D0, #C850C0, #FF2E63)',
                borderRadius: 'var(--radius)', padding: '3px 12px',
                fontSize: 13, fontWeight: 700, color: '#fff',
              }}>
                {tasteMatch.compatibility_pct}% match
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tasteMatch.titles_in_common} titles in common
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={() => setShowRecModal(true)} style={{ fontSize: 12 }}>
            Recommend
          </button>
          <button className="btn btn-ghost btn-danger" onClick={handleRemoveFriend} style={{ fontSize: 12 }}>
            Remove
          </button>
        </div>
      </div>

      {/* Recently watched */}
      {friendData.recent_titles?.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
            Recently Watched
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
            {friendData.recent_titles.map(t => (
              <div key={t.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/${t.id}`)}>
                <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '2/3', background: 'var(--bg-surface-2)' }}>
                  {t.poster_path ? (
                    <Image src={`${TMDB_IMG}${t.poster_path}`} alt={t.title} fill
                      sizes="(max-width: 600px) 33vw, 100px"
                      style={{ objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)', padding: 4, textAlign: 'center' }}>
                      {t.title}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  {releaseYear(t.release_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommend modal */}
      {showRecModal && (
        <div onClick={() => setShowRecModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div ref={recModalRef} role="dialog" aria-modal="true" aria-label={`Recommend to ${friendData.display_name}`} tabIndex={-1}
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 28, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              Recommend to {friendData.display_name}
            </h3>
            <input placeholder="Title name (e.g. Inception)" value={recTitle}
              onChange={e => setRecTitle(e.target.value)} maxLength={100} style={inputStyle} />
            <input placeholder="Optional message" value={recMsg}
              onChange={e => setRecMsg(e.target.value)} maxLength={300} style={inputStyle} />
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-primary" onClick={handleSendRec} disabled={sending || !recTitle.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowRecModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
