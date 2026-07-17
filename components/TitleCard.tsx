'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { TMDB_IMG, releaseYear } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import type { WatchStatus } from '@/lib/types';

interface TitleCardProps {
  id: string;
  title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average?: number | null;
  release_date?: string | null;
  status?: string | null;
  user_rating?: number | null;
  size?: 'sm' | 'md' | 'lg';
  priority?: boolean;
  triggerTopics?: Array<{ topicKey: string; topicName: string }>;
  userTriggerPrefs?: Record<string, 'flag' | 'hide'>;
}

const SIZE_MAP = {
  sm: { width: 120, height: 180 },
  md: { width: 160, height: 240 },
  lg: { width: 200, height: 300 },
};

export default function TitleCard({
  id, title, poster_path, media_type, vote_average, release_date, status: initialStatus, user_rating: initialUserRating, size = 'md', priority = false,
  triggerTopics, userTriggerPrefs
}: TitleCardProps) {
  const { width, height } = SIZE_MAP[size];
  const posterSrc = poster_path ? `${TMDB_IMG}${poster_path}` : null;
  const year = releaseYear(release_date);

  const { user } = useAuth();
  
  const globalStatus = useAppStore(s => s.userWatchStatus[id]);
  const globalRating = useAppStore(s => s.userRatings[id]);
  const { updateUserWatchStatus, updateUserRating, setAddToListTitleId, isBulkEditMode, selectedTitleIds, toggleTitleSelection } = useAppStore();

  const isSelected = selectedTitleIds.has(id);

  const activeStatus = globalStatus !== undefined ? globalStatus : (initialStatus || null);
  const activeRating = globalRating !== undefined ? globalRating : (initialUserRating ? initialUserRating / 2 : 0);

  const [showRating, setShowRating] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Unique per-instance id so each card's rating-badge clipPaths don't collide in a grid
  const ratingClipId = useId().replace(/:/g, '');

  const handleStatusChange = async (e: React.MouseEvent, newStatus: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    setIsUpdating(true);
    const prevStatus = activeStatus;
    const prevRating = activeRating;
    updateUserWatchStatus(id, newStatus as WatchStatus);
    
    if (newStatus === 'not_interested') {
      updateUserRating(id, null);
    }

    if (newStatus === 'watched') {
      setShowRating(true);
    }

    try {
      const { error } = await supabase.from('watch_history').upsert({
        title_id: id,
        status: newStatus,
        ...(newStatus === 'not_interested' ? { rating: null } : {}),
        episode_season: null,
        episode_number: null,
      }, { onConflict: 'user_id,title_id,episode_season,episode_number' });

      if (error) {
        updateUserWatchStatus(id, prevStatus as WatchStatus);
        updateUserRating(id, prevRating);
        if (newStatus === 'watched') setShowRating(false);
      }
    } catch {
      updateUserWatchStatus(id, prevStatus as WatchStatus);
      updateUserRating(id, prevRating);
      if (newStatus === 'watched') setShowRating(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRating = async (e: React.MouseEvent, stars: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    const ratingInt = stars * 2;
    const prev = activeRating;
    updateUserRating(id, stars);

    const { error } = await supabase.from('watch_history').upsert({
      title_id: id,
      status: activeStatus || 'watched',
      rating: ratingInt,
      episode_season: null,
      episode_number: null,
    }, { onConflict: 'user_id,title_id,episode_season,episode_number' });

    if (error) {
      updateUserRating(id, prev);
    }
    
    setTimeout(() => setShowRating(false), 300);
  };

  // Calculate flagged triggers
  const flaggedTriggers = triggerTopics?.filter(t => userTriggerPrefs?.[t.topicKey] === 'flag') || [];

  return (
    <Link href={`/${id}`} style={{ display: 'block', width, flexShrink: 0 }}
      onClick={(e) => {
        if (isBulkEditMode) {
          e.preventDefault();
          e.stopPropagation();
          toggleTitleSelection(id);
        }
      }}
      onFocus={e => {
        const el = e.currentTarget.querySelector<HTMLElement>('[data-title-card-poster]');
        if (el) { el.style.transform = 'translateY(-4px)'; el.style.boxShadow = 'var(--shadow-md)'; }
      }}
      onBlur={e => {
        const el = e.currentTarget.querySelector<HTMLElement>('[data-title-card-poster]');
        if (el) { el.style.transform = ''; el.style.boxShadow = 'var(--shadow-sm)'; }
      }}>
      <div style={{ width, cursor: 'pointer' }}>
        {/* Poster */}
        <div
          data-title-card-poster
          style={{
            width, height,
            background: 'var(--bg-surface)',
            border: isBulkEditMode && isSelected ? '3px solid var(--accent)' : '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            position: 'relative',
            transition: 'transform 0.2s, box-shadow 0.2s, filter 0.2s, opacity 0.2s',
            boxShadow: 'var(--shadow-sm)',
            filter: activeStatus === 'not_interested' ? 'grayscale(100%)' : 'none',
            opacity: activeStatus === 'not_interested' ? 0.6 : 1,
          }}
          onMouseEnter={e => {
            setIsHovered(true);
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={e => {
            setIsHovered(false);
            if (!showRating) setShowRating(false);
            (e.currentTarget as HTMLElement).style.transform = '';
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          {posterSrc ? (
            <Image
              src={posterSrc}
              alt={title}
              fill
              sizes={`${width}px`}
              priority={priority}
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textAlign: 'center', padding: 8,
            }}>
              {title}
            </div>
          )}

          {/* Rating badge */}
          {vote_average && vote_average > 0 && !isBulkEditMode && (
            <div style={{
              position: 'absolute', top: 8, left: 8,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(4px)',
              borderRadius: 4,
              padding: '3px 7px',
              fontSize: 10, fontWeight: 700,
              color: '#fff',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f5c518">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {vote_average.toFixed(1)}
            </div>
          )}

          {/* User Rating badge */}
          {activeRating > 0 && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(4px)',
              borderRadius: 4,
              padding: '3px 7px',
              fontSize: 10, fontWeight: 700,
              color: '#fff',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24">
                <defs>
                  <clipPath id={`star-${ratingClipId}`}>
                    <rect x="0" y="0" width="12" height="24" />
                  </clipPath>
                  <clipPath id={`profile-${ratingClipId}`}>
                    <rect x="12" y="0" width="12" height="24" />
                  </clipPath>
                </defs>
                {/* Left half: Star */}
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" clipPath={`url(#star-${ratingClipId})`} fill="#f5c518" />
                {/* Right half: Profile (User) */}
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" clipPath={`url(#profile-${ratingClipId})`} fill="#fff" />
              </svg>
              {activeRating}
            </div>
          )}

          {/* Trigger warnings badge */}
          {flaggedTriggers.length > 0 && (
            <div
              tabIndex={0}
              role="note"
              aria-label={`Content warnings: ${flaggedTriggers.map(t => t.topicName).join(', ')}`}
              style={{
                position: 'absolute', top: 8, right: activeRating > 0 ? 46 : 8,
                background: 'rgba(245, 158, 11, 0.9)',
                backdropFilter: 'blur(4px)',
                borderRadius: 4,
                padding: '4px 7px',
                fontSize: 9, fontWeight: 700,
                color: '#000',
                display: 'flex', alignItems: 'center', gap: 3,
                cursor: 'help',
              }}
              title={`Triggers: ${flaggedTriggers.map(t => t.topicName).join(', ')}`}
            >
              ⚠ {flaggedTriggers.length}
            </div>
          )}

          {/* Bulk Selection Checkmark */}
          {isBulkEditMode && (
            <div style={{
              position: 'absolute', top: 8, left: 8, zIndex: 20,
              width: 24, height: 24, borderRadius: '50%',
              background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
              border: isSelected ? 'none' : '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000'
            }}>
              {isSelected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </div>
          )}

          {/* Tracker Overlay */}
          {user && !isBulkEditMode && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: showRating ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isHovered || showRating ? 1 : 0,
                pointerEvents: isHovered || showRating ? 'auto' : 'none',
                transition: 'opacity 0.2s, background 0.2s',
                zIndex: 10,
              }}
            >
              {!showRating ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAddToListTitleId(id); }}
                    disabled={isUpdating}
                    style={{
                      background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                      fontSize: 13, cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                      opacity: 0.85, borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.9)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                    title="Add to List"
                  >
                    ➕
                  </button>
                  <button 
                    onClick={(e) => handleStatusChange(e, 'want_to_watch')}
                    disabled={isUpdating}
                    style={{
                      background: activeStatus === 'want_to_watch' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)', 
                      border: `1px solid ${activeStatus === 'want_to_watch' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`, 
                      color: activeStatus === 'want_to_watch' ? 'var(--accent)' : '#fff',
                      fontSize: 13, cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                      opacity: activeStatus === 'want_to_watch' ? 1 : 0.85, 
                      borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: activeStatus === 'want_to_watch' ? '0 0 8px rgba(255,46,99,0.5)' : '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.95)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = activeStatus === 'want_to_watch' ? '1' : '0.85'; e.currentTarget.style.background = activeStatus === 'want_to_watch' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)'; }}
                    title="Want to Watch"
                  >
                    👍
                  </button>
                  <button 
                    onClick={(e) => handleStatusChange(e, 'not_interested')}
                    disabled={isUpdating}
                    style={{
                      background: activeStatus === 'not_interested' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)', 
                      border: `1px solid ${activeStatus === 'not_interested' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`, 
                      color: activeStatus === 'not_interested' ? 'var(--accent)' : '#fff',
                      fontSize: 13, cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                      opacity: activeStatus === 'not_interested' ? 1 : 0.85, 
                      borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: activeStatus === 'not_interested' ? '0 0 8px rgba(255,46,99,0.5)' : '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.95)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = activeStatus === 'not_interested' ? '1' : '0.85'; e.currentTarget.style.background = activeStatus === 'not_interested' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)'; }}
                    title="Not Interested"
                  >
                    ❌
                  </button>
                  <button 
                    onClick={(e) => handleStatusChange(e, 'watched')}
                    disabled={isUpdating}
                    style={{
                      background: activeStatus === 'watched' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)', 
                      border: `1px solid ${activeStatus === 'watched' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`, 
                      color: activeStatus === 'watched' ? 'var(--accent)' : '#fff',
                      fontSize: 13, cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                      opacity: activeStatus === 'watched' ? 1 : 0.85, 
                      borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: activeStatus === 'watched' ? '0 0 8px rgba(255,46,99,0.5)' : '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.95)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = activeStatus === 'watched' ? '1' : '0.85'; e.currentTarget.style.background = activeStatus === 'watched' ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.7)'; }}
                    title="Watched"
                  >
                    ✔️
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Rate</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star}
                        onClick={(e) => handleRating(e, star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        style={{
                          background: 'none', border: 'none', color: star <= (hoverRating || activeRating) ? '#f5c518' : 'rgba(255,255,255,0.3)',
                          fontSize: 24, cursor: 'pointer', padding: 2,
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRating(false); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', marginTop: 8 }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status badge */}
          {activeStatus && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.85)',
              borderTop: '1px solid rgba(255,46,99,0.4)',
              padding: '4px 8px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--accent)', textAlign: 'center',
            }}>
              {activeStatus === 'watching'      ? '▶ Watching' :
               activeStatus === 'watched'       ? '✓ Watched'  :
               activeStatus === 'want_to_watch' ? '+ Want'     : 
               activeStatus === 'not_interested' ? '✕ Not Interested' : activeStatus}
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div style={{ marginTop: 8, width }}>
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            color: 'var(--text)',
          }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            {[year, media_type === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </Link>
  );
}
