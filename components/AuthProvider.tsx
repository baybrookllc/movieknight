'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [prevAuthUserId, setPrevAuthUserId] = useState<string | null>(null);

  // Connect to Zustand store
  const {
    setCurrentSession,
    setUserProfile,
    currentSession,
    userProfile,
    setUserWatchStatus,
    setUserRatings,
  } = useAppStore();

  const loadWatchHistory = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('title_id, status, rating')
        .eq('user_id', userId)
        .is('episode_season', null);

      if (error) throw error;

      const statusMap: Record<string, any> = {};
      const ratingMap: Record<string, number> = {};

      data.forEach(row => {
        if (row.status) statusMap[row.title_id] = row.status;
        if (row.rating && row.rating > 0) ratingMap[row.title_id] = row.rating;
      });

      setUserWatchStatus(statusMap);
      setUserRatings(ratingMap);
    } catch (error) {
      console.error('Error loading watch history:', error);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        setCurrentSession(session);
        if (session?.user?.id) {
          try {
            await Promise.all([
              loadUserProfile(session.user.id),
              loadWatchHistory(session.user.id),
            ]);
          } catch (err) {
            console.error('Data load error (non-fatal):', err);
          }
        }
      } catch (error) {
        console.error('Auth init error:', error);
        setCurrentSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        const newId = session?.user?.id ?? null;
        setCurrentSession(session);

        // Load profile when user signs in
        if (newId && newId !== prevAuthUserId) {
          await Promise.all([
            loadUserProfile(newId),
            loadWatchHistory(newId),
          ]);
        }

        // Clear profile when user signs out
        if (!newId && prevAuthUserId) {
          setUserProfile(null);
          setUserWatchStatus({});
          setUserRatings({});
        }

        setPrevAuthUserId(newId);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [prevAuthUserId, setCurrentSession, setUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = '/login';
  };

  const resetPasswordForEmail = async (email: string) => {
    // Validate against env-configured allowed origins. Falls back to the
    // canonical production URL if the current origin isn't in the list.
    const envOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? '';
    const allowedOrigins = envOrigins
      ? envOrigins.split(',').map((o) => o.trim()).filter(Boolean)
      : ['https://movieknight.ca', 'https://www.movieknight.ca', 'http://localhost:3000'];
    const origin = allowedOrigins.includes(window.location.origin)
      ? window.location.origin
      : 'https://movieknight.ca';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const setSession = async (tokens: { access_token: string; refresh_token: string }) => {
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error) throw error;
  };

  const refreshProfile = async () => {
    if (!currentSession?.user?.id) return;
    await loadUserProfile(currentSession.user.id);
  };

  const value: AuthContextType = {
    session: currentSession,
    user: currentSession?.user ?? null,
    profile: userProfile,
    isLoading,
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    setSession,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
