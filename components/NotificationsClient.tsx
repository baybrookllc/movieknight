'use client';

import { useAsyncData } from '@/lib/hooks/useAsyncData';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useBadges } from '@/components/BadgeProvider';
import { getAvatarUrl, timeAgo, TMDB_IMG } from '@/lib/utils';
import type { NotificationItem } from '@/lib/types';

const ICONS: Record<string, string> = {
  friend_request: '👤',
  friend_accepted: '🤝',
  recommendation: '🎬',
  list_like: '❤️',
  watched_together: '🍿',
  message: '💬',
};

function notifText(n: NotificationItem): string {
  const name = n.actor_name || 'Someone';
  switch (n.type) {
    case 'friend_request':   return `${name} sent you a friend request`;
    case 'friend_accepted':  return `${name} accepted your friend request`;
    case 'recommendation':   return `${name} recommended ${n.title || 'a title'} to you${n.message ? `: "${n.message}"` : ''}`;
    case 'list_like':        return `${name} liked your list ${n.list_title || ''}`;
    case 'watched_together': return `${name} also watched ${n.title || 'a title'}`;
    case 'message':          return `${name} sent you a message${n.message ? `: "${n.message.slice(0, 60)}${n.message.length > 60 ? '…' : ''}"` : ''}`;
    default: return n.message || n.type;
  }
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function NotificationsClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshBadges } = useBadges();

  const { data: notifs, loading, reload: loadNotifications } = useAsyncData<NotificationItem[]>(
    async () => {
      const { data } = await supabase.rpc('get_notifications', { p_limit: 50 });
      // Opening the page (or hitting Refresh) marks all read + updates the badge.
      await supabase.rpc('mark_notifications_read');
      refreshBadges();
      return data ?? [];
    },
    [user],
    { initialData: [], enabled: !!user },
  );

  const handleClick = (n: NotificationItem) => {
    if (n.title_id) router.push(`/${n.title_id}`);
    else if (n.list_id) router.push(`/list/${n.list_id}`);
    else if (n.type === 'friend_request' || n.type === 'friend_accepted') router.push('/friends');
    else if (n.type === 'message') router.push('/messages');
  };

  if (!user) {
    return (
      <div className="empty-state">
        <p>Sign in to see notifications.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>Sign In</button>
      </div>
    );
  }

  // Group by day
  const groups: Record<string, NotificationItem[]> = {};
  const order: string[] = [];
  for (const n of notifs) {
    const label = dayLabel(n.created_at);
    if (!groups[label]) { groups[label] = []; order.push(label); }
    groups[label].push(n);
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Notifications</h1>
        {notifs.length > 0 && (
          <button className="btn btn-ghost" onClick={loadNotifications} style={{ fontSize: 12 }}>
            Refresh
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : notifs.length === 0 ? (
        <div className="empty-state"><p>You&apos;re all caught up! 🎉</p></div>
      ) : (
        order.map(label => (
          <div key={label}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, marginTop: 20 }}>
              {label}
            </div>
            {groups[label].map((n) => {
              const icon = ICONS[n.type] || '🔔';
              const avatar = n.actor_id ? getAvatarUrl(n.actor_avatar, n.actor_id) : null;
              const isClickable = !!(n.title_id || n.list_id || n.type === 'friend_request' || n.type === 'friend_accepted' || n.type === 'message');

              return (
                <div key={n.id}
                  onClick={() => isClickable && handleClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14, padding: 14,
                    background: n.read_at ? 'var(--bg-surface)' : 'rgba(255,0,60,0.06)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    borderLeft: n.read_at ? undefined : '3px solid var(--accent)',
                    marginBottom: 4, cursor: isClickable ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => isClickable && ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = n.read_at ? 'var(--bg-surface)' : 'rgba(255,0,60,0.06)')}>

                  {/* Avatar or icon */}
                  <div style={{ flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--border)' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                        {icon}
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: n.read_at ? 400 : 600, lineHeight: 1.4 }}>
                      {notifText(n)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>

                  {/* Poster thumbnail */}
                  {n.poster_path && (
                    <Image src={`${TMDB_IMG}${n.poster_path}`} alt="" width={36} height={54}
                      style={{ objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 4, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
