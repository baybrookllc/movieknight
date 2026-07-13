'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useBadges } from '@/components/BadgeProvider';
import { getAvatarUrl, timeAgo } from '@/lib/utils';

export default function MessagesClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshBadges } = useBadges();

  const [conversations, setConversations] = useState<any[]>([]);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [activePartnerName, setActivePartnerName] = useState('');
  const [activePartnerAvatar, setActivePartnerAvatar] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activePartnerRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase.rpc('get_conversations');
    setConversations(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadConversations();
  }, [user, loadConversations]);

  const loadMessages = useCallback(async (partnerId: string) => {
    const { data } = await supabase.rpc('get_messages', { p_partner_id: partnerId, p_limit: 50 });
    // RPC returns newest-first; reverse for display
    setMessages((data ?? []).reverse());
    // Mark read
    await supabase.rpc('mark_messages_read', { p_partner_id: partnerId });
    refreshBadges();
    loadConversations();
  }, [refreshBadges, loadConversations]);

  const openThread = useCallback(async (partnerId: string, partnerName: string, avatarId: string) => {
    activePartnerRef.current = partnerId;
    setActivePartnerId(partnerId);
    setActivePartnerName(partnerName);
    setActivePartnerAvatar(getAvatarUrl(avatarId, partnerId));
    await loadMessages(partnerId);

    // Guard: partner changed while messages were loading
    if (activePartnerRef.current !== partnerId) return;

    // Guard: must have user id for filter
    if (!user?.id) return;

    // Security note: createBrowserClient (@supabase/ssr) automatically attaches the
    // user's session JWT to all Realtime connections, so RLS applies to postgres_changes
    // subscriptions. The filter below is enforced server-side by RLS on the messages table.
    // Subscribe to new messages via Realtime
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    channelRef.current = supabase
      .channel(`messages:${partnerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`,
      }, payload => {
        if (payload.new.sender_id === partnerId) {
          setMessages(prev => [...prev, payload.new]);
          supabase.rpc('mark_messages_read', { p_partner_id: partnerId });
          refreshBadges();
          loadConversations();
        }
      })
      .subscribe();
  }, [loadMessages, user?.id, refreshBadges, loadConversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup Realtime on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  const sendMessage = async () => {
    if (!draft.trim() || !activePartnerId || sending) return;
    const content = draft.trim();
    setDraft('');
    setSending(true);

    // Optimistic update
    const optimistic = {
      id: `opt-${Date.now()}`,
      sender_id: user?.id,
      receiver_id: activePartnerId,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      await supabase.rpc('send_message', { p_receiver_id: activePartnerId, p_content: content });
      loadConversations();
    } catch {
      // Remove optimistic if failed
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="empty-state">
        <p>Sign in to message friends.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>Sign In</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - var(--header-height) - 48px)', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

      {/* Conversation list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Messages
        </div>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            No conversations yet. Message a friend from their profile.
          </div>
        ) : (
          conversations.map((c: any) => {
            const avatar = getAvatarUrl(c.avatar_id, c.partner_id);
            const preview = c.is_sender ? `You: ${c.last_message || ''}` : (c.last_message || '');
            const isActive = c.partner_id === activePartnerId;
            return (
              <button key={c.partner_id}
                onClick={() => openThread(c.partner_id, c.display_name, c.avatar_id || '')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: isActive ? 'var(--bg-hover)' : 'none',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                onFocus={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onBlur={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.display_name || ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {preview.slice(0, 40)}{preview.length > 40 ? '…' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{timeAgo(c.last_message_at)}</div>
                  {c.unread_count > 0 && (
                    <div style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Message thread */}
      {activePartnerId ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Thread header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activePartnerAvatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border)' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{activePartnerName}</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m: any) => {
              const isMine = m.sender_id === user?.id;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%', padding: '8px 14px',
                    background: isMine ? 'var(--accent)' : 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    color: '#fff',
                  }}>
                    <div style={{ fontSize: 13, wordBreak: 'break-word' }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4, textAlign: 'right' }}>
                      {timeAgo(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={`Message ${activePartnerName}…`}
              maxLength={2000}
              style={{
                flex: 1, height: 40, background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                color: 'var(--text)', padding: '0 16px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !draft.trim()}
              style={{ fontSize: 12, padding: '0 18px', flexShrink: 0 }}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <p style={{ fontSize: 13 }}>Select a conversation to start messaging</p>
          </div>
        </div>
      )}
    </div>
  );
}
