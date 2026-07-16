'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import TitleCard from '@/components/TitleCard';
import { batchRpcs } from '@/lib/batch-rpcs';
import { activateOnKey, useFocusTrap } from '@/lib/a11y';
import type { CustomList, WatchStatus, Title } from '@/lib/types';

// ── Local row types matching Supabase join shapes ─────────────────────────────
type SharedList = CustomList & { role: 'editor' | 'viewer' };
type WatchHistoryCount = { status: WatchStatus | null };
type ListMemberRow = { role: 'editor' | 'viewer'; custom_lists: Omit<CustomList, 'is_public'> | null };
type TitleSummary = Pick<Title, 'id' | 'title' | 'poster_path' | 'media_type' | 'release_date' | 'vote_average'>;
// Supabase returns joined rows as objects for foreign-key (many-to-one) joins
type StatusItem = { title_id: string; watched_at: string; titles: TitleSummary | null };

type Tab = 'auto' | 'my-lists' | 'shared';

const AUTO_LISTS: { status: WatchStatus; label: string; color: string; icon: string }[] = [
  { status: 'want_to_watch', label: 'Want to Watch', color: '#0C84FC', icon: '🔖' },
  { status: 'watching',      label: 'Watching',      color: '#e8590c', icon: '▶' },
  { status: 'watched',       label: 'Watched',       color: '#10b981', icon: '✓' },
  { status: 'not_interested',label: 'Not Interested', color: '#6b7280', icon: '✕' },
];

