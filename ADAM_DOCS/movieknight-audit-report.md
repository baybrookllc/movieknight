# MovieKnight — Ground-Truth Codebase Audit

**Date:** 2026-07-12 · **Branch audited:** `master` (@ `3477455`) · **Method:** 9-dimension structured audit, every high-severity "Confirmed" finding independently re-verified against source. 49 findings total (2 Blocker, 10 High, 16 Medium, 20 Low, 1 downgraded to Inferred on re-check).

> **Known gap in this audit:** Live Supabase advisors (per-table RLS status via `get_advisors`/`list_tables`, query-performance advisor) were **not reachable** — the Supabase MCP had no authorized access token when this ran. Every security/DB finding below is from reading migration SQL and code directly, not from live database introspection. RLS "presence" is confirmed from migration files, not from the running database's actual enabled state. Re-run the security section with a `SUPABASE_ACCESS_TOKEN` to close this.

---

## Blunt summary

**This is "needs targeted fixes + one vertical built from zero," not "rebuild the core."** The core the team actually built — Next.js 16 App Router with real SSR, a coherent Supabase schema, semantic search, social graph, trigger-warning system — is genuine, working, and architecturally sound. That's the good news, and it's a real surprise relative to the brief. The bad news is threefold: (1) the **physical-media marketplace — the one differentiator the product positioning is built on — does not exist in any form**, not even a stub; (2) there is **zero automated test coverage** feeding a pipeline that auto-deploys to production; and (3) there's a scattering of **shipped-but-broken features** (a streaming-platform filter that silently returns nothing, a "Clear all" button that never appears, keyboard navigation that steals your arrow keys) that indicate features are being marked "done" without being exercised end-to-end. None of that requires a rewrite. It requires closing the test gap, fixing the broken-in-production bugs, and deciding whether "physical media marketplace" is real or should be dropped from the positioning. The gap between the five-vertical pitch and the four-vertical (tracking/discovery/streaming/social) reality is the single most important thing on this list.

## Where reality diverges from the stated "assumed context"

The audit brief's assumptions were mostly wrong — stated here because the brief explicitly asked:

| Assumption | Reality |
|---|---|
| "Client-only Vue SPA, no SSR/pre-rendering" | **False.** Next.js 16.2.6 App Router + React 19, with genuine SSR — Home and title-detail pages server-render real content, detail pages have correct per-title `generateMetadata` for SEO/social unfurling. Not Vue, not CSR-only. |
| "No version tags" | **True.** `git tag` is empty despite a v6.5 in `lib/version.ts` and CHANGELOG. Releases are tracked in prose, not tags. |
| "Multiple active branches" | **True.** `master` + `claude/elegant-agnesi-6a348c` (dead, safe to delete) + `claude/sharp-mayer-5e02fe` (genuinely diverged — would strip ~2,945 lines if merged today). |
| "Five product verticals compete for the same UI" | **Four exist** (tracking, discovery, streaming, social). The fifth (physical-media commerce) has **zero code**. It isn't competing for UI — it isn't there. |
| Product identity | **Four different names** for one product: `package.json` → `cinestream`, `README.md` → "StreamSocial", app metadata → "CineStream", domain/branding → "MovieKnight" (movieknight.ca). Evidence of an incomplete rebrand. |

A prior third-party audit (`gemini_feedbac_05242026.md`, Gemini CLI, 2026-05-24) exists. This audit corroborates its real findings (rate-limiter fail-open, hook-ordering issues, `debug-logger` PII risk) and **corrects two of its numbers**: "100+ `any` instances" is now **39**, and the `.in('id', [...])` URL-length risk is **not currently live** (all call sites are bounded). Where this audit goes further: the commerce vertical, the broken streaming filter, framework/rendering identity, testing, accessibility, and deployment/rollback.

---

## 1. Architecture & rendering — *mostly solved*

