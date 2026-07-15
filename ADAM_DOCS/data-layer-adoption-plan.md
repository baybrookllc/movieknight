# Data-Layer Adoption Plan — TanStack Query

**Status:** Phases 0–2 **complete** (v6.27, v6.28). Phases 3–5 not started.
**Author:** Claude · **Date:** 2026-07-15

## 1. Why this exists

The architecture audit (§1.1) found the same `useState(loading)` / `useState(error)` /
`try-catch-finally` scaffold copy-pasted across ~14 components. We first extracted a local
`lib/hooks/useAsyncData.ts` (v6.24) and migrated the 5 call sites that were a clean fit.

That attempt is what produced the real finding: **only 5 of the ~14 were mechanically
migratable.** The rest resisted for consistent, structural reasons:

| Blocker | Components |
|---|---|
| Optimistically mutate already-loaded data (hook's `data` is immutable) | `list/[id]`, `TriggerWarnings` |
| Silent background refresh (a `reload` that toggles `loading` would flash a spinner) | `MessagesClient` |
| Realtime subscription pushing into state | `MessagesClient` |
| Tab-parameterized loader → 5 arrays behind one `loading` flag (dependent queries) | `FriendsClient` |
| Bespoke debounce + own race-guard + dual-source merge | `SearchOverlay` |

Every one of those is a *cache* problem, not a *boilerplate* problem. A hand-rolled hook can't
solve them without becoming a cache library. Hence: adopt a real data layer.

## 2. Library choice: TanStack Query (not SWR)

This inverts the "obvious" pick, so the reasoning is recorded here.

|  | SWR | TanStack Query |
|---|---|---|
| Bundle | ~4 KB | ~13 KB |
| Weekly downloads | ~7.7M | ~12.3M (overtook SWR in late 2024) |
| Sweet spot | read-heavy, simple mutations | **mutations, optimistic updates, cache invalidation, dependent queries** |
| DevTools | none official | yes |
| Next.js/RSC story | **first-class** — Next 16 docs document `<SWRConfig fallback>` with unawaited promises (SWR 2.3.0+/React 19+) | `HydrationBoundary` (equivalent, less showcased) |

**Decision: TanStack Query.** The bolded row is precisely the list of blockers in §1 — MovieKnight
is *not* a read-heavy app with simple mutations. SWR's RSC-handoff advantage is real but currently
unused: our server pages hand data to clients via props, not an SWR fallback. If we later want that
pattern, TanStack's `HydrationBoundary` covers it.

Cost: ~9 KB on a ~180 KB bundle (~5%). Lighthouse CI guards the regression.

Sources: [PkgPulse 2026 comparison](https://www.pkgpulse.com/guides/tanstack-query-vs-swr-2026) ·
[Refine comparison](https://refine.dev/blog/react-query-vs-tanstack-query-vs-swr-2025/) ·
Next.js 16 docs (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`,
`.../02-guides/single-page-applications.md`)

## 3. Two findings that shape the migration

### 3.1 `AuthProvider` must only be **half**-migrated
Reading `components/AuthProvider.tsx` closely, it is a hybrid:
- **Session** — event-driven *push* via `supabase.auth.onAuthStateChange`. A query cache models
  request/response, **not** subscriptions. This listener **stays as-is**.
- **Profile** — `loadUserProfile()` fetching the `profiles` table. A textbook query, keyed on
  `user.id`. `refreshProfile()` is already a manual revalidate → becomes `invalidateQueries`.

A naive "migrate AuthProvider to TanStack" would fight the auth listener and lose.

### 3.2 Much of the Zustand store is a hand-rolled cache
`lib/store.ts` (378 L) mixes genuine UI state with **server data**:

- **Server data (cache — TanStack should own):** `lastResults`, `heroSlides`, `listRatingMap`,
  `watchStatusMap`, `watchRatingMap`, `notInterestedSet`, `taggedSet`, `userTriggerPrefs`, `dtddCache`
- **Genuine client/UI state (Zustand keeps):** `filterState`, `currentView`, `browseOffset`,
  `twPanelOpen`, the various timers

So this adoption is also the fix for audit §2.4. The rule going forward:
**TanStack = server state · Zustand = client state.**

## 4. Phasing

Each phase = its own PR, version bump, CI E2E gate.

| Phase | Scope | Status |
|---|---|---|
| **0** | Install `@tanstack/react-query`; `QueryClientProvider` in `app/providers.tsx`; defaults in `lib/query-client.ts` | ✅ **Done** (v6.27) |
| **1** | Migrate the 5 `useAsyncData` sites → `useQuery`/`useMutation`; **delete `useAsyncData`** | ✅ **Done** (v6.27) |
| **2** | `list/[id]` + `TriggerWarnings` — the optimistic-mutation unlock (`onMutate`/rollback) | ✅ **Done** (v6.28) |
| **3** | `AuthProvider` **profile half only** (keep `onAuthStateChange`) | ⬜ |
| **4** | `MessagesClient` (Realtime → `setQueryData`), `FriendsClient` (dependent queries per tab) | ⬜ |
| **5** | `BrowseClient` / `HomeClient` (`useInfiniteQuery`) + shrink the Zustand store per §3.2 | ⬜ |

## 5. Why `useAsyncData` was deleted in Phase 1

It shipped in v6.24 and was deleted ~an hour later. Keeping it *alongside* TanStack would mean two
competing data patterns — exactly the AI-generation artifact the original audit set out to remove.

It was not wasted work: attempting it is what surfaced the §1 blocker table (we only know the
constraints because we tried), and it fixed two real `TrackerRow` bugs (unreachable logged-out
"Sign in" prompt; load-time "empty tracker" flash) that survive in the TanStack version.

## 6. Gotchas found in Phase 1 (apply to later phases)

- **`isPending` is `true` for a *disabled* query.** A disabled query has no data and never will, so
  `isPending` stays true forever. Every `enabled: !!user` query must gate its spinner:
  `const loading = !!user && isPending;` — otherwise logged-out branches become unreachable
  (this is the exact bug class we fixed in `TrackerRow`).
- **Never pass `refetch` straight to `onClick`.** The click event is received as `refetch`'s options
  argument. Wrap it: `onClick={() => refetch()}`.
- **`QueryClient` must be created via `useState`, not a module singleton** — a shared client leaks
  one user's data into another's SSR render.

## 7. Risks

- **No local browser verification** (sandbox has no Supabase creds), so we lean entirely on CI E2E.
  **Extend E2E coverage before Phase 4–5**, not after.
- **Next.js 16 has breaking changes vs. training data** (`AGENTS.md`) — read
  `node_modules/next/dist/docs/` before writing provider/hydration code.
- **Phase 5 touches everything**; it should probably be split further when we get there.
- Defaults chosen in `lib/query-client.ts` (`staleTime: 60s`, `retry: 1`,
  `refetchOnWindowFocus: false`) deliberately preserve the old "never revalidate" behaviour rather
  than introducing surprise refetches. Revisit per-query as components migrate.
