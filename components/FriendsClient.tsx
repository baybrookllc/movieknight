'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useBadges } from '@/components/BadgeProvider';
import { getAvatarUrl, timeAgo, TMDB_IMG } from '@/lib/utils';
import { activateOnKey, useFocusTrap } from '@/lib/a11y';

type Tab = 'friends' | 'activity' | 'requests' | 'inbox';

interface Friend {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
  last_title?: string | null;
  last_status?: string | null;
  last_watched_at?: string | null;
}

interface FriendActivityItem {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
  poster_path: string | null;
  title: string;
  title_id: string;
  status: string;
  watched_at: string;
}

interface FriendRequest {
  request_id: string;
  sender_id?: string;
  receiver_id?: string;
  avatar_id: string | null;
  display_name: string | null;
  username: string | null;
  created_at: string;
}

interface InboxItem {
  from_id: string;
  title_id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
  poster_path: string | null;
  title: string;
  note?: string | null;
  message?: string | null;
  sent_at?: string;
  created_at?: string;
  seen?: boolean;
}

interface RpcError {
  error?: string;
}

export default function FriendsClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh: refreshBadges } = useBadges();
  const [tab, setTab] = useState<Tab>('friends');
  const [loading, setLoading] = useState(true);

  // Tab data
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activity, setActivity] = useState<FriendActivityItem[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);

  // Add friend modal
  const [showAdd, setShowAdd] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addResult, setAddResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const addFriendRef = useRef<HTMLDivElement>(null);
  useFocusTrap(addFriendRef, showAdd, () => { setShowAdd(false); setAddUsername(''); setAddResult(null); });

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'friends') {
        const { data } = await supabase.rpc('get_friends');
        setFriends(data ?? []);
      } else if (t === 'activity') {
        const { data } = await supabase.rpc('get_friend_activity', { p_limit: 40 });
        setActivity(data ?? []);
      } else if (t === 'requests') {
        // Batch calls sequentially to avoid connection pool saturation
        const inc = await supabase.rpc('get_pending_requests');
        const out = await supabase.rpc('get_sent_requests');
        setIncoming(inc.data ?? []);
        setOutgoing(out.data ?? []);
      } else if (t === 'inbox') {
        const { data } = await supabase.rpc('get_recommendations');
        setInbox(data ?? []);
        await supabase.rpc('mark_recommendations_seen');
        refreshBadges();
      }
    } finally {
      setLoading(false);
    }
  }, [refreshBadges]);

  useEffect(() => {
    // Early-exit when logged out; not a cascading-render risk, just stops the spinner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadTab(tab); else setLoading(false);
  }, [tab, user, loadTab]);

  const switchTab = (t: Tab) => { setTab(t); };

  const respond = async (requestId: string, accept: boolean) => {
    const { data } = await supabase.rpc('respond_friend_request', { p_request_id: requestId, p_accept: accept });
    if ((data as RpcError)?.error) { showToast((data as RpcError).error!, 'error'); return; }
    showToast(accept ? 'Friend added! 🎉' : 'Request declined', accept ? 'success' : 'default');
    refreshBadges();
    loadTab('requests');
    if (accept) loadTab('friends');
  };

  const cancelRequest = async (requestId: string) => {
    if (!confirm('Cancel this friend request?')) return;
    // Scope to sender_id = current user — prevents IDOR deletion of others' requests
    await supabase.from('friend_requests').delete()
      .eq('id', requestId)
      .eq('sender_id', user?.id);
    showToast('Request cancelled');
    loadTab('requests');
  };

  const resendRequest = async (requestId: string, username: string) => {
    // Scope to sender_id = current user — prevents IDOR deletion of others' requests
    await supabase.from('friend_requests').delete()
      .eq('id', requestId)
      .eq('sender_id', user?.id);
    const { data } = await supabase.rpc('send_friend_request', { p_username: username });
    if ((data as RpcError)?.error) showToast((data as RpcError).error!, 'error');
    else showToast('Request resent!', 'success');
    loadTab('requests');
  };

  const removeFriend = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from friends?`)) return;
    await supabase.rpc('remove_friend', { p_user_id: userId });
    showToast('Removed from friends');
    refreshBadges();
    loadTab('friends');
  };

  const sendFriendRequest = async () => {
    if (!addUsername.trim()) return;
    setAddLoading(true);
    setAddResult(null);
    const { data } = await supabase.rpc('send_friend_request', { p_username: addUsername.trim() });
    setAddLoading(false);
    if ((data as RpcError)?.error) {
      setAddResult({ type: 'error', msg: (data as RpcError).error! });
    } else {
      setAddResult({ type: 'success', msg: 'Request sent!' });
      refreshBadges();
      setTimeout(() => { setShowAdd(false); setAddUsername(''); setAddResult(null); }, 1200);
    }
  };

  if (!user) {
    return (
      <div className="empty-state">
        <p>Sign in to connect with friends.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>Sign In</button>
      </div>
    );
  }

  const TABS: [Tab, string][] = [
    ['friends', 'Friends'],
    ['activity', 'Activity'],
    ['requests', `Requests${incoming.length ? ` (${incoming.length})` : ''}`],
    ['inbox', 'Inbox'],
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Friends</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12 }}>
          + Add Friend
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => switchTab(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: tab === t ? 'var(--bg-surface-2)' : 'transparent',
            border: tab === t ? '1px solid rgba(255,46,99,0.4)' : '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            color: tab === t ? 'var(--text)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <>
          {/* Friends List */}
          {tab === 'friends' && (
            friends.length === 0 ? (
              <div className="empty-state">
                <p>No friends yet. Add some!</p>
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add Friend</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {friends.map((f) => (
                  <FriendItem key={f.user_id} friend={f}
                    onRemove={() => removeFriend(f.user_id, f.display_name ?? f.username ?? 'this friend')}
                    onClick={() => router.push(`/profile/${f.user_id}`)} />
                ))}
              </div>
            )
          )}

          {/* Activity Feed */}
          {tab === 'activity' && (
            activity.length === 0 ? (
              <div className="empty-state"><p>No recent activity from friends.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activity.map((a, i) => (
                  <ActivityItem key={i} item={a} onClick={() => router.push(`/${a.title_id}`)} />
                ))}
              </div>
            )
          )}

          {/* Requests */}
          {tab === 'requests' && (
            <div>
              {incoming.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Incoming</div>
                  {incoming.map((r) => (
                    <RequestItem key={r.request_id} request={r} type="incoming"
                      onAccept={() => respond(r.request_id, true)}
                      onDecline={() => respond(r.request_id, false)} />
                  ))}
                </>
              )}
              {outgoing.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: incoming.length ? 24 : 0, marginBottom: 12 }}>Sent</div>
                  {outgoing.map((r) => (
                    <RequestItem key={r.request_id} request={r} type="outgoing"
                      onResend={() => resendRequest(r.request_id, r.username ?? '')}
                      onCancel={() => cancelRequest(r.request_id)} />
                  ))}
                </>
              )}
              {!incoming.length && !outgoing.length && (
                <div className="empty-state"><p>No pending friend requests.</p></div>
              )}
            </div>
          )}

          {/* Recommendation Inbox */}
          {tab === 'inbox' && (
            inbox.length === 0 ? (
              <div className="empty-state"><p>No recommendations yet. Friends can recommend titles from any title page.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inbox.map((r) => (
                  <div key={r.from_id + r.title_id} style={{
                    display: 'flex', gap: 14, padding: 16,
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
                    borderLeft: r.seen ? undefined : '3px solid var(--accent)',
                  }} onClick={() => router.push(`/${r.title_id}`)}>
                    {r.poster_path && (
                      <Image src={`${TMDB_IMG}${r.poster_path}`} alt="" width={48} height={72} style={{ objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)', borderRadius: 4 }} />
                    )}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.title || ''}</div>
                      {r.message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>&ldquo;{r.message}&rdquo;</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        From {r.display_name || 'a friend'} · {timeAgo(r.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Add Friend Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => { setShowAdd(false); setAddUsername(''); setAddResult(null); }}>
          <div ref={addFriendRef} role="dialog" aria-modal="true" aria-label="Add friend" tabIndex={-1}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 28, width: 360, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add Friend</h2>
            <input value={addUsername} onChange={e => setAddUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendFriendRequest()}
              placeholder="Enter username..." maxLength={50}
              style={{ width: '100%', height: 40, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 12 }} />
            {addResult && (
              <p style={{ fontSize: 12, color: addResult.type === 'error' ? 'var(--accent)' : '#10b981', marginBottom: 12 }}>
                {addResult.msg}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={sendFriendRequest} disabled={addLoading || !addUsername.trim()} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
                {addLoading ? 'Sending...' : 'Send Request'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setAddUsername(''); setAddResult(null); }} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function FriendItem({ friend, onRemove, onClick }: { friend: Friend; onRemove: () => void; onClick: () => void }) {
  const avatar = getAvatarUrl(friend.avatar_id, friend.user_id);
  const name = friend.display_name || friend.username || 'Unknown';
  return (
    <div role="button" tabIndex={0}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'background 0.15s' }}
      onClick={onClick}
      onKeyDown={activateOnKey(onClick)}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
      onFocus={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onBlur={e => (e.currentTarget.style.background = 'var(--bg-surface)')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt={name} style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        {friend.last_title && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {friend.last_status === 'watched' ? 'Watched' : friend.last_status === 'watching' ? 'Watching' : 'Tagged'} {friend.last_title} · {timeAgo(friend.last_watched_at)}
          </div>
        )}
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
        Remove
      </button>
    </div>
  );
}

function ActivityItem({ item, onClick }: { item: FriendActivityItem; onClick: () => void }) {
  const avatar = getAvatarUrl(item.avatar_id, item.user_id);
  const name = item.display_name ?? item.username ?? 'Friend';
  const verb = item.status === 'watched' ? 'watched' : item.status === 'watching' ? 'is watching' : item.status === 'want_to_watch' ? 'wants to watch' : 'dropped';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt={name} style={{ width: 36, height: 36, border: '2px solid var(--border)', borderRadius: '50%', flexShrink: 0 }} />
      {item.poster_path && (
        <Image src={`${TMDB_IMG}${item.poster_path}`} alt="" width={36} height={54} style={{ objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 4, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: 'var(--accent)' }}>{name}</span>
          {' '}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{verb}</span>{' '}
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{timeAgo(item.watched_at)}</div>
      </div>
    </div>
  );
}

function RequestItem({ request, type, onAccept, onDecline, onResend, onCancel }: {
  request: FriendRequest; type: 'incoming' | 'outgoing';
  onAccept?: () => void; onDecline?: () => void;
  onResend?: () => void; onCancel?: () => void;
}) {
  const userId = type === 'incoming' ? request.sender_id : request.receiver_id;
  const avatar = getAvatarUrl(request.avatar_id, userId ?? null);
  const name = request.display_name ?? request.username ?? '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt={name} style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name || ''}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{request.username} · {timeAgo(request.created_at)}</div>
      </div>
      {type === 'incoming' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onAccept} className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}>Accept</button>
          <button onClick={onDecline} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 14px' }}>Decline</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onResend} className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}>Resend</button>
          <button onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 14px', color: 'var(--accent)' }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
