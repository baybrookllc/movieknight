'use client';

import React from 'react';
import { PostHogProvider } from '@/components/PostHogProvider';

// AuthProvider is provided per route-group:
//   (app)/layout.tsx  — for authenticated app pages
//   (public)/layout.tsx — for login/signup pages
// Keeping it here caused a duplicate getSession() call + double subscription on every (app) page.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      {children}
    </PostHogProvider>
  );
}
