'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { WatchStatus } from '@/lib/types';

function ActionButton({ icon, title, onClick, disabled }: { icon: string, title: string, onClick: () => void, disabled: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        background: hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 16,
        transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
    </button>
  );
}

export default function BulkActionBar() {
  const { user } = useAuth();
  const { 
    isBulkEditMode, 
    setBulkEditMode, 
    selectedTitleIds, 
    clearBulkSelection,
    updateUserWatchStatus,
    updateUserRating
  } = useAppStore();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!user) return null;

  const count = selectedTitleIds.size;

  const handleBulkAction = async (newStatus: string) => {
    if (count === 0) return;
    setIsUpdating(true);
    
    try {
      const rows = Array.from(selectedTitleIds).map(id => ({
        user_id: user.id,
        title_id: id,
        status: newStatus,
        episode_season: null,
        episode_number: null,
        ...(newStatus === 'not_interested' ? { rating: null } : {})
      }));

      const { error } = await supabase.from('watch_history').upsert(rows, { 
        onConflict: 'user_id,title_id,episode_season,episode_number' 
      });

      if (error) {
        console.error('Bulk upsert error', error);
        alert('Failed to update titles.');
        return;
      }

      // Optimistic local update
      Array.from(selectedTitleIds).forEach(id => {
        updateUserWatchStatus(id, newStatus as WatchStatus);
        if (newStatus === 'not_interested') {
          updateUserRating(id, null);
        }
      });
      
      clearBulkSelection();
    } catch (e) {
      console.error(e);
      alert('An error occurred.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => {
          if (isBulkEditMode) {
            clearBulkSelection();
          } else {
            setBulkEditMode(true);
          }
        }}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 50,
          background: isBulkEditMode ? 'var(--bg-surface)' : 'var(--accent)',
          color: isBulkEditMode ? 'var(--text-primary)' : '#000',
          border: isBulkEditMode ? '1px solid var(--border)' : 'none',
          borderRadius: '50%',
          width: 56,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          transition: 'transform 0.2s, background 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title={isBulkEditMode ? "Exit Bulk Edit" : "Enter Bulk Edit Mode"}
      >
        {isBulkEditMode ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        )}
      </button>

      {isBulkEditMode && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {count} selected
          </div>
          
          {count > 0 && (
            <>
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton disabled={isUpdating} onClick={() => handleBulkAction('want_to_watch')} title="Want to Watch" icon="👍" />
                <ActionButton disabled={isUpdating} onClick={() => handleBulkAction('watched')} title="Watched" icon="✔️" />
                <ActionButton disabled={isUpdating} onClick={() => handleBulkAction('not_interested')} title="Not Interested" icon="❌" />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
