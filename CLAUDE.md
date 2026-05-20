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

**Date:** 2026-05-19  
**Branch:** claude/sharp-mayer-5e02fe (worktree off master)  
**Focus:** Core Web Vitals performance optimization

### ✅ Completed

#### Performance Audit (Phase 1)
Identified 7 bottlenecks across LCP, INP, TTFB, and bundle size:
- No `next/image` anywhere — all raw `<img>` tags, no WebP/AVIF, no preloading
- Homepage 100% client-side: 3 sequential network hops before any content renders
- Duplicate `AuthProvider` mounting on every app page (double `getSession()` + double listener)
- 6 Inter font weights loaded (400–900); only 4 needed
- `SearchOverlay` always mounted with active keyboard listeners, never code-split
- Quick-pick `<img>` tags had no `loading` attribute (eager by default)
- `next.config.ts` missing AVIF/WebP formats and `optimizePackageImports`

#### Performance Optimizations (Phase 2) — 8 changes, build verified clean
- **`next.config.ts`** — Added `formats: ['image/avif', 'image/webp']`, `deviceSizes`, `imageSizes`, `experimental.optimizePackageImports: ['posthog-js']`
- **`components/TitleCard.tsx`** — Replaced raw `<img>` with `next/image` (`fill` mode, auto lazy, new `priority` prop)
- **`components/BrowseClient.tsx`** — First 6 TitleCards get `priority={true}` (eager + preload link) for above-fold images
- **`app/(app)/home/page.tsx`** — Hero backdrop: CSS `background-image` → `<Image fill priority>` (AVIF, preloadable, responsive sizes); quick-pick `<img>` → `<Image loading="lazy">`
- **`app/(app)/layout.tsx`** — `SearchOverlay` static import → `dynamic()` lazy chunk; `AuthProvider` kept here (single instance)
- **`app/providers.tsx`** — Removed duplicate `AuthProvider` wrapper; PostHogProvider only. Eliminates one `getSession()` + one `onAuthStateChange` subscription on every app-page load
- **`app/layout.tsx`** — Inter font weights: `['400','500','600','700','800','900']` → `['400','600','700','800']` (2 fewer font network requests)
- **`app/(app)/[titleId]/page.tsx`** — Added `export const revalidate = 3600` (ISR: detail page DB queries cached 1 hr); removed unused `TMDB_BACKDROP` import

#### Build Validation (Phase 3)
- `✓ Compiled successfully` — zero TypeScript errors, zero new lint errors introduced
- All 20 pages generated; 7 pre-existing lint errors confirmed pre-existing (not from this session)

### 🔴 Issues Identified

- **Homepage LCP still client-bottlenecked** — hero backdrop `<Image priority>` helps with format/sizing, but the backdrop URL isn't known until after JS hydrates and the semantic search resolves (~3 sequential network calls). Full fix requires an SSR homepage restructure (server action for default mood). Tracked as next-session item #1.
- **7 pre-existing lint errors** in `for-you/page.tsx`, `home/page.tsx`, `BrowseClient.tsx`, `ListsClient.tsx` — `react-hooks/set-state-in-effect` and `@typescript-eslint/no-explicit-any`. Not introduced this session; need a dedicated cleanup pass.
- **In-memory rate limiters** on `/api/claude/ask`, `semantic-search`, `generate-embedding` reset on cold start. Requires Upstash Redis (Vercel Marketplace). Tracked in code with comments.
- **Semantic search keyword fallback** (`supabase/functions/semantic-search/index.ts:200`) fetches all titles client-side — should use `to_tsvector`. Low urgency (fallback only fires on OpenAI timeout).
- **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** missing from Vercel Preview build environment (branch-scoped vars set but CLI deployments don't pick them up). App warns at build time; fix in Vercel Dashboard → Settings → Environment Variables → Preview (all branches).

### 📋 Next Session

1. **SSR homepage refactor** — Move default mood recommendation fetch to a server action or RSC so the hero renders server-side on first load. This is the remaining LCP bottleneck that code changes alone cannot fix. Approach: thin Server Component wrapper for `HomePage` that pre-fetches a default `activeMood=0` result and passes it as `initialMatch` prop to the client component.
2. **PR / merge** — Open a PR from `claude/sharp-mayer-5e02fe` to `master` (or squash-merge directly) so the performance changes ship to production.
3. **Fix pre-existing lint errors** — Dedicated pass to fix `react-hooks/set-state-in-effect` in `home/page.tsx`, `BrowseClient.tsx`, `for-you/page.tsx`, `ListsClient.tsx`.
4. **Replace in-memory rate limiters** — Install Upstash Redis via Vercel Marketplace; replace `rlStore` Maps in `app/api/claude/ask/route.ts`, `supabase/functions/semantic-search/index.ts`, `supabase/functions/generate-embedding/index.ts`.

**Status:** 8 performance optimizations deployed to production at https://movieknight.ca (dpl_Dzhs7ovLphYG5iiTmV3MCF8AREpa, commit ede0e5b). Merged to master and pushed. Homepage SSR restructure is the primary remaining LCP work. ✅

