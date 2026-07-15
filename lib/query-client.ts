'use client';

/**
 * Shared TanStack Query client factory.
 *
 * Split out from app/providers.tsx so the defaults live in one place and can be
 * imported by tests without dragging in the React provider tree.
 *
 * Defaults are tuned for this app's data, which is overwhelmingly Supabase
 * reads that change on human timescales (watch status, lists, friends), not
 * live tickers:
 *   - staleTime 60s   — don't re-hit Supabase on every remount/focus. The
 *                       ad-hoc code this replaces never revalidated at all, so
 *                       any revalidation is a strict improvement; 60s keeps the
 *                       row counts sane on a project with a Supabase quota.
 *   - retry 1         — Supabase RLS denials and 4xx are not worth retrying 3×
 *                       (the library default). One retry covers a transient blip.
 *   - refetchOnWindowFocus false — the previous behaviour was "never refetch";
 *                       turning focus-refetch on by default would be a visible
 *                       behaviour change (spinners on tab-switch) that no
 *                       component was written for. Opt in per-query instead.
 */

import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