export default function ListsClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('auto');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [myLists, setMyLists] = useState<CustomList[]>([]);
  const [sharedLists, setSharedLists] = useState<SharedList[]>([]);
  const [fetched, setFetched] = useState(false);
  // Derive loading: true while auth is resolving, or once we have a user but haven't fetched yet
  const loading = authLoading || (!!user && !fetched);

  // Expanded auto-list view
  const [expandedStatus, setExpandedStatus] = useState<WatchStatus | null>(null);
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  // Create list modal
  const [showCreate, setShowCreate] = useState(false);
  const createListRef = useRef<HTMLDivElement>(null);
  useFocusTrap(createListRef, showCreate, () => setShowCreate(false));
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [creating, setCreating] = useState(false);

  // Declared before the useEffect that calls it to satisfy the linter
  async function loadAll() {
    if (!user) return;
    try {
      // Sequential to avoid connection pool saturation
      const [countRes, myRes, sharedRes] = await batchRpcs([
        () => supabase.from('watch_history')
          .select('status')
          .eq('user_id', user.id)
          .is('episode_season', null),
        () => supabase.from('custom_lists')
          .select('id,title,description,is_public,created_at')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
        () => supabase.from('list_members')
          .select('role, custom_lists(id,title,description,created_at,owner_id)')
          .eq('user_id', user.id),
      ]);

      // Counts
      const c: Record<string, number> = {};
      for (const row of (countRes.data ?? []) as WatchHistoryCount[]) {
        if (row.status) c[row.status] = (c[row.status] || 0) + 1;
      }
      setCounts(c);

      setMyLists((myRes.data ?? []) as CustomList[]);
      // Supabase returns the foreign join as an object for foreign-key (many-to-one) joins
      const shared = ((sharedRes.data ?? []) as unknown as ListMemberRow[])
        .filter(m => m.custom_lists !== null)
        .map(m => ({ ...m.custom_lists!, is_public: false, role: m.role }));
      setSharedLists(shared);
    } finally {
      setFetched(true);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function openStatusList(status: WatchStatus) {
    setExpandedStatus(status);
    setStatusLoading(true);
    setStatusItems([]);
    const { data } = await supabase
      .from('watch_history')
      .select('title_id, watched_at, titles(id,title,poster_path,media_type,release_date,vote_average)')
      .eq('status', status)
      .is('episode_season', null)
      .order('watched_at', { ascending: false });
    setStatusItems(((data ?? []) as unknown as StatusItem[]).filter(r => r.titles !== null));
    setStatusLoading(false);
  }

  async function createList() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('custom_lists')
      .insert({ title: newTitle.trim(), description: newDesc.trim() || null, is_public: newPublic })
      .select()
      .single();
    setCreating(false);
    if (error) { showToast('Failed to create list', 'error'); return; }
    showToast('List created!', 'success');
    setMyLists(prev => [data, ...prev]);
    setShowCreate(false);
    setNewTitle(''); setNewDesc(''); setNewPublic(false);
  }

  async function deleteList(listId: string) {
    if (!confirm('Delete this list?')) return;
    await supabase.from('custom_lists').delete().eq('id', listId);
    setMyLists(prev => prev.filter(l => l.id !== listId));
    showToast('List deleted');
  }

  if (!user) {
    return (
      <div className="empty-state">
        <p>Sign in to manage your lists and watchlists.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>
          Sign In
        </button>
      </div>
    );
  }

  // ── Status list expanded view ──────────────────────────────────
  if (expandedStatus) {
    const meta = AUTO_LISTS.find(a => a.status === expandedStatus)!;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button className="btn btn-ghost" onClick={() => setExpandedStatus(null)} style={{ fontSize: 12 }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            {meta.label}
          </h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {counts[expandedStatus] ?? 0} titles
          </span>
        </div>

        {statusLoading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : statusItems.length === 0 ? (
          <div className="empty-state">
            <p>Nothing here yet. Mark titles as {meta.label} to see them here.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {statusItems.map((r) => (
              <TitleCard key={r.title_id} {...(r.titles!)} status={expandedStatus} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main lists view ────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Lists</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ fontSize: 12 }}>
          + New List
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {([['auto', 'My Tracking'], ['my-lists', 'Custom Lists'], ['shared', 'Shared With Me']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: tab === t ? 'var(--bg-surface-2)' : 'transparent',
            border: tab === t ? '1px solid rgba(255,46,99,0.4)' : '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            color: tab === t ? 'var(--text)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <>
          {/* Auto Tracking Lists */}
          {tab === 'auto' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {AUTO_LISTS.map(a => (
                <button key={a.status} onClick={() => openStatusList(a.status)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 8, padding: 20,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  }}
                  onFocus={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                  }}
                  onBlur={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  }}>
                  <span style={{ fontSize: 28 }}>{a.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {a.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {counts[a.status] ?? 0} title{counts[a.status] !== 1 ? 's' : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Custom Lists */}
          {tab === 'my-lists' && (
            <div>
              {myLists.length === 0 ? (
                <div className="empty-state">
                  <p>No custom lists yet.</p>
                  <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Your First List</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {myLists.map((l) => (
                    <ListCard key={l.id} list={l} isOwner onDelete={() => deleteList(l.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared Lists */}
          {tab === 'shared' && (
            <div>
              {sharedLists.length === 0 ? (
                <div className="empty-state">
                  <p>No lists shared with you yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {sharedLists.map((l) => (
                    <ListCard key={l.id} list={l} isOwner={false} role={l.role} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create list modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowCreate(false)}>
          <div ref={createListRef} role="dialog" aria-modal="true" aria-label="New list" tabIndex={-1}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 32, width: 420, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>New List</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Title *</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="My Watchlist" maxLength={100}
                style={{ width: '100%', height: 40, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Description</label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional description..." maxLength={500}
                rows={3}
                style={{ width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={newPublic} onChange={e => setNewPublic(e.target.checked)} style={{ width: 16, height: 16 }} />
              Make public
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={createList} disabled={creating || !newTitle.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                {creating ? 'Creating...' : 'Create List'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)} style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── List card component ────────────────────────────────────────
function ListCard({ list, isOwner, role, onDelete }: {
  list: CustomList & { role?: 'editor' | 'viewer' };
  isOwner: boolean;
  role?: 'editor' | 'viewer';
  onDelete?: () => void;
}) {
  const router = useRouter();
  const goToList = () => router.push(`/list/${list.id}`);
  return (
    <div role="button" tabIndex={0} style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)', padding: 20, cursor: 'pointer',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}
    onClick={goToList}
    onKeyDown={activateOnKey(goToList)}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
    }}
    onFocus={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
    }}
    onBlur={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{list.title}</div>
        {isOwner && onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px' }}>
            ×
          </button>
        )}
      </div>
      {list.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {list.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
        {list.is_public && <span style={{ color: '#10b981', fontWeight: 600 }}>Public</span>}
        {role && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{role}</span>}
        <span>{new Date(list.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
