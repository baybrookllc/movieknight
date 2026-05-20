'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

interface BadgeCounts {
  notifications: number;
  messages: number;
  friendRequests: number;
}

interface BadgeContextType {
  badges: BadgeCounts;
  refresh: () => void;
}

const BadgeContext = createContext<BadgeContextType>({
  badges: { notifications: 0, messages: 0, friendRequests: 0 },
  refresh: () => {},
});

export const useBadges = () => useContext(BadgeContext);

// Jitter prevents synchronised polling across tabs; TTL stops tab-switch
// visibilitychange from re-firing all 3 RPCs within seconds of each other.
const POLL_MS = 60_000 + Math.floor(Math.random() * 15_000);
const TTL_MS = 30_000;
const ZERO_BADGES: BadgeCounts = { notifications: 0, messages: 0, friendRequests: 0 };

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [badges, setBadges] = useState<BadgeCounts>(ZERO_BADGES);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchBadges = useCallback(async (force = false) => {
    if (!user) {
      setBadges(prev => prev === ZERO_BADGES ? prev : ZERO_BADGES);
      lastFetchRef.current = 0;
      return;
    }
    if (!force && (inFlightRef.current || Date.now() - lastFetchRef.current < TTL_MS)) return;

    const run = (async () => {
      try {
        // Batch calls sequentially to avoid connection pool saturation
        const notifRes = await supabase.rpc('get_unread_notification_count');
        const msgRes = await supabase.rpc('get_unread_message_count');
        const friendRes = await supabase.rpc('get_friend_notification_count');

        const next: BadgeCounts = {
          notifications: Number(notifRes.data ?? 0),
          messages: Number(msgRes.data ?? 0),
          friendRequests: Number((friendRes.data as any)?.pending_requests ?? 0),
        };
        setBadges(prev =>
          prev.notifications === next.notifications &&
          prev.messages === next.messages &&
          prev.friendRequests === next.friendRequests
            ? prev
            : next
        );
        lastFetchRef.current = Date.now();
      } catch { /* polling errors are silent */ }
    })();
    inFlightRef.current = run;
    try { await run; } finally { inFlightRef.current = null; }
  }, [user]);

  useEffect(() => {
    fetchBadges(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchBadges();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchBadges();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchBadges]);

  const refresh = useCallback(() => { fetchBadges(true); }, [fetchBadges]);

  return (
    <BadgeContext.Provider value={{ badges, refresh }}>
      {children}
    </BadgeContext.Provider>
  );
}
