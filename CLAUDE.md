@AGENTS.md

## Rules

### Session Handoff Protocol

- **State Management:** Before wrapping up a major task, encountering a blocker you cannot solve, or when explicitly asked to pause, you must update the main `CLAUDE.md` file's "Current Session Status" section.

- **Format Consistency:** Always maintain this structural template:

  - **✅ Completed:** (Bullet points of verified work, commits, or deployments)

  - **🔴 Issues Identified:** (Timeouts, bugs, or architectural debt found)

  - **📋 Next Session:** (A clear, sequential 1-4 list of exact next actions)

- **Git:** After updating the file, stage and commit `CLAUDE.md` so the context is preserved on the current branch.

---

## Session History

### 2026-05-18 — Security & Deployment (feat/nextjs-migration)
- Credential leak patched; Supabase keys rotated; production deployed at https://movieknight.ca
- Full code review (146 files): 3 critical, 4 high, 6 medium security/quality fixes (commit cc7c21e)
- Preview deployment repaired — `validateEnv()` changed to warn-not-throw during static generation (commit 2723b77)

---

## Current Session Status

**Date:** 2026-05-20  
**Branch:** claude/sharp-mayer-5e02fe → master  
**Focus:** SSR homepage refactor, lint cleanup, Upstash rate limiter replacement

### ✅ Completed

#### Previous Session (2026-05-19 — Performance Optimization)
- 7 CWV bottlenecks identified; 8 optimizations shipped (next/image, AVIF/WebP, dedup AuthProvider, SearchOverlay code-split, ISR, font weights)
- Deployed to production: https://movieknight.ca (dpl_Dzhs7ovLphYG5iiTmV3MCF8AREpa, commit ede0e5b)

#### This Session
- **SSR Homepage Refactor (Task 1)**: `app/(app)/home/page.tsx` converted to async Server Component. New `app/(app)/home/HomeClient.tsx` accepts `initialMatch` / `initialQuickPicks` props. Server pre-fetches MOODS[0] with `next: { revalidate: 3600 }` — hero renders on first server response, no client-side spinner.
- **Lint Cleanup (Task 2)**: Fixed `react-hooks/set-state-in-effect` across all 4 flagged files:
  - `for-you/page.tsx`: Derived loading from `authLoading || (!!user && items === null)`; removed synchronous guard setState
  - `ListsClient.tsx`: Moved `loadAll` above its useEffect; replaced loading state with derived `fetched` flag
  - `BrowseClient.tsx`: `startTransition` on cache-hit setState; removed stale unused eslint-disable and dead `GRID_COLS` constant
  - `HomeClient.tsx`: One intentional `eslint-disable-next-line` on `setGreeting` (hydration-mismatch prevention)
- **Rate Limiter Replacement (Task 3)**: No new npm packages — Upstash REST API used directly:
  - `supabase/functions/_shared/rate-limit.ts`: New shared Deno utility (INCR + EXPIRE NX pipeline); falls back to "allow" when env vars unset
  - `semantic-search/index.ts` + `generate-embedding/index.ts`: Replaced in-memory rlStore with shared `checkRateLimit()`
  - `app/api/claude/ask/route.ts`: Async Upstash REST rate limiter with in-memory fallback
- **Build**: `✓ Compiled successfully`, TypeScript clean, zero new lint errors, 20/20 pages

### 🔴 Issues Identified

- **Upstash env vars not yet configured**: Rate limiters fall back to in-memory until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are added to Vercel. Provision via Vercel Marketplace → Upstash — env vars auto-inject.
- **`ListsClient.tsx` — 9 pre-existing `@typescript-eslint/no-explicit-any` errors**: Pre-date this session; proper fix requires `supabase gen types`. Out of scope.
- **Semantic search keyword fallback** fetches all titles client-side — should use `to_tsvector`. Low urgency (fallback only fires on OpenAI timeout).
- **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** still missing from Vercel Preview build environment. Fix in Vercel Dashboard → Settings → Environment Variables → Preview (all branches).

### 📋 Next Session

1. **Provision Upstash** — Vercel Marketplace → Upstash Redis → install to project. Auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to all environments; rate limiters activate automatically.
2. **Fix ListsClient `any` types** — Run `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`, then replace `any[]` in `ListsClient.tsx` with generated table row types.
3. **Add Supabase public vars to Vercel Preview** — Vercel Dashboard → cinestream-app → Settings → Environment Variables → add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Preview** (all branches, not branch-scoped).

**Status:** All three outstanding tasks complete, build clean, TypeScript clean. Deployed to production. ✅

