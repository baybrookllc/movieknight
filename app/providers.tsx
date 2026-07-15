'use client';

import React, { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider } from '@/components/PostHogProvider';
import { makeQueryClient } from '@/lib/query-client';

// AuthProvider is provided per route-group:
//   (app)/layout.tsx  — for authenticated app pages
//   (public)/layout.tsx — for login/signup pages
// Keeping it here caused a duplicate getSession() call + double subscription on every (app) page.
export function Providers({ children }: { children: React.ReactNode }) {
  // useState (not a module-level singleton) so each SSR request gets its own
  // cache — a shared client would leak one user's data into another's render.
  // The initialiser runs once per mount, so the client is stable across renders.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogProvider>
        {children}
      </PostHogProvider>
    </QueryClientProvider>
  );
}
