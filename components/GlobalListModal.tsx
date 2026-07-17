'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/lib/a11y';

interface UserList {
  id: string;
  title: string;
}

export default function GlobalListModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { addToListTitleId, setAddToListTitleId } = useAppStore();

  const modalRef = useRef<HTMLDivElement>(null);
  const showModal = !!addToListTitleId;

  useFocusTrap(modalRef, showModal, () => setAddToListTitleId(null));

  const { data: myLists = [], isLoading } = useQuery<UserList[]>({
    queryKey: ['customLists', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('custom_lists')
        .select('id,title')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: showModal && !!user,
  });

  // Redirect unauthenticated users — as a side effect, never during render.
  useEffect(() => {
    if (showModal && !user) {
      setAddToListTitleId(null);
      router.push('/login');
    }
  }, [showModal, user, router, setAddToListTitleId]);

  if (!showModal || !user) return null;

  const handleAddToList = async (listId: string, listTitle: string) => {
    const { error } = await supabase
      .from('list_items')
      .insert({ list_id: listId, title_id: addToListTitleId });

    if (error?.code === '23505') {
      showToast('Already in this list');
    } else if (error) {
      showToast('Failed to add', 'error');
    } else {
      showToast(`Added to "${listTitle}"`, 'success');
    }

    setAddToListTitleId(null);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={() => setAddToListTitleId(null)}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to list"
        tabIndex={-1}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
          padding: 28, width: 360, maxWidth: '90vw'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add to List</h2>

        {isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Loading...</div>
        ) : myLists.length === 0 ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              No lists yet. Create one first.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => { setAddToListTitleId(null); router.push('/lists'); }}
              style={{ fontSize: 12 }}
            >
              Go to Lists
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {myLists.map((l) => (
              <button
                key={l.id}
                onClick={() => handleAddToList(l.id, l.title)}
                style={{
                  padding: '10px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
              >
                {l.title}
              </button>
            ))}
          </div>
        )}

        <button
          className="btn btn-ghost"
          onClick={() => setAddToListTitleId(null)}
          style={{ marginTop: 12, fontSize: 12, width: '100%', justifyContent: 'center' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