- **[Low · Confirmed]** Home (`app/(app)/home/page.tsx`) and title-detail (`app/(app)/[titleId]/page.tsx`) are real async Server Components fetching Supabase data and SSR-ing actual title/overview/poster content into first-response HTML. `app/layout.tsx` is a genuine Server Component. This is **not** a CSR shell.
- **[Low · Confirmed]** The title-detail route implements `generateMetadata()` correctly — per-title `<title>`, description, and Open Graph image (TMDB poster), with `revalidate = 3600` (ISR). The shareable/crawlable unit of a media app is done right.
- **[High · Confirmed]** **No `robots.txt` and no `sitemap.xml`** anywhere — no static files, no `app/robots.ts`/`app/sitemap.ts`. This undercuts the otherwise-correct per-title metadata: crawlers have no sitemap to discover the movie/TV detail URLs at scale, and no declared crawl policy. Highest-leverage SEO fix in the repo for a discovery product. *(Verified: full re-scan of `public/`, `app/`, and repo-wide search — zero results.)*
- **[Medium · Confirmed]** The `/browse` listing page **is** genuinely CSR-only for its content — `app/(app)/browse/page.tsx` only forwards `q`/`format` search params; `BrowseClient` initializes `results` empty (`components/BrowseClient.tsx:85`) and populates via client `useEffect`. A crawler gets an empty grid, and there's no `generateMetadata` on this route.
- **[Low · Confirmed]** `proxy.ts` is correct, not misnamed — Next.js 16 renamed the middleware convention to `proxy.ts`. Its `PROTECTED` list correctly excludes `/home`, `/browse`, and title-detail so crawlers reach public content.

**Net:** the "migrate to SSR" question in the brief is moot — SSR already exists and the crawlable unit is well-handled. The only real gaps are the missing sitemap/robots (High) and the CSR-only browse grid (Medium).

## 2. Data model & API layer — *coherent, with one broken feature*

- **[High · Confirmed]** **The streaming-availability feature is two disconnected half-built pipelines, and the user-facing filter is silently broken.** `titles.watch_providers_json` is actively populated with real TMDB watch-provider data (`tmdb-cache/index.ts:651-716`) but **read by nothing in the UI** (the detail page never fetches `action=watch-providers`). Meanwhile `title_streaming_platforms` **is** wired into the browse filter dropdown and the live `browse_titles` RPC (`20260522000001`, lines 63-66) but has **no INSERT path anywhere** — so selecting a streaming platform in Browse always returns zero results. The data the empty table needs is already being fetched by the other, unused pipeline; the two were built independently and never connected. *(CHANGELOG lines 513-514 acknowledge the empty table; nobody noticed the fetch pipeline that would fill it already exists.)*
- **[Medium · Confirmed]** `tmdb-cache` has **one** rate-limiting layer (in-memory per-isolate `Map`), not the "two-layer + Upstash" prior recon assumed — it never imports `_shared/rate-limit.ts`. This is documented in `docs/architecture.md:151-169` as an intentional trade-off ("resets on cold start"), so it's a known limitation, not a defect.
- **[Medium · Confirmed]** The `CircuitBreaker` class is **dead code in the TMDB path** — `tmdb-cache` uses only a plain `fetchWithTimeout` (timeout, no failure-tracking/backoff). The class *is* genuinely used for OpenAI embedding calls (`_shared/openai-embeddings.ts`), so it's not globally dead — just absent where TMDB reliability would benefit.
- **[Low · Confirmed]** `docs/database.md`'s `titles` schema is stale — omits ≥10 real columns (budget, revenue, studios, directors, awards_json, watch_providers_json, trailers_json, theatrical dates…) that have shipped since April 2026.
- **[Low · Confirmed]** Migration history shows **live-patch-in-production**: a byte-for-byte duplicate migration applied a day apart (`20260515000006` == `20260516000001`), and a 4-migration same-day chain fixing a `numeric(3,1)` vs `float` type mismatch that had already reached production as a PostgREST 400.
- **[Low · Confirmed]** Otherwise the schema is **one coherent evolving design** — tracking/discovery/streaming/social all interlock through consistent RPCs and a stable `title_id` (`'movie:550'`) key format. Not bolted-together.

## 3. Physical media commerce — *does not exist*

