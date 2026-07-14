'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import TitleCard from '@/components/TitleCard';
import type { CustomList, Title } from '@/lib/types';

interface ListItemRow {
  id: string;
  added_at: string;
  titles: Pick<Title, 'id' | 'title' | 'poster_path' | 'media_type' | 'release_date' | 'vote_average'> | null;
}

interface ListItemWithTitle extends Omit<ListItemRow, 'titles'> {
  titles: NonNullable<ListItemRow['titles']>;
}

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next.js 16: params is a Promise
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [list, setList] = useState<CustomList | null>(null);
  const [items, setItems] = useState<ListItemWithTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  async function loadList() {
    setLoading(true);
    setNotFound(false);
    const [listRes, itemsRes] = await Promise.all([
      supabase.from('custom_lists').select('*').eq('id', id).maybeSingle(),
      supabase.from('list_items')
        .select('id, added_at, titles(id,title,poster_path,media_type,release_date,vote_average)')
        .eq('list_id', id)
        .order('added_at', { ascending: false })
        .limit(200),
    ]);
    if (!listRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setList(listRes.data);
    setIsOwner(listRes.data.owner_id === user?.id);
    setItems(
      ((itemsRes.data ?? []) as unknown as ListItemRow[]).filter(
        (r): r is ListItemWithTitle => r.titles !== null
      )
    );
    setLoading(false);
  }

  useEffect(() => {
    // loadList's own setLoading(true) at its top is what this suppresses;
    // the effect body itself has no direct setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function removeItem(itemId: string) {
    await supabase.from('list_items').delete().eq('id', itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
    showToast('Removed from list');
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (notFound || !list) {
    return (
      <div className="empty-state">
        <p>This list doesn&apos;t exist or you don&apos;t have access to it.</p>
        <button className="btn btn-ghost" onClick={() => router.push('/lists')}>← My Lists</button>
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => router.push('/lists')} style={{ marginBottom: 24 }}>
        ← Back to Lists
      </button>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{list.title}</h1>
            {list.description && (
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{list.description}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {list.is_public && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', border: '1px solid #10b981', padding: '3px 10px', borderRadius: 'var(--radius)' }}>
                Public
              </span>
            )}
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{items.length} titles</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>No titles in this list yet.</p>
          <button className="btn btn-primary" onClick={() => router.push('/browse')}>Browse Titles</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {items.map((item) => (
            <div key={item.id} style={{ position: 'relative' }}>
              <TitleCard {...item.titles} />
              {isOwner && (
                <button onClick={() => removeItem(item.id)} title="Remove from list"
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)', borderRadius: '50%', color: '#fff', width: 26, height: 26, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
