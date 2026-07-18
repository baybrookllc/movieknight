'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface ListDetail {
  list: CustomList | null;
  items: ListItemWithTitle[];
}

export default function ListDetailClient({ listId: id }: { listId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const listQueryKey = ['list-detail', id, user?.id];

  const { data, isPending: loading } = useQuery({
    queryKey: listQueryKey,
    queryFn: async (): Promise<ListDetail> => {
      const [listRes, itemsRes] = await Promise.all([
        supabase.from('custom_lists').select('*').eq('id', id).maybeSingle(),
        supabase.from('list_items')
          .select('id, added_at, titles(id,title,poster_path,media_type,release_date,vote_average)')
          .eq('list_id', id)
          .order('added_at', { ascending: false })
          .limit(200),
      ]);
      // A missing list isn't an error — it renders the not-found branch below.
      if (!listRes.data) return { list: null, items: [] };
      return {
        list: listRes.data as CustomList,
        items: ((itemsRes.data ?? []) as unknown as ListItemRow[]).filter(
          (r): r is ListItemWithTitle => r.titles !== null
        ),
      };
    },
  });

  const list = data?.list ?? null;
  const items = data?.items ?? [];
  const isOwner = !!list && list.owner_id === user?.id;

  // Optimistic remove. The previous version awaited the delete, ignored its
  // error, then filtered the item out and toasted success unconditionally — so
  // a failed delete (e.g. RLS denial) still vanished the row and claimed
  // success, with the item reappearing on next load. Now the row disappears
  // immediately, and a failure rolls the cache back and says so.
  const { mutate: removeItem } = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('list_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = queryClient.getQueryData<ListDetail>(listQueryKey);
      queryClient.setQueryData<ListDetail>(listQueryKey, (old) =>
        old ? { ...old, items: old.items.filter((i) => i.id !== itemId) } : old
      );
      return { previous };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(listQueryKey, context.previous);
      showToast('Failed to remove from list', 'error');
    },
    onSuccess: () => showToast('Removed from list'),
  });

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!list) {
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