- **[Blocker · Confirmed]** **The physical-media marketplace has zero code footprint.** Repo-wide searches for `stripe|paypal|checkout|cart|marketplace|inventory|sku` return nothing in any source file (only the audit brief's own prose). No payment SDK in `package.json`. No orders/inventory/SKU tables in any of the 36 migrations. No cart/catalog/checkout routes. *(Verified independently: every candidate "hit" was a SQL `ORDER BY` clause or a coincidental substring in a lockfile hash.)* This is the vertical the positioning calls the key differentiator versus Letterboxd/Trakt/JustWatch/Serializd. It has not been started.

## 4. Code quality & tech debt — *low debt, a few real bugs*

- **[High · Confirmed]** **`BrowseClient` "Clear all" button is broken by operator precedence.** `hasActiveFilters` (`components/BrowseClient.tsx:348`) OR-chains several *string* fields, so it holds a truthy string like `'movie'`, not a boolean. The JSX `{hasActiveFilters || filterHiddenTriggers && (<button>)}` (line 558) parses as `hasActiveFilters || (filterHiddenTriggers && button)` — so whenever any normal filter is active the `||` short-circuits and the button is **skipped** (and a raw value string can leak into the UI as stray text). The button only appears when the unrelated "Hide my warnings" toggle is on by itself — the inverse of intent. *(Spot-checked directly — confirmed.)*
- **[Medium · Confirmed]** A third use-before-declare instance (beyond the two Gemini flagged) in `app/(app)/list/[id]/page.tsx:22` — `loadList()` called in `useEffect` before declaration. Function hoisting makes it non-fatal, but ESLint flags it.
- **[Medium · Confirmed]** The "100+ `any`" figure is stale — real count is **39** across 9 files (18 in `mcp-server/src/index.ts`, 5 in `NotificationsClient`, 4 each in `MessagesClient`/`list/[id]`…).
- **[Medium · Confirmed]** **Branch divergence is asymmetric.** `claude/elegant-agnesi-6a348c` is a strict ancestor of master (0 commits ahead) — safe to delete. `claude/sharp-mayer-5e02fe` has 7 unique commits but branched at v5.7; `git diff --stat` = **56 files, +385/-2945** — merging it now would strip circuit-breaker/retry libs, the entire `TriggerWarnings` feature, `health-monitor`, health-check workflows, and several migrations. It needs deliberate reconciliation or explicit abandonment, not a merge.
- **[Low · Confirmed]** `lib/circuit-breaker.ts` ≈ `supabase/functions/_shared/circuit-breaker.ts` (near-identical, unavoidable Node/Deno split — but drifts silently). `BrowseClient` also duplicates its own trigger-fetch logic inline (lines 216-251) instead of calling its own `fetchTriggersForResults` callback (290-317).
- **[Low · Confirmed]** Three `eslint-disable-next-line react-hooks/set-state-in-effect` comments **don't actually suppress** the rule (wrong placement) — `npx eslint .` still reports all 3, giving false "reviewed & intentional" confidence.
- **[Low · Confirmed]** **Zero TODO/FIXME/HACK/XXX markers** anywhere. There is no abandoned-marker backlog — genuinely clean on this axis.

## 5. Testing & CI — *no safety net*

- **[Blocker · Confirmed]** **Zero automated tests, no test framework, feeding a pipeline that auto-deploys to production.** No vitest/jest/playwright/cypress in either `package.json`, no `test` script, no `*.test.*`/`*.spec.*`/`__tests__` anywhere outside `node_modules`. CI (`ci.yml`) runs lint + `tsc --noEmit` + build + `npm audit` — and stops there. Nothing exercises application behavior before merge to master or deploy. This is *why* the broken-in-production bugs in §2 and §4 shipped: they're exactly the class a single smoke test would have caught.

## 6. Security — *sound, no leaked secrets of consequence*

- **[Medium · Confirmed]** `tv-auth`'s local `getClientIp()` (`tv-auth/index.ts:36`) prioritizes the spoofable `X-Forwarded-For` over `cf-connecting-ip` — the **opposite** of the safer shared helper — undermining its own documented brute-force limits on device-pairing (20 claims/min/IP).
- **[Medium · Confirmed]** The rate limiter (`_shared/rate-limit.ts:34-39`) **fails open** when Upstash env vars are missing (`console.warn` + `return true`) — corroborates Gemini. Network errors *after* config fail closed, so only the missing-config path is silently permissive, in front of paid OpenAI-embedding endpoints.
- **[Medium · Confirmed]** `lib/debug-logger.ts` globally intercepts `console.*`/`onerror`/`fetch` and ships raw, **unredacted** message text + stringified args + stack traces to `/api/debug/ingest`, stored verbatim in Postgres. No sanitization step. Mitigated on the read side (auth-required ingest + RLS restricting reads to owner/service-role), so it's a data-*minimization* risk, not a cross-user leak — any future `console.log` with a token/email gets durably persisted.
- **[Low · Confirmed]** The hardcoded JWT in `20260417000004_content_sync_schedule.sql` is **`role:anon`, not service-role** (decoded and confirmed) — and the target function has `verify_jwt = false`, so the header isn't even enforced. Materially lower severity than it looks; still worth moving to `current_setting()` like the newer migrations do.
- **[Low · Confirmed]** Two CORS helpers coexist: the strict `cors-utils.ts` (used by all 8 edge functions) and a weaker `cors.ts` that falls back to a default allow-origin — the latter is **dead code** (zero importers). Not exploitable; invites a future copy-paste mistake.
- **[Low · Confirmed]** `npm audit`: **0 critical, 4 high** of 467 packages. The reachable one is `protobufjs` via `posthog-js` (ships to client, but the vulnerable server-side parse path is unlikely reachable from a browser SDK; `fixAvailable: true`); the rest are dev/build-only (`path-to-regexp` via `@vercel/config`, `@babel/core`).

## 7. Performance — *two real image/middleware wins*

- **[High · Confirmed]** **`proxy.ts` runs a full Supabase Auth network round-trip (`auth.getUser()`) + CSP-nonce generation on essentially every request** — its matcher only excludes `_next/static`, `_next/image`, `favicon.ico`. So `/api/health` (polled every 5 min), `/api/warmup`, and `manifest.json` all pay for an unconditional Auth round-trip whose result is discarded, and `/api/claude/ask` does the Auth check **twice** (once wasted in proxy, once in the handler at `:109`). Scope the matcher to protected routes.
- **[High · Confirmed]** **The detail page bypasses `next/image` for its largest images** — full-width backdrop hero, poster, and every cast headshot are raw `<img>` with explicit `eslint-disable @next/next/no-img-element` (`DetailClient.tsx:265, 286, 439`). No AVIF/WebP, no responsive `srcset`, no auto lazy-load, despite `next.config.ts` configuring the whole pipeline — which `TitleCard.tsx` *does* use correctly. *(Spot-checked — confirmed.)*
- **[Medium · Confirmed]** Same raw-`<img>` bypass recurs across feeds — `FriendsClient` (activity + recs), `NotificationsClient`, `HomeClient`, both profile pages. Not isolated to detail.
- **[Low · Confirmed]** The Gemini `.in('id', [...])` URL-length concern is **not currently live** — every call site is bounded (client merges ~24-40 ids; server batches cap at 100 or ~140). Non-issue today.
- **[Low · Confirmed]** `BrowseClient` "Load More" appends unbounded to the DOM with no virtualization — mitigated by `next/image` lazy-loading offscreen cards, so low practical cost.
- **[Low · Confirmed]** **No bundle red flags** — lean deps (no moment/lodash/chart lib), the `ai` SDK is server-only, detail page code-splits its two heaviest sections via `next/dynamic`.

## 8. Accessibility — *the weakest dimension; user-facing on a browse UI*

- **[High · Confirmed]** **`BrowseClient`'s custom keyboard grid-nav is harmful and broken.** A window-level `keydown` handler (lines 108-146) hijacks Arrow keys with **no `document.activeElement` check**, so typing ArrowLeft/Right inside the search box has the keystroke stolen and `preventDefault()`'d. And Enter-to-activate calls `.click()` on the wrapper `<div data-title-idx>`, not the inner `<Link>`/`<a>` — since DOM clicks bubble up, never down, this **never navigates**.
- **[High · Confirmed]** Home hero interactive elements are plain `<div>`/`<span onClick>` with **no `tabIndex`/`role`/`onKeyDown`** — the "Quick picks" carousel, Popular Lists rows, and "load more" shortcut are completely unreachable by keyboard or screen reader (`HomeClient.tsx` grep for `tabIndex|onKeyDown|role=` → zero matches).
- **[High · Confirmed]** The trigger-warning badge exposes *which* topics were flagged only via a native `title` tooltip on a non-focusable `<div>` (`TitleCard.tsx:102-119`) — mouse-hover only. Keyboard/screen-reader users see a bare "⚠ N" with no way to learn what N is — on a feature whose entire purpose is protecting sensitive users.
- **[Medium · Confirmed]** Browse search input sets `outline: none` with no replacement focus style (WCAG 2.4.7 fail).
- **[Medium · Confirmed]** Custom modals (trailer, search overlay) lack `role="dialog"`/`aria-modal`, focus trap, and (trailer) any Escape handler — Tab escapes into the page behind.
- **[Medium · Confirmed]** No "skip to main content" link — every page forces a tab through the full header + 9-item sidebar before content.
- **[Medium · Confirmed]** `--text-dim: #555870` fails WCAG AA (~2.5:1) as real text — used for the search placeholder, shortcut hint, and clear-× button.
- **[Low · Confirmed × 4]** Icon-only `×` buttons with no `aria-label`; account dropdown missing `aria-haspopup`/`aria-expanded`/Escape; hover-only affordances with no focus equivalent; search inputs labeled by placeholder only (WCAG 1.3.1/3.3.2). Notably, the codebase gets this *right* in places (trailer close button has `aria-label`, hamburger has `aria-expanded`), so the fix is consistency, not new knowledge.

## 9. Scope vs. maturity — *the four-vs-five-vertical gap is the headline*

**The code is further along than "pre-release" on four verticals and nonexistent on the fifth.** Tracking, discovery (semantic + keyword), streaming display, and social (friends/activity/messages/recommendations/taste-match) are all genuinely implemented on a coherent schema — this is a real, working product for a cinephile who wants to log, discover, and share. But the **physical-media marketplace, the differentiator the positioning leans on, is 0% built** (§3), and one of the four "done" verticals ships a **silently-broken streaming filter** (§2). Combined with four product names in the repo, this reads as a project whose *execution* has outrun its *product definition*: the team is shipping fast and cleanly, but against a spec that still claims a commerce vertical nobody has written a line of. The maturity risk isn't code quality — it's that the marketing story and the codebase describe two different products. Decide which one is real before the marketplace gap becomes a launch-day credibility problem.

## 10. Deployment & ops — *ships fast, can't roll back*

- **[High · Confirmed]** `lighthouse.yml` triggers on `main`/`feat/nextjs-migration` — **branches that don't exist** (repo is `master`). Lighthouse CI has **silently never run**, yet README lists it as active monitoring. *(Spot-checked — confirmed.)*
- **[High · Confirmed]** **No rollback story.** No down/rollback migrations exist; `deploy-migrations.yml` runs `supabase db push` **unconditionally** on every push to master touching migrations, with only a GitHub-issue-comment on failure — no automatic revert. README troubleshooting covers local dev only. A bad production migration has no defined recovery path.
- **[Medium · Confirmed]** **No error tracking/APM** — zero Sentry references. PostHog is pageview analytics only (no `captureException`) and no-ops silently if its key is unset. `health-monitor` + `health-check.yml` are synthetic uptime pings, not exception capture. The app cannot currently tell you *why* it broke in production, only *that* a health endpoint is down.
- **[Medium · Inferred]** CI doesn't gate the Vercel deploy — Vercel deploys via its own GitHub App independently, so a CI-failing push can still go live unless a branch-protection required-check is configured (not verifiable from repo files — check GitHub settings).
- **[Low · Confirmed]** `app/api/cron/health-check/route.ts` is dead code — nothing calls it (the workflow hits the edge function directly; the `vercel.ts` cron block is commented out).

---

## Prioritized roadmap

Ordered by (impact × urgency) ÷ effort. Estimates are solo technical work, hours/days.

### 🔴 Fix now — broken-in-production bugs + the blocking gap

| # | Item | Effort | Done when |
|---|---|---|---|
| 1 | **Fix the silently-broken streaming filter** (§2). Wire the existing `watch_providers_json` fetch pipeline into `title_streaming_platforms` (an edge-function/cron INSERT path), *or* hide the platform filter until data exists. Don't ship a filter that always returns zero. | 1 day (wire pipeline) / 1 hr (hide filter) | Selecting a platform in Browse returns correct results, or the control is gone. Verified by clicking it. |
| 2 | **Fix `BrowseClient` "Clear all" precedence bug** (§4) — parenthesize `{(hasActiveFilters || filterHiddenTriggers) && (…)}` and coerce `hasActiveFilters` to boolean. | 30 min | Button appears whenever any filter is active; no stray text; verified in browser. |
| 3 | **Add `app/robots.ts` + `app/sitemap.ts`** (§1) — sitemap enumerating title-detail URLs from `titles`. Biggest SEO lever for a discovery product. | 3-4 hrs | `/robots.txt` and `/sitemap.xml` resolve with real content; detail URLs listed. |
| 4 | **Establish a test harness + critical-path smoke tests** (§5) — Vitest + Playwright; cover auth (login/signup), browse-search-returns-results, detail-page-renders, and the two filters above. Add a `test` job to `ci.yml`. This is the Blocker's *first increment*, not full coverage. | 2-3 days | `npm test` runs in CI and gates merge; the §2/§4 bugs would now fail a test. |
| 5 | **Fix or delete `lighthouse.yml`** (§10) — retarget to `master` or remove it, and correct the README's monitoring claims. | 30 min | Lighthouse runs on real pushes, or the workflow and its README claim are gone. |
| 6 | **Fix the arrow-key hijack** (§8) — guard the `keydown` handler on `document.activeElement` not being a text field; make Enter activate the inner link (`el.querySelector('a')?.click()` or navigate via router). | 2 hrs | Typing in search moves the caret; Enter on a focused card navigates. |

### 🟡 Next milestone — high-value structural work

| # | Item | Effort | Done when |
|---|---|---|---|
| 7 | **Decide the commerce vertical** (§3, §9) — the product-defining call. Either scope + build the marketplace (catalog → cart → Stripe checkout → inventory → orders schema) or **remove it from positioning**. If building: this is the large one. | Positioning decision: hours. Build: **3-5 weeks** (flagged as multi-week because it's net-new full-stack across schema, payments, UI — the one place hours/days doesn't apply). | Either a working catalog→checkout flow with a real order in the DB, or positioning/docs no longer claim a marketplace. |
| 8 | **Accessibility remediation pass** (§8) — keyboard reachability on home hero, dialog semantics + focus trap + Escape on modals, skip-link, fix `--text-dim` contrast, focusable trigger-warning badge, aria-labels on icon buttons. | 2-3 days | Keyboard-only user can reach and activate every interactive element; axe/Lighthouse a11y ≥ 90; badge topics readable without a mouse. |
| 9 | **Migrate detail + feeds to `next/image`** (§7) — replace the raw `<img>` in `DetailClient` and the five feed surfaces. | 1 day | No raw `<img>` for TMDB images (lint rule re-enabled); LCP on detail improves measurably. |
| 10 | **Scope `proxy.ts` matcher** (§7) — exclude `/api/*` and non-image static from the auth+CSP path; drop the double `getUser()` on `/api/claude/ask`. | 3 hrs | Health/warmup/api routes no longer trigger an Auth round-trip; TTFB on those improves. |
| 11 | **Add error tracking** (§10) — Sentry (or equivalent) on client + edge functions + API routes. | 1 day | Unhandled exceptions surface in a dashboard with stack traces; a deliberately-thrown test error appears. |
| 12 | **Reconcile branches + define rollback** (§4, §10) — delete `elegant-agnesi`; explicitly rebase-or-abandon `sharp-mayer`; document a migration-rollback procedure (down-migrations or a tested `supabase db` restore path). | 1 day | One documented rollback procedure exists and has been dry-run; stale branch deleted; `sharp-mayer` decision recorded. |

### 🟢 Later — polish / correctness hygiene

| # | Item | Effort | Done when |
|---|---|---|---|
| 13 | **Unify product naming** (§9) — pick one (MovieKnight) across `package.json`, README, app metadata. | 1-2 hrs | One name repo-wide. |
| 14 | **Redact `debug-logger` before persistence** (§6) — strip auth headers/tokens/emails before `/api/debug/ingest`. | 3 hrs | Known-sensitive patterns don't reach the DB; verified with a test log line. |
| 15 | **Delete dead code** (§2, §6, §10) — unused `cors.ts`, `cron/health-check/route.ts`, and the `CircuitBreaker` import gap in the TMDB path (either wire it in or note why not). | 2 hrs | Dead files removed; `npx eslint` clean of the ineffective disable comments. |
| 16 | **Fix `tv-auth` IP-header order + rate-limiter fail-open alerting** (§6) — match the safer shared helper; make the missing-Upstash path at least alert loudly. | 2 hrs | `tv-auth` prioritizes `cf-connecting-ip`; a missing-config rate-limiter state is observable. |
| 17 | **Version tags + doc refresh** (§ intro, §2) — tag releases (`git tag v6.5`); refresh `docs/database.md` `titles` schema. | 2 hrs | Tags match `lib/version.ts`; schema doc lists all real columns. |
| 18 | **Address the 39 `any` + reachable `npm audit` fix** (§4, §6) — type the worst offenders; `npm audit fix` for `protobufjs`. | 3-4 hrs | `no-explicit-any` count trending down; 0 high advisories in prod deps. |

---

*Findings sourced from a 9-agent structured audit with adversarial re-verification of all Blocker/High Confirmed claims; a sample re-checked by hand against source before publication. Live Supabase advisor data was unavailable — re-run §6 with an access token to confirm runtime RLS state.*
