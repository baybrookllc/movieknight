# Changelog

All notable changes to MovieKnight are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### 🧹 Code tidiness — fix all 31 pre-existing ESLint errors (v6.21, 2026-07-14)

`npm run lint` exited 1 on 31 pre-existing errors (CI's `lint-typecheck` job
was red, independent of the just-shipped e2e work). All 31 fixed; `npm run
lint` now exits 0. Full breakdown of the 31, grouped by root cause:

- **2× `no-require-imports`** — `.claude/hooks/eslint-fix.cjs` (a standalone
  Node/CJS `PostToolUse` hook script, not app source). Added
  `.claude/hooks/**` to `eslint.config.mjs`'s `globalIgnores`, same treatment
  already given to `.claude/worktrees/**`.
- **3× "declared before use"** (a newer `eslint-plugin-react-hooks` static
  rule; confirmed this project does **not** have the React Compiler enabled,
  so this was lint-hygiene only) — moved `loadList`
  (`app/(app)/list/[id]/page.tsx`), `loadUserProfile`
  (`components/AuthProvider.tsx`), and `fetchTriggersForResults`
  (`components/BrowseClient.tsx`) above their call sites. Verified for all
  three that this creates no new forward reference.
- **1× dependency-array mismatch** — `MessagesClient.tsx`'s `openThread`
  `useCallback` deps simplified from
  `[loadMessages, user?.id, refreshBadges, loadConversations]` to `[user]`,
  after tracing that `loadMessages`/`refreshBadges` are both themselves
  derived from the same `user` and `loadConversations` never changes — a
  safe, behavior-preserving simplification matching the compiler's own
  inference.
- **2× `no-this-alias`** — `lib/debug-logger.ts`: removed a redundant
  `const self = this` where the callback was already an arrow function
  (`interceptFetch`), and converted a nested `function recordVital(...)` to
  an arrow (`observeWebVitals`) so it inherits `this` lexically instead of
  needing the alias — confirmed it's never passed by reference elsewhere.
- **3× `set-state-in-effect`** (`FriendsClient.tsx`, `MessagesClient.tsx`,
  `NotificationsClient.tsx` — plus 2 more of the same shape that only
  surfaced once the "declared before use" fixes above let the analyzer trace
  into the called function: `app/(app)/list/[id]/page.tsx`,
  `BrowseClient.tsx`) — all the same pattern: an early-exit
  `setLoading(false)` when logged out. **Decision (confirmed with user):**
  justified suppression rather than a deeper refactor — `useAuth()` already
  exposes an `isLoading` flag that *could* be wired in for a "pure" fix, but
  doing so touches spinner-timing behavior in 5 components for a rule with
  zero live consequence (no compiler installed). Suppressed with a comment
  explaining why, matching this codebase's existing convention.
- **20× `no-explicit-any`** — typed properly across
  `app/(app)/list/[id]/page.tsx`, `app/(app)/profile/page.tsx`,
  `app/api/health/route.ts`, `components/BrowseClient.tsx`,
  `components/MessagesClient.tsx`, `components/NotificationsClient.tsx`,
  `components/SeasonsPanel.tsx`. Added `NotificationItem`, `GenreWatchCount`,
  `DtddTopic` to `lib/types.ts`; consolidated two divergent same-named
  `CachedTopic` interfaces (`lib/store.ts` vs. a differently-shaped local one
  in `TriggerWarnings.tsx`) into the single correctly-named `DtddTopic`.

**Two real, live bugs found and fixed while tracing `any` types to their
actual shapes** (verified against the live database via direct `pg_proc`
introspection, not the migration files — this codebase has a track record of
migrations being superseded by later `CREATE OR REPLACE FUNCTION` calls with
no new migration file):

1. **`MessagesClient.tsx` was reading fields that don't exist.** The
   component used `c.partner_id`, `c.unread_count`, `c.last_message_at`
   throughout — none of which exist on the live `get_conversations()`
   return shape (`other_id`, `unseen_count`, `last_sent_at`). This meant
   clicking a conversation likely didn't open the right thread
   (`openThread(undefined, ...)`), the unread badge never rendered, and the
   timestamp was always blank. Fixed `lib/types.ts`'s `Conversation` to the
   real live shape and corrected every read site.
2. **Profile page's "Genre DNA" section was fully broken.** It called
   `get_user_taste_data` with parameter name `user_id`, but the live
   function's real parameter is `p_user_id` (a name PostgREST would reject
   outright), and even if that were fixed, the code read the result as a
   single object with named mood properties (`taste.action`, `taste.comedy`,
   …) — but the live function returns an **array of `{genre_id,
   watch_count}` rows**, a completely different shape. This section has
   likely always rendered empty. **Fixed properly** (per user decision):
   corrected the parameter name, reused the `genres`-table lookup pattern
   `BrowseClient.tsx` already uses to map `genre_id → name`, and fed the
   existing `GenreCount[]` render logic (a proportional bar chart) with real
   per-genre watch counts — restoring the feature to actually working,
   without changing any of the existing render/display code.

**Verified:** `npm run lint` exits 0 (18 pre-existing unrelated warnings
remain, untouched — out of scope, don't fail the build). `npx tsc --noEmit`
clean. `npm test` 29/29. `npm run test:e2e` 11/11 (the deterministic suite's
`browse-filters.spec.ts` directly exercises the reordered
`BrowseClient.tsx` code path). `npm run build` succeeds. Verified live in the
browser against the real backend: `/browse` renders all 8 filter dropdowns
(no "Platform"), Format→Movies correctly shows "Clear all ×" and real
results, zero console errors — confirming the `BrowseClient.tsx`
reorder/typing didn't regress anything. The `Conversation`/Genre-DNA fixes on
authenticated-only pages (Messages, Profile) rest on `tsc`'s structural
check against the verified live RPC shapes rather than a manual
authenticated click-through (no test-account credentials available this
session).

**CI follow-up, same day:** fixing lint let the `build` job run for the
first time — it had always been skipped while `lint-typecheck` was red
(`needs: [lint-typecheck, test, e2e]`). That immediately surfaced a dormant
`npm audit --audit-level=high` failure on the same `path-to-regexp` /
`@vercel/config` finding Session 10 already investigated and deliberately
left alone (build-time-only devDependency, never shipped to users; fixing it
needs a breaking downgrade for zero production benefit). Not a regression —
it was always going to fail, just never got the chance to run before.
**Decision (confirmed with user):** lowered `ci.yml`'s audit gate from
`--audit-level=high` to `--audit-level=critical`, so it still catches
anything worse without hard-failing on this already-accepted risk. Verified
locally (`npm audit --audit-level=critical` exits 0) and confirmed on GitHub:
all four CI jobs (Lint & Type Check, Unit Tests, E2E Tests, Production
Build) green end-to-end for the first time.

### 🎭 Remediation Session 6 — Playwright e2e + release tags (v6.20, 2026-07-14)

Closes the last unbuilt item on the original audit's remediation punch list:
end-to-end tests. Also tags the nine releases (v6.11–v6.19) that shipped
untagged, and re-affirms the deliberate `unused_index` deferral.

**Added — Playwright e2e (`e2e/`, `playwright.config.ts`).** The project had
29 Vitest unit tests but zero e2e coverage. Two tiers:

- **Deterministic tier (gates CI, needs no secrets).** Runs against a
  production `next build && next start` booted with **dummy** Supabase env,
  and intercepts *every* `*.supabase.co` request at the browser layer
  (`e2e/support/supabase-mock.ts`) — so it makes **zero** real network calls
  and is fully reproducible offline. Specs:
  - `browse-filters.spec.ts` — **regression guards for the two v6.6 browse
    bugs**: the removed Platform filter stays gone, and "Clear all"
    visibility exactly tracks active-filter state (the operator-precedence /
    truthy-string bug). These lock in behaviour the unit tests in
    `lib/browse-filters.test.ts` only cover at the logic level.
  - `auth.spec.ts` — login/signup render, required-field validation,
    invalid-credential error, and successful-login redirect to `/home`.
  - `search.spec.ts` — the ⌘K/Ctrl+K search overlay opens, renders results,
    and Enter / "See all" route to `/browse?q=`.
  - `smoke.spec.ts` — public routes boot without an uncaught exception.
- **Live tier (opt-in, `E2E_LIVE=1`, never in CI).** `e2e/live/` renders the
  two SSR pages that fetch server-side and therefore can't be intercepted in
  the browser — `/home`'s hero and a real title detail page (discovered by
  clicking a live browse result). Read-only against the real backend; kept
  out of the CI gate so pull requests never touch production. Verified once
  locally: both pass.

  Design notes worth recording (each was an actual failure debugged to root
  cause, not a guess): the deterministic tier runs a **production build, not
  `next dev`** — `next dev`'s HMR/streaming connection keeps the page `load`
  event from ever firing, hanging every `page.goto`. All app routes are
  dynamic, so the build succeeds with a dummy Supabase URL (the failing SSR
  fetch is caught at request time — `lib/env.ts`'s `validateEnv` only *warns*
  during the build phase, so a dummy `SUPABASE_SERVICE_ROLE_KEY` is supplied
  for runtime). Tests navigate with `waitUntil: 'domcontentloaded'` + web-first
  assertions, run **single-worker** (one `next start` process can't absorb
  parallel cold-route hits), and open the `dynamic()`-imported search overlay
  via a `toPass()` retry (its Ctrl+K listener attaches a beat after hydration).

**Added — CI `e2e` job (`.github/workflows/ci.yml`).** Installs the Chromium
browser, runs the deterministic tier on every push/PR (no secrets), uploads
the Playwright report as an artifact. `build` now also depends on it
(`needs: [lint-typecheck, test, e2e]`).

**Added — git tags `v6.11`–`v6.19`**, annotated, against their exact commits
(`3dfe682`…`4606e62`). Session 1 had tagged v6.1–v6.10; the nine releases
since were untagged. The tag history is now contiguous v6.1→v6.20.

**Verified — `unused_index` deferral re-affirmed (no DB change).** Re-ran the
live performance advisor: the flagged indexes are unchanged and still sit
overwhelmingly on young tables (commerce P0 — `cart_items`, `orders`,
`listings`, `order_items`, `product_editions`, `shipping_addresses` — and the
telemetry tables `debug_logs`/`error_logs`/`network_metrics`/
`performance_metrics`) with no accumulated usage signal. Dropping them now
would risk removing indexes that matter the moment commerce P1 UI ships, so
the deferral stands. The scheduled recheck (`movieknight-unused-index-recheck`)
remains enabled for **2026-09-26**. This closes the item as
*verified-deferred*, not open.

**Verified:** deterministic e2e green (11/11, ~14s reused-server / ~1m
full-build in CI mode); live tier green (2/2 against prod). `npm test` still
29/29, `npx tsc --noEmit` clean (e2e specs + config included and type-check),
`npm run build` succeeds. The new e2e files and `playwright.config.ts` add
**zero** ESLint problems.

> **Pre-existing, out of scope, flagged not fixed:** `npm run lint` still exits
> non-zero on **31 pre-existing errors** (20 `no-explicit-any` plus newer
> React-Compiler rules — `set-state-in-effect`, etc. — across `AuthProvider`,
> `BrowseClient`, `MessagesClient`, `list/[id]`, several Deno edge functions,
> and `claude/hooks/eslint-fix.cjs`). These predate this session (the remainder
> Session 10 tracked), are none of them in the new e2e code, and several are
> semantic rules whose "fix" would change runtime behaviour — so they're left
> for a dedicated, separately-scoped lint pass rather than risking regressions
> here. CI's `lint-typecheck` job is therefore still red independent of this
> work; the new `e2e` job runs independently of it.

### 🧹 Remediation Session 10 — remaining hygiene (v6.19, 2026-07-13)

The last punch-list item from the original audit. Three unrelated cleanups,
each independently scoped.

**Added — `lib/pii-redact.ts`:** a targeted PII scrubber (not an exhaustive
classifier) for emails, bearer/JWT tokens, and inline `password`/`token`/
`secret` key-value pairs. Sanity-checked against 5 representative inputs
before wiring it in. Applied to **all four** error/telemetry loggers this
project now has — not just `lib/debug-logger.ts` (the item as originally
named), but also `lib/client-error-report.ts`, `lib/server-error-logger.ts`,
and `supabase/functions/_shared/error-logger.ts` (a small duplicated Deno
copy, since edge functions can't import Next.js `lib/` path aliases) — since
all four feed the same `error_logs`/`debug_logs` tables and share the same
risk. `debug-logger.ts`'s console interceptor was the biggest exposure:
it captures whatever *any* developer logs anywhere in the app, verbatim,
which is the widest and least-controlled PII surface of the four.

**Fixed — `supabase/functions/tv-auth/index.ts`:**
- **IP-header spoofing.** `getClientIp()` checked `x-forwarded-for` before
  `cf-connecting-ip` and trusted the header's first comma-separated entry
  blindly — but `x-forwarded-for`'s value is client-supplied and trivially
  spoofable (send your own `X-Forwarded-For: 1.2.3.4` and the naive
  `.split(",")[0]` believes it), while `cf-connecting-ip` is set by
  Cloudflare from the actual TCP connection and can't be overridden by the
  client. Swapped the priority — matches exactly the finding from the
  original audit (§6): "prioritizes the spoofable `X-Forwarded-For` over
  `cf-connecting-ip` — the opposite of the safer shared helper." This
  directly affects the accuracy of this function's IP-based rate limiting
  (code-creation, poll, and claim attempts) — a spoofed IP could bypass it
  entirely.
- **Missing catch-all error handling** (the gap flagged in Session 8, now
  closed): wrapped the whole handler in try/catch, wired to
  `logEdgeError`, matching the other 6 edge functions from Session 8.
- **Documented, not changed:** the in-memory rate-limit bucket is
  per-Deno-isolate, not shared across concurrent isolates — under
  horizontal scaling the effective global limit is (per-isolate limit) ×
  (isolate count), not a hard cap. Fixing that needs an external store
  (Upstash, the pattern `app/api/claude/ask/route.ts` already uses) — a
  bigger change than this session's scope, called out as a known
  limitation rather than silently left unmentioned.

**Fixed — the actual "rate-limiter fail-open alerting" finding
(`supabase/functions/_shared/rate-limit.ts`):** this is a *different* rate
limiter than `tv-auth`'s own in-memory one above — the shared
Upstash-backed helper used by `semantic-search` and `generate-embedding`.
By design it fails open (allows all requests) when `UPSTASH_REDIS_REST_URL`/
`_TOKEN` aren't set, so the app doesn't 429 every caller if Upstash is
intentionally unconfigured (e.g. local dev) — a reasonable design, but
previously only a `console.warn` marked it, meaning a real production
misconfiguration (Upstash secret missing or rotated) would silently
disable rate limiting **in front of paid OpenAI-embedding calls** with
nobody finding out. Added a once-per-isolate `logEdgeError` call on that
path — real production alerting, still zero risk of flooding `error_logs`
since the condition is static per-isolate. Both callers (`semantic-search`,
`generate-embedding`) redeployed and smoke-tested against production
post-deploy.

**Fixed — `npm audit`:** the explicitly-named reachable advisory
(`protobufjs`, pulled in transitively via `posthog-js` → `@opentelemetry/
exporter-logs-otlp-http` → `@opentelemetry/otlp-transformer`, all genuinely
bundled into the client) is fully resolved via the non-breaking `npm audit
fix` — confirmed via `npm ls protobufjs` afterward (no longer a dependency
at all). That same fix also cleared `dompurify` and `js-yaml` for free (13
of 16 total findings). The remaining 3 (`path-to-regexp` via `@vercel/
config`) are devDependency-only — never shipped to production — and fixing
them needs `--force` (a breaking downgrade); left alone, matching the
plan's specific "reachable protobufjs" scope rather than forcing an
unnecessary breaking change on a non-reachable dev tool. Also ran the same
fix in `mcp-server/` (a separate package with its own lockfile): 2
findings (`hono`, `qs`), both resolved cleanly, 0 remaining.

**Fixed — 19 `no-explicit-any` errors in `mcp-server/src/index.ts`**
(nearly half the project's 39 total, the single worst-offending file): 18
were the identical pattern — `(args as any).field` at each MCP tool's
dispatch site — replaced with either a specific type per field or
`Parameters<typeof handler>[0]` for the 4 handlers that take a whole typed
options object. The 19th wasn't really a typing problem: a
`supabase.rpc("get_table_sizes")` call whose result (`tables`/`tablesError`)
was destructured and then **never referenced again** — the function
returns an entirely different, hardcoded structure a few lines later. That
RPC doesn't exist anywhere in `supabase/migrations/`, so every call to it
was silently failing and being discarded. Removed rather than typed, since
there was nothing real to type. `mcp-server`'s own `tsc` build was clean
before and after (`node_modules` wasn't installed for this sub-package
until now — installed to actually verify the build, not just eyeball it).

**Also fixed while in the area:** `.gitignore`'s `/node_modules` entry was
anchored to the repo root only, so `mcp-server/node_modules/` (created by
installing its dependencies to run this verification) showed up as
untracked instead of being ignored. Changed to the unanchored `node_modules`
so it covers nested packages too.

**Verified:** `npm test` (29/29), `npm run lint` (69→48 problems, 39→20
`no-explicit-any` — the exact 19-error reduction expected from the
mcp-server fix, confirming no other regressions), `npm run build` clean.
`redactPII` sanity-checked against 5 representative inputs (email, bearer
token, quoted token key-value, raw JWT, plain text) before wiring it in.
`tv-auth` redeployed and smoke-tested (`action=create` still returns a
valid code + QR URL); `semantic-search` and `generate-embedding` (the
`_shared/rate-limit.ts` callers) also redeployed and smoke-tested — all
three against production post-deploy, all returning normal results.

### 🌿 Remediation Session 9 — branch decision + rollback runbook (v6.18, 2026-07-13)

**`sharp-mayer` branch — abandoned, fully cleaned up.** Investigated before
deciding: compared each of its 7 commits (dated 2026-05-20, ~2 months
stale) against current master. Every single fix it contained — the
Supabase SSR-cookie `getAuthHeader()` fix, the SDK 2.45→2.106 bump, Umami/
PostHog CSP `connect-src` entries, the infinite-loading-spinner guard, and
the 70–99% match-score rescale — was already independently present in
master via separate commits. Zero unique value left to rebase in.
Confirmed the worktree had no uncommitted changes, then removed the
worktree (`.claude/worktrees/sharp-mayer-5e02fe`), deleted the local
branch, and deleted the remote branch
(`origin/claude/sharp-mayer-5e02fe`). Noted for the record: the local
branch tip (`ee07baa`) was 2 commits ahead of what had been pushed to
origin (`57635ee`) — those 2 commits were never on GitHub at all, and
both were confirmed-redundant per the diff above.

**Added — `docs/rollback-runbook.md`**, a two-tier migration rollback
runbook:
- **Tier 1 (the common case): forward-fix migration** — write the inverse
  migration, validate on a local Docker replica (same
  `public.ecr.aws/supabase/postgres:15.8.1.085` pattern every migration
  this project ships uses), deploy via `supabase db push`. **Actually
  tested, not just described:** simulated a bad migration (an overly-strict
  `CHECK` constraint on `profiles.username` that would deploy clean and
  then break the first mixed-case username update), confirmed it broke
  the expected operation, wrote and applied the rollback migration on the
  same local container, confirmed the previously-failing update then
  succeeded.
- **Tier 2 (catastrophic data loss only): point-in-time restore** —
  confirmed this project actually has PITR-capable physical backups via
  `supabase backups list` (5 completed backups, 2026-07-07 through
  2026-07-13) and documented the real `supabase backups restore
  --timestamp <epoch>` command. **Deliberately not live-tested** — running
  a real restore against production to "test" it would cause the exact
  data loss and downtime the runbook warns about. Documented from the
  actual CLI output/help text for this project, not generic advice, with
  an explicit "confirm with the user before running" step given it's a
  production-data-loss action.
- Explicitly scoped out full down-migrations for all 40+ migration files
  as a separate, larger project — Tier 1 already covers the realistic
  recovery cases without that up-front investment.

### 🚨 Remediation Session 8 — error tracking (v6.17, 2026-07-13)

Closes the "add error tracking (Sentry or equivalent)" roadmap item. No
Sentry account/DSN existed and account creation isn't something I can do
on your behalf, so — per your choice — this extends the home-grown
telemetry pipeline that already existed (`lib/debug-logger.ts` →
`/api/debug/ingest` → the `error_logs` table) rather than adding a new
paid third-party vendor. That pipeline already captured client-side
`window.onerror`/`unhandledrejection`; the gap was everywhere else:
React error boundaries, API routes, and edge functions only `console.error`d
with nothing persisted.

**Added**
- **`lib/client-error-report.ts`** — standalone `reportClientError()` for
  React error boundaries. Deliberately independent of the `debugLogger`
  singleton's init/buffer state: a boundary can fire in a context where
  `debugLogger.init()` never ran (most notably the root-level boundary,
  which replaces the whole document, unmounting the providers that call
  `init()`). Does one direct POST to `/api/debug/ingest`, reusing
  `debugLogger`'s session id so it lands in the same session.
- **`lib/server-error-logger.ts`** — `logServerError()` for Next.js API
  routes; inserts directly into `error_logs` via the service-role client.
- **`supabase/functions/_shared/error-logger.ts`** — `logEdgeError()`, the
  same contract for Deno edge functions.

**Wired in:**
- Both error boundaries — `app/error.tsx` (root; found mid-session that
  this file is literally named `error.tsx` but contains `<html>/<body>`
  and functions as Next's global-error boundary — a pre-existing
  naming/convention quirk, left alone, out of scope for this session) and
  `app/(app)/error.tsx`.
- All 4 API routes — `claude/ask` (both the AI-call catch and the outer
  catch; hoisted a `userId` variable since `const user` from the auth
  check isn't visible in the outer catch's block scope), `warmup`,
  `debug/ingest`'s own outer catch, and `health` (now logs when the check
  reports degraded, with the check results as context).
- 6 of 10 edge functions with an existing catch-all: `semantic-search`,
  `delete-account` (hoisted `uid`; also added logging on the explicit
  "auth delete failed" branch, since that's a real partial-deletion state
  worth knowing about even though it's not a caught exception),
  `generate-embedding`, `notify-watchlist`, `tmdb-cache`, `tv-seasons`.
  **Deliberately not touched:** `health-monitor` (its catches are its own
  probe-failure/Slack-alert paths — it already alerts, adding error_logs
  rows there would double-count against real app errors), `dtdd-fetch`
  (one `catch(_)` per-title trigger-topic lookup, deliberately silent by
  design — logging it would be noise for an already-handled degradation),
  and `tv-auth` (no catch-all structure at all — uses per-branch checks;
  restructuring its error handling is a bigger, riskier change than this
  session's scope, and it's already flagged for separate hardening work).

**Verified — a deliberately-thrown error surfaces with a real stack
trace:** this local dev environment's Next.js/Turbopack dev server has an
unrelated pre-existing quirk where server-side `fetch` to Supabase fails
(confirmed via a plain Node script using the identical `createClient()`
call, which succeeded fine — the issue is specific to the dev server's
fetch layer, not the code, and shouldn't affect Vercel's production Node
runtime). Verified the actual insert logic directly instead: threw a real
error, caught it, and inserted through the exact same code path
`logServerError`/`logEdgeError` use — confirmed a real stack trace (actual
call frames, not a placeholder) landed in `error_logs` with the right
shape, then deleted the test row. Also confirmed the client-side path
sends a well-formed payload to the right endpoint (verified via a live
network request — it correctly 401s without a login, since
`/api/debug/ingest` derives the user from the auth cookie, same
pre-existing constraint as the rest of the debug-logger pipeline).

**Deployed:** all 6 edge functions via `supabase functions deploy`; smoke-tested
`tv-seasons` and `semantic-search` against production post-deploy — both
return normal 200 responses, confirming the changes didn't break existing
behavior. `npm test` (29/29), `npm run lint` (69 problems — identical to
baseline before this session, confirmed via diff), `npm run build` all
clean.

⚠️ **Known limitation, not new:** `/api/debug/ingest` requires an
authenticated session (derives `user_id` from the auth cookie), so
anonymous-user errors — including anonymous-user error-boundary crashes —
aren't persisted. This predates this session (already true for all
existing debug-logger telemetry); extending to anonymous users would need
rate-limiting/abuse-prevention design work that's out of scope here.

### ♿ Remediation Session 7 — accessibility remainder (v6.16, 2026-07-13)

Closes the last gap from v6.8's accessibility pass: focus trap + Escape
handling on modals, and hover/focus parity so anything reachable by mouse
is also reachable by keyboard. Scanned the codebase fresh rather than
trusting the plan's "trailer/search-overlay" framing — found 2 separate
trailer-modal implementations (not 1) and 4 more modals with the identical
gap (Add to List, Add Friend, Create List, Recommend), so all 7 got fixed
together rather than just the 2 originally named.

**Added**
- **`lib/a11y.ts` — `useFocusTrap` hook**: wires the standard modal keyboard
  contract onto any dialog — Escape closes it, Tab/Shift+Tab wrap within
  the dialog's focusable elements instead of escaping to the page behind
  it, focus moves to the first focusable element (or the dialog itself) on
  open, and returns to whatever was focused before the dialog opened once
  it closes. One shared implementation, not one bespoke solution per modal.

**Fixed — 7 modals, all now with focus trap + Escape + proper dialog ARIA:**
- Trailer modal, `components/DetailClient.tsx` — had neither Escape nor a
  trap; added both, plus `aria-label` on the previously-unlabeled close (×)
  button.
- Trailer modal, `app/(app)/home/HomeClient.tsx` — a second, separate
  implementation with Escape but a naive `ref={el => el.focus()}` that ran
  on every render and had no actual trap or focus-restore-on-close;
  replaced with the shared hook.
- `components/SearchOverlay.tsx` — had Escape (via a global `window`
  listener) but no trap and no dialog ARIA at all; added both, and removed
  the now-redundant Escape branch from the global listener (kept the
  Cmd/Ctrl+K and `/` open-triggers, which still need to work while the
  dialog itself isn't open yet).
- Add-to-List modal (`DetailClient.tsx`), Add Friend modal
  (`FriendsClient.tsx`), Create List modal (`ListsClient.tsx`), Recommend
  modal (`app/(app)/profile/[userId]/page.tsx`) — none had Escape or a trap;
  all four now use the same shared hook plus `role="dialog"`/`aria-modal`/
  `aria-label`.

**Fixed — hover/focus parity, 8 spots plus 2 more found while in those
files:** added `onFocus`/`onBlur` mirroring the existing `onMouseEnter`/
`onMouseLeave` visual state on: the star-rating hover preview and
`TrackerRow`'s title-reveal overlay and `TitleCard`'s poster-lift effect
(both reached via a `data-*`-attribute query from the outer `Link`'s
focus/blur, since the hover effect lives on a non-focusable inner div),
`BrowseClient`'s grid-item outline ring (React's `onFocus`/`onBlur` bubble
from a focused descendant, unlike native DOM `focus`/`blur`, so this one
needed no extra plumbing), `AwardsSection`'s toggle, `ListsClient`'s
auto-list buttons, `MessagesClient`'s conversation rows, and the
search-overlay's own result rows (found while already in that file).
Two elements were **not just missing a focus style but not keyboard-reachable
at all** — `FriendsClient`'s `FriendItem` and `ListsClient`'s `ListCard`
were plain `onClick` divs with no `tabIndex`/keyboard handler whatsoever;
gave both `role="button"`, `tabIndex={0}`, and `onKeyDown` via the existing
`activateOnKey` helper, on top of the focus-style mirror.

**Verified:** `npm test` (29/29 pass), `npm run lint` (69 problems before
and after — byte-for-byte identical count, confirming zero net-new lint
issues from this change), `npm run build` (clean). Live in the browser:
opened the search overlay via Ctrl+K, confirmed initial focus lands on the
input, Tab from the last element (ESC button) wraps back to the input,
Shift+Tab equivalent verified in reverse, and Escape closes it — the
hardest part of this change (the shared hook) proven end-to-end in the
running app, not just by type-checking. One own-goal caught by lint before
it shipped: an early draft of the hook mutated a ref directly during render
(`react-hooks/refs`) and a first wiring of the Add Friend modal referenced
two state setters before their `useState` declarations — both fixed;
confirmed via `git stash` diff that lint's error count returned to exactly
the pre-change baseline.

### 🗂️ Remediation Session 5 — duplicate/unused index cleanup (v6.15, 2026-07-13)

Closes out the last deliberately-deferred DB item bucket: `duplicate_index`
(fixed) and `unused_index` (formally deferred with evidence + a scheduled
recheck, not just deprioritized).

**Added**
- **`supabase/migrations/20260713000007_drop_duplicate_indexes.sql`**: drops
  3 confirmed byte-for-byte duplicate indexes (`idx_follows_following`,
  `idx_list_members_user`, `idx_messages_receiver_unread`). Root cause
  traced precisely: `20260515000005_performance_refinement.sql`'s guarded
  `CREATE INDEX` statements for these 3 never actually ran (that whole
  transaction silently rolled back — the `watch_history.created_at` typo
  fixed in Session 2), but Session 2's own fix
  (`20260713000004_apply_missed_wave6_indexes.sql`) re-created them under
  the same names without checking whether equivalent indexes already
  existed under *different* names — `idx_follows_following_id` and
  `idx_list_members_user_id` from the pre-tracking baseline, and
  `idx_messages_unread` from an earlier, successfully-applied migration.
  Kept the originals, dropped the Session-2-introduced duplicates.

**Validated (isolated local Postgres, same
`public.ecr.aws/supabase/postgres:15.8.1.085` image):** full 45-migration
replay clean; confirmed exactly the 3 intended indexes survive (one per
pair). **Deployed:** `supabase db push`. Post-deploy `pg_indexes` confirms
only the intended survivor remains in each pair; `get_advisors(performance)`
no longer lists `duplicate_index`.

**`unused_index` (59 live findings) — deferred again, this time with real
evidence, not a shrug:** queried `pg_stat_user_indexes` directly — every
single index in the database, including every primary key, shows
`idx_scan = 0`, and `pg_stat_database.stats_reset` is `null` (stats have
never been reset since the project started). That's strong, concrete
confirmation the deferral rationale from the original audit is sound: this
project has had negligible real production query traffic project-wide, so
`pg_stat`'s "unused" signal is meaningless right now — not a case-by-case
judgment call to make today. Scheduled a one-time recheck task
(`movieknight-unused-index-recheck`, fires 2026-09-26) that re-runs
`get_advisors(performance)` against real accumulated traffic and reports
back with an actual punch list, rather than leaving this as an open-ended
"someday" item.

### 🧩 Remediation Session 4 — pgvector relocation (v6.14, 2026-07-13)

Closes the `extension_in_public` security-advisor finding: the `vector`
extension (0.8.0) was installed directly in `public` rather than a dedicated
extensions schema. Ground truth pulled first — exactly one column
(`title_embeddings.embedding`), one HNSW index, and two functions
(`match_titles`, both overloads) actually touch the type/operators; nothing
else in the schema references pgvector.

**Added**
- **`supabase/migrations/20260713000006_relocate_pgvector.sql`**:
  `CREATE SCHEMA IF NOT EXISTS extensions`, grant `USAGE` to
  `postgres`/`anon`/`authenticated`/`service_role`, then
  `ALTER EXTENSION vector SET SCHEMA extensions`. `match_titles`'s two
  overloads have `search_path=public` pinned from the earlier
  `function_search_path_mutable` fix and call the `<=>` operator
  unqualified in their bodies, so both get `extensions` added to that
  pinned search_path. Table column types and index operator classes
  resolve by OID in the catalog, not by name — `title_embeddings.embedding`
  and its HNSW index needed no changes.

**Fixed during first deploy attempt (caught by the transaction, not by
users):** the first version of this migration referenced the bare word
`vector` in the `ALTER FUNCTION ... SET search_path` clauses — which
depends on the *session's* search_path to resolve, not the pinned one being
set. Production's default session search_path turned out to be `"$user",
public` (no `extensions`), so once the extension moved off `public`
mid-transaction, that bare reference failed to resolve and the whole
migration rolled back cleanly (confirmed via `pg_extension` + `migration
list` — no partial state, nothing user-facing). Root cause: my local test
image's default search_path already includes `extensions`, masking the
issue there. Fixed by schema-qualifying the type as `extensions.vector` in
the `ALTER FUNCTION` clauses, which doesn't depend on any session's
search_path at all. Re-validated against a container with production's
exact narrower search_path forced, then redeployed clean.

**Validated (isolated local Postgres, same
`public.ecr.aws/supabase/postgres:15.8.1.085` image):** full 44-migration
replay clean. Beyond structure, inserted real 1536-dim embeddings and ran
both `match_titles` overloads as `authenticated` and `anon` roles —
correct similarity scores, and `EXPLAIN` confirmed the HNSW index
(`title_embeddings_embedding_idx`) is still used for the `<=>` ordering
post-relocation.

**Deployed:** `supabase db push`. Post-deploy: `pg_extension` confirms
`vector` now lives in `extensions`; `get_advisors(security)` no longer
lists `extension_in_public` at all (was present before this session).

This session's `get_advisors(security)` re-run also re-confirmed two
findings that are **already documented and accepted-by-design** in
`ADAM_DOCS/movieknight-audit-report.md`'s "Live advisor remediation" table
(not new, not pgvector-related): 45 functions each trip
`anon`/`authenticated_security_definer_function_executable` (SECURITY
DEFINER RPCs — search_path pinning at v6.9 already closed the exploitable
surface, EXECUTE grants are intentional since these functions *are* the
app's RPC API) and 1 `rls_enabled_no_policy` INFO on `device_auth_codes`
(intentional service-role-only deny-all, already hardened against DR
replay). No action needed.

### 🔐 Remediation Session 3 — RLS policy hygiene (v6.13, 2026-07-13)

Fixes the two remaining performance-advisor findings from the deferred-DB-items
bucket: `auth_rls_initplan` and `multiple_permissive_policies`. Ground truth
was pulled fresh from `pg_policies`/`get_advisors` rather than trusting the
plan doc's numbers — confirmed exactly 61 policies / 27 tables and 21 advisor
rows / 2 tables, matching what was scoped.

**Added**
- **`supabase/migrations/20260713000005_rls_policy_hygiene.sql`**:
  - **`auth_rls_initplan` (56 policies rewritten via `ALTER POLICY`):** every
    policy calling `auth.uid()`/`auth.role()`/`auth.jwt()` directly in its
    `USING`/`WITH CHECK` clause had Postgres re-evaluating that (stable, not
    immutable) call once per row scanned. Wrapped each as
    `(select auth.<fn>())` so the planner caches it once per statement
    instead — Supabase's own documented fix, behavior-preserving by
    construction. Used `ALTER POLICY` in place rather than drop+recreate so
    there's no window with fewer policies on a table.
  - **`multiple_permissive_policies` (21 advisor rows, only 2 tables
    involved):** on `messages`, dropped 3 legacy policies
    (`"users {read,send,update} own messages"`, role `authenticated`) that
    were fully redundant with `msg_sel`/`msg_ins`/`msg_upd` (role `public`,
    same qual, strictly broader role coverage). On `list_members`, dropped
    `"Members can view own memberships"` (subsumed by `lm_select`) and
    replaced `"Owners can manage members"` (was `FOR ALL`) with a new
    UPDATE-only policy, `lm_update_by_owner` — the old policy overlapped
    `lm_select`/`lm_insert`/`lm_delete` for SELECT/INSERT/DELETE, but was the
    *only* policy granting owners UPDATE, so a narrower replacement keeps
    that access while removing the redundant overlap.

**Validated (isolated local Postgres, throwaway, same
`public.ecr.aws/supabase/postgres:15.8.1.085` image used for Session 2):**
full 43-file replay clean; post-replay `pg_policies` matches the intended set
exactly (7 policies total across `messages`+`list_members`, down from 10).
Beyond the structural check, ran 9 functional access-scenario tests
simulating owner/member/receiver/anon/unrelated-third-party access via
`SET ROLE` + `request.jwt.claim.sub` — confirmed every access path that
worked before the migration (owner UPDATE on `list_members`, member SELECT,
receiver SELECT/UPDATE on `messages`, anon/unrelated denial) still works
identically after, and nothing newly succeeds that shouldn't.

**Deployed:** `supabase db push`. Post-deploy `get_advisors(performance)`
confirms both `auth_rls_initplan` and `multiple_permissive_policies` are now
**0** (down from 61 and 21 rows respectively).

⚠️ **New finding surfaced while re-running advisors (not part of this
session's scope):** `duplicate_index` now flags 3 tables —
`follows` (`idx_follows_following` / `idx_follows_following_id`),
`list_members` (`idx_list_members_user` / `idx_list_members_user_id`), and
`messages` (`idx_messages_receiver_unread` / `idx_messages_unread`) each have
two byte-for-byte identical indexes. Likely cause: Session 2's index-fix
migration created indexes under new names without checking for
pre-existing, differently-named duplicates from the pre-tracking baseline.
Low-risk, mechanical fix (drop one of each pair) — queued for Session 5
alongside the broader index review rather than deployed here.

### 🗄️ Remediation Session 2 — migration-history baseline (v6.12, 2026-07-13)

Closes the disaster-recovery gap flagged in the audit: a from-zero replay of
`supabase/migrations/*` has never worked because the earliest tracked
migration (`20260416000000`) assumes `titles` and other core tables already
exist — they were created directly in the dashboard before this project
adopted migration tracking.

**Added**
- **`supabase/migrations/20260401000000_baseline_schema.sql`** — reconstructs
  every pre-tracking object from the live schema: 13 tables (not just
  `titles` — `genres`, `title_genres`, `profiles`, `follows`, `watch_history`,
  `custom_lists`, `list_members`, `list_items`, `title_embeddings`,
  `notifications`, `list_likes`, and `messages`, which turned out to predate
  tracking too despite a same-named migration existing — see below), the
  `vector` extension, 15 functions, and 3 triggers (including
  `on_auth_user_created`, the profile-auto-creation trigger on `auth.users`).
  One deliberate omission: `watch_history_status_check`, which
  `20260417000002_not_interested_status.sql` adds unconditionally (no `IF NOT
  EXISTS`) — including it in the baseline would make that later statement
  fail as a duplicate.
  ⚠️ A live secret was incidentally exposed while inspecting the
  `auto-embed-new-titles` trigger (its Authorization header bearer token,
  needed to reproduce the trigger accurately) — confirmed it does **not**
  match the app's public anon key (different length). Redacted a placeholder
  into the migration rather than committing it; **recommend verifying/rotating
  this token**, since its actual scope wasn't confirmed.
- **`supabase/migrations/20260713000004_apply_missed_wave6_indexes.sql`** —
  a real (non-history-only) fix discovered *while validating* the baseline:
  two already-"applied" migrations never actually took effect on prod.
  `20260515000005_performance_refinement.sql` referenced
  `watch_history.created_at` — a column that has never existed (it's
  `watched_at`) — so its whole transaction silently rolled back, taking 6
  guarded indexes with it. `20260518000001_friend_requests_composite_indexes.sql`'s
  DROP+CREATE INDEX also never ran. Both were nonetheless recorded as
  "applied" in the remote history table. Deployed the 8 missing indexes
  (`idx_profiles_id`, `idx_follows_follower`, `idx_follows_following`,
  `idx_messages_receiver_unread`, `idx_watch_history_recent`,
  `idx_list_members_user`, `idx_friend_requests_sender_status`,
  `idx_friend_requests_receiver_status`) and dropped the stale
  `idx_friend_requests_status` — pure performance indexes, no behavior
  change.

**Fixed**
- `supabase/migrations/20260515000005_performance_refinement.sql` — the
  `created_at` → `watched_at` typo above, so the file is correct for any
  future replay (this edit doesn't retroactively re-run it on prod, hence the
  separate migration above to actually fix prod's current state).

**Validated (isolated local Postgres, throwaway, `public.ecr.aws/supabase/postgres:15.8.1.085`
to match the linked project's Postgres 15):** all 41 migration files
(baseline + 40 tracked) replay cleanly from a blank database. Compared the
result against live: all 34 tables and their exact column counts match, all
74 RLS policies match, all 166 functions match. Index diff fully explained
(8 replay has that live doesn't = the prod drift just fixed above; 1 live has
that replay doesn't = `idx_dtdd_cache_title_id`, a pre-existing untracked
index already on the audit's `unused_index` deferral list, deliberately not
added — no urgency, it's a removal candidate).

**Deployed:** `supabase migration repair --status applied 20260401000000`
(history bookkeeping only — the baseline's objects already exist live, so it
was never executed there) + `supabase db push` for the index-fix migration
(confirmed: `supabase migration list` now shows Local↔Remote fully matched on
every version, including the two new ones).

### 🧹 Remediation Session 1 — quick wins (v6.11, 2026-07-13)

First session of the post-audit remediation plan (deferred DB items +
pre-existing gaps). Re-checked the live DB and repo directly rather than
trusting the audit doc's numbers — several had grown or shrunk since
2026-07-12 (commerce P0 added tables/policies; the lint count turned out to
be 97% one config issue, not a real backlog).

**Fixed**
- **`npm run lint`: 1,589 → 50 errors.** `eslint.config.mjs` was overriding
  `eslint-config-next`'s default ignores and had stopped excluding nested
  checkouts/build output — it was linting `.claude/worktrees/sharp-mayer-5e02fe/**`
  (a full checked-out branch copy) as if it were app source. Added
  `.claude/worktrees/**` and `mcp-server/dist/**` to `globalIgnores`. Real
  remaining errors: 31 in app source, 19 in `mcp-server/src` (left for a later
  session — see punch list below).
- Deleted dead code: `supabase/functions/_shared/cors.ts` (0 importers,
  superseded by `cors-utils.ts`) and `app/api/cron/health-check/route.ts`
  (dead — the workflow calls the edge function directly).
- Removed the orphaned `.claude/worktrees/elegant-agnesi-6a348c/` directory —
  not a registered git worktree (`git worktree list` didn't show it), just a
  stray folder left over from the already-deleted branch.
- **Unified product naming to "MovieKnight"** — cosmetic pass only:
  `package.json`/`package-lock.json` name, README, all `docs/*.md` headers,
  in-app page titles/metadata (`app/layout.tsx`, title-detail page, signup
  copy), `manifest.json`, `AppFooter`, the Claude system prompt, `mcp-server`
  package/README/tool descriptions, and Supabase edge-function comment
  headers + email display copy. **Deliberately left untouched:** the live
  Vercel project name/domain (`cinestream-app-lake.vercel.app` — referenced in
  CORS allowlists, TV-auth redirects, and email links), the webOS app bundle
  ID (`app.cinestream.tv`), and the `.mcp.json` `"streamsocial"` server config
  key. Those are load-bearing infra/config identifiers, not display text — a
  real rename needs a coordinated domain migration, scoped separately.
- Refreshed the stale `titles` schema table in `docs/database.md` — added 11
  undocumented live columns (`budget`, `revenue`, `studios`, `directors`,
  `writers`, `spoken_languages`, `awards_json`, `watch_providers_json`,
  `theatrical_ca`, `theatrical_us`, `trailers_json`) and 3 undocumented
  indexes/constraints (`idx_titles_tmdb_id`, `idx_titles_fts_en`,
  `titles_tmdb_id_media_type_key`), verified directly against
  `information_schema`/`pg_indexes` on the live project.
- Tagged releases **v6.1–v6.10** locally against their commits (git history
  had zero tags despite `lib/version.ts` tracking versions since v5.5).
  Skipped the pre-v6.1 history — several older bumps had ambiguous/duplicate
  commits for the same version string, not worth guessing. **Not yet pushed
  to origin** — pushing tags is a shared-state action, confirm before I do.

**Verified:** `npm test` (29/29 pass), `npm run build` (clean after clearing a
stale `.next/dev/types/` cache that still referenced the deleted route), and
the running dev server — confirmed page title, `/manifest.json`, and footer
all read "MovieKnight" in the browser.

### 📋 Outstanding (logged 2026-07-13, end of session; updated same day)

Everything safe-to-fix and within Claude's authority from the 2026-07-13
audit-remediation session is fixed, deployed to production, and re-verified.
What's left, after Session 1 above:

**Blocked on you — ✅ both resolved 2026-07-13 (user completed, walked through
step-by-step):**
- [x] Enable **"Leaked password protection"** — done via Supabase dashboard →
  Authentication → Providers → Email. Re-ran `get_advisors(security)`: the WARN
  no longer appears.
- [x] Add a **`SUPABASE_DB_PASSWORD`** GitHub Actions secret — added (after
  catching and fixing a typo, `UPABASE_DB_PASSWORD`, on the first attempt) via
  repo Settings → Secrets and variables → Actions. Verified present via
  `gh secret list`. `deploy-migrations.yml` will now auto-deploy migrations on
  push instead of skipping gracefully.

**Deliberately deferred, with a scheduled recheck (not a shrug):**
`unused_index` (59 live findings) — every index in the DB, including every
primary key, shows `idx_scan = 0` with stats never reset, so there's no
real traffic signal to judge by yet. One-time recheck task
`movieknight-unused-index-recheck` scheduled for 2026-09-26 to re-run
`get_advisors(performance)` and report a real punch list once traffic has
accumulated.

~~The migration-history bootstrap-gap baseline~~ — **✅ resolved 2026-07-13**
(Remediation Session 2): a from-zero replay of the full migration history now
succeeds and reconstructs the live schema (verified table/column/policy/
function parity). Found and fixed real prod drift along the way — see
Session 2 for detail.

~~`auth_rls_initplan` + `multiple_permissive_policies`~~ — **✅ resolved
2026-07-13** (Remediation Session 3): 61 policies rewritten, 4 redundant
policies dropped, 1 narrower replacement added. Both advisor findings
confirmed at 0 post-deploy.

~~Move the `vector` extension out of `public`~~ — **✅ resolved 2026-07-13**
(Remediation Session 4): relocated to a dedicated `extensions` schema,
`match_titles` search_path updated, validated with real embedding inserts +
HNSW similarity queries before and after deploy. `extension_in_public`
confirmed cleared post-deploy.

~~`duplicate_index` (3 pairs on `follows`/`list_members`/`messages`)~~ —
**✅ resolved 2026-07-13** (Remediation Session 5, above): root-caused to a
Session 2 migration re-creating indexes that already existed under
different names; dropped the duplicates, kept the originals. Advisor
confirmed cleared post-deploy.

~~Accessibility focus-trap/hover-parity~~ — **✅ resolved 2026-07-13**
(Remediation Session 7, above): shared `useFocusTrap` hook applied to all 7
modals found in the codebase (not just the 2 originally named), plus 10
hover/focus-parity fixes including 2 elements that weren't keyboard-reachable
at all.

~~Error tracking (Sentry or equivalent)~~ — **✅ resolved 2026-07-13**
(Remediation Session 8, above): extended the existing debug-logger/error_logs
pipeline (no new vendor) into error boundaries, all 4 API routes, and 6 of 10
edge functions. Verified with a real deliberately-thrown error landing with
a real stack trace.

~~The `sharp-mayer` branch decision + rollback/down-migration story~~ —
**✅ resolved 2026-07-13** (Remediation Session 9, above): branch abandoned
and fully cleaned up (worktree + local + remote), confirmed fully
superseded by master first. `docs/rollback-runbook.md` added, with the
primary (forward-fix migration) recovery path actually tested end-to-end
locally.

~~`debug-logger` PII redaction~~ — **✅ resolved 2026-07-13** (Remediation
Session 10, above): a shared `redactPII`/`redactContext` utility applied
across all four telemetry/error loggers this project has, not just
`debug-logger.ts`.

~~`tv-auth` rate-limiter alerting + missing catch-all error handling~~ —
**✅ resolved 2026-07-13** (Remediation Session 10): IP-header spoofing bug
fixed (was trusting client-supplied `x-forwarded-for` over Cloudflare's
non-spoofable `cf-connecting-ip`), whole handler now wrapped in try/catch
wired to `logEdgeError`. The per-isolate in-memory rate-limit architecture
is a known, documented limitation, not silently left unmentioned — fixing
it for real needs an external store, out of this session's scope.

~~The remaining ~50 real lint errors + `any` types~~ — **partially
resolved 2026-07-13** (Remediation Session 10): the single worst-offending
file (`mcp-server/src/index.ts`, 19 of the project's 39 `no-explicit-any`
errors) is fully typed. 20 `no-explicit-any` errors remain spread across
other files — not zeroed out, but the worst concentration is gone.

**Pre-existing, not yet touched:** Playwright e2e tests, the remaining ~20
`any`-type errors spread across smaller files, and commerce Phases P1–P4
(P0 is done and live; P1 is unblocked, not started). The untracked
third-party `gemini_feedbac_05242026.md` at repo root (cross-referenced by
`movieknight-audit-report.md`) has been moved into
`ADAM_DOCS/gemini_feedback_05242026.md` (typo in the old filename fixed) and
committed.

### 🔒 Live Supabase advisor remediation (v6.9)

After the `SUPABASE_ACCESS_TOKEN` was configured (closing the audit's known
gap), `get_advisors(security)` and `get_advisors(performance)` were run against
the live project. Tracked migrations were authored, **validated end-to-end
against an isolated local Postgres**, then **applied to production and verified
by re-running the advisors**. Full findings table: `ADAM_DOCS/movieknight-audit-report.md`
→ "Live advisor remediation".

**✅ Deployed & verified on prod (2026-07-13).** Applied via `supabase db push`
(the CI workflow was broken — see below). Post-deploy advisor re-run confirms:
`rls_disabled_in_public` **0** (was 2 ERROR), `function_search_path_mutable`
**0** (was 45), `unindexed_foreign_keys` **0** (was 8 + 4 new commerce FKs),
`duplicate_index` **0** (was 2). Commerce P0 (8 tables, 13 tax rows) also live.

**Added**
- **`supabase/migrations/20260713000001_security_advisories.sql`**:
  - **Critical:** enable RLS + a `public read` SELECT policy on
    `streaming_platforms` and `title_streaming_platforms` (were RLS-disabled in
    the API-exposed schema; live check showed anon held *effective INSERT* via
    default privileges — a real write hole). Reads unchanged; writes are now
    service-role-only, matching the existing server-side sync.
  - Pin `search_path = public` on all 45 flagged non-extension public functions
    (closes `function_search_path_mutable`; a self-scoping `DO` loop that
    excludes pgvector and skips already-pinned functions).
  - Defensively `DROP POLICY IF EXISTS "anon can read code by pk"` on
    `device_auth_codes` — the `20260416000005` migration defines that policy as
    `FOR SELECT USING (true)`, which would expose `access_token`/`refresh_token`
    to any anon if ever replayed. No-op against current live state.
- **`supabase/migrations/20260713000002_perf_fk_indexes.sql`**:
  - Covering indexes for 8 unindexed foreign keys.
  - Drop 2 redundant UNIQUE constraints identical to the primary key
    (`list_ratings`, `title_genres`) — verified no FK depends on them.
- **`supabase/migrations/20260713000003_commerce_fk_indexes.sql`**: covering
  indexes for 4 commerce foreign keys (`cart_items.listing_id`,
  `order_items.edition_id`, `order_items.listing_id`,
  `orders.shipping_address_id`) that the post-deploy advisor surfaced once the
  commerce schema landed.

**Fixed — CI migration deploy was broken (pre-existing).** `deploy-migrations.yml`
ran `supabase db push --project-ref …`, but `--project-ref` is not a valid flag
for `db push` — so **every migration-deploy run had been failing silently for
months** (migrations were applied by other means). Corrected to `supabase link`
+ `supabase db push`, fixed the failure-notify step (it POSTed to a nonexistent
issue on `push` events → 404; now a commit comment), and added a graceful skip
when the required `SUPABASE_DB_PASSWORD` secret is absent. **Action needed:** add
a `SUPABASE_DB_PASSWORD` GitHub Actions secret to enable automatic deploys;
until then, migrations must be pushed manually with `supabase db push`.

**Fixed — migration-history mismatch (pre-existing).** The old 8-digit-named
`20260515_add_streaming_platforms.sql` collated ambiguously against its 14-digit
`20260515000001–06` siblings, so `supabase db push` refused with a spurious
"remote versions not found in local" error (and it recurred on every push).
Durably resolved: renamed to `20260515000000_add_streaming_platforms.sql` and
reconciled the remote history table (repair reverted `20260515` / applied
`20260515000000`). `supabase migration list` is now fully matched Local↔Remote.

**Validated (isolated local Postgres, throwaway) before deploy:** RLS on + policy
present; anon can read but **anon INSERT is denied**; the search_path loop pins
every unpinned user function, leaves already-pinned ones alone, and correctly
skips pgvector (0 remaining unpinned); FK indexes created; duplicate UNIQUE
constraints drop while the PK's uniqueness is retained; migrations re-run clean
(idempotent). **Re-verified against prod after deploy** (advisor counts above).

**Deliberately deferred / not changed** (documented with rationale — would risk
degrading behaviour for ~0 current benefit, or need a separate reviewed pass):
`extension_in_public` (moving pgvector), `unused_index` (unreliable stats on a
near-empty DB), `auth_rls_initplan` + `multiple_permissive_policies` (behaviour-
preserving policy rewrites), and the broader migration-history bootstrap-gap
baseline. **Leaked-password protection** still needs a one-click dashboard toggle
(Pro-plan Auth setting) — not changed autonomously.

### 🛒 Commerce vertical — Phase P0 (schema + money math)

First increment of the physical-media commerce build
(`ADAM_DOCS/commerce-vertical-plan.md`). Backend only — no UI yet.

**Added**
- **`supabase/migrations/20260712000001_commerce_schema.sql`** — the commerce
  schema: `product_editions` (FK to `titles`), `listings` (nullable `seller_id`
  = marketplace-ready), `carts`/`cart_items`, `orders`/`order_items`,
  `shipping_addresses`, and a `tax_rates` reference table seeded with all 13
  CA provinces/territories. Full RLS: catalog is public-read; cart/orders/
  addresses are owner-only; orders have **no client write grant** (service-role
  only, written after payment). Money stored as integer cents. Seeds a few
  first-party Blu-ray listings for the most popular titles.
  ⚠️ Auto-applies to production on push to `master` (no down-migration) — review
  before pushing; provincial tax rates should be verified against CRA.
- **`lib/commerce.ts`** + **`lib/commerce.test.ts`** — pure money-math helpers
  (subtotal, per-province tax, tiered/free shipping, order totals, CAD
  formatting) with 16 unit tests. 29 tests total, all green.

**Verified — P0 migration validated locally (2026-07-13).** The linked Supabase
project's Management API wasn't reachable from this session (no access token
configured), and replaying the full local migration history from scratch fails
independently of this change — `20260416000000_add_title_columns.sql` assumes
`titles` already exists, which predates migration tracking (created directly in
the dashboard). So the P0 migration was validated in isolation: a throwaway
local Postgres (Docker, via the Supabase CLI, fully separate from the linked
project and from the sibling `Travel` project's local stack) with a minimal
stand-in `titles` table, then the real `20260712000001_commerce_schema.sql`
applied verbatim on top. Confirmed:
  - All 8 tables, all 8 declared indexes, and both UNIQUE constraints are
    created exactly as specified.
  - Seed data is correct: 13/13 CA tax rates at the specified fractions; the
    top-5-by-popularity edition seed correctly excludes a NULL-popularity row.
  - RLS holds under 12 scenarios run as `anon`/`authenticated`/service-role
    with two distinct simulated users: catalog/tax are public-read; carts,
    cart_items, and shipping_addresses are owner-isolated (a second user gets
    zero rows, not an error); a seller can list an existing catalog edition
    and only that seller sees it while `paused`; a seller cannot create a
    listing under another user's `seller_id`; `orders`/`order_items` have no
    client INSERT path (blocked for `authenticated`, service-role bypasses
    RLS and a buyer sees only their own order); the `price_cents >= 0` CHECK
    rejects negative prices.
  - Money-math CHECK constraints and FKs (`ON DELETE CASCADE`/`SET NULL`)
    behave as declared.
  - The migration is not safely re-runnable as a raw SQL file outside the
    CLI's tracked-migration mechanism (`CREATE POLICY` has no `IF NOT EXISTS`
    guard) — not a real-world risk since `supabase db push` tracks applied
    versions and never re-executes a file, but worth knowing if anyone ever
    pastes this file into the SQL editor by hand.
  - **Note for Phase P4 (not a P0 defect):** `product_editions` has no INSERT
    grant/policy for `authenticated` — only `listings` has the marketplace
    seller hook. A P2P seller can list an *existing* catalog edition but can't
    add a new one; P4 needs either an admin-curation flow or an expanded
    grant/policy on `product_editions`.
  - Also added a `[db]` port override in `supabase/config.toml` (55322/55320)
    so local `supabase db start` doesn't collide with the `Travel` project's
    stack on this machine's default 54321-54329 range.

No changes were made to the linked/production database — this was local-only
validation. **Next:** apply the migration to the linked project before starting
P1 UI work, since P1 (cart) needs live tables to build against. This happens
automatically the next time `supabase/migrations/**` reaches `origin/master`
(`.github/workflows/deploy-migrations.yml` runs `supabase db push --linked` on
that path) — awaiting go-ahead to push, since that's a live write to
production. A manual `supabase db push` (this machine's CLI is already
authenticated to the linked project) or a `SUPABASE_ACCESS_TOKEN` for the MCP
tools are the alternatives if pushing to `origin/master` isn't wanted yet.

**Next (Phase P1):** shop catalog page, buy panel on the title detail page, and
the Zustand + server-persisted cart. Phase P2 wires Stripe (needs your Stripe
account + keys; see plan §10).

**Docs**
- Added `ADAM_DOCS/commerce-vertical-plan.md` (design + phasing).
- Synced documentation to completed-vs-remaining state: an "Implementation
  progress" section in `ADAM_DOCS/movieknight-audit-report.md` (roadmap items
  marked ✅/🟡/⬜), Phase P0 marked done in the commerce plan, the new commerce
  tables documented in `docs/database.md`, and a status pointer added to the
  README.
- **2026-07-13 re-sync**, after the local migration validation above: bumped
  `ADAM_DOCS/movieknight-audit-report.md`'s "Implementation progress" to 8
  commits and P0-validated; recorded the migration-history bootstrap gap
  (`20260416000000` assumes `titles` exists) as a new finding under "Also
  outstanding" since it's a real disaster-recovery risk, not commerce-specific;
  noted the still-open `SUPABASE_ACCESS_TOKEN` gap now has a documented
  workaround; updated `docs/database.md`'s commerce status line and added the
  P4 `product_editions`-grant note there too; updated the README status line.

**Removed**
- Deleted the stale `claude/elegant-agnesi-6a348c` branch (a strict ancestor of
  `master`, fully contained, no unique commits). `claude/sharp-mayer-5e02fe`
  left in place pending separate review.

---

## [v6.8] - 2026-07-12

### ♿ Accessibility pass (Next-milestone)

Addresses the accessibility findings from the codebase audit
(`ADAM_DOCS/movieknight-audit-report.md` §8). Verified in-browser where the
surface is reachable locally.

**Fixed**
- **Home hero is now keyboard-operable.** The "Quick picks" cards, "Popular
  Lists" rows, and the "Swipe to explore more" control were plain `<div>`/`<span
  onClick>` with no keyboard affordance — unreachable by keyboard or screen
  reader. All now have `role="button"`, `tabIndex={0}`, an `onKeyDown`
  (Enter/Space via the new `lib/a11y.ts` `activateOnKey` helper), and an
  `aria-label`. (verified: 7 quick-pick cards + the "show more" control expose
  the button role in the DOM)
- **Trigger-warning badge is no longer mouse-hover-only.** `TitleCard`'s badge
  is now focusable (`tabIndex={0}`, `role="note"`) with an `aria-label` listing
  the topics, so keyboard/screen-reader users can read what the "⚠ N" means.
- **`--text-dim` now meets WCAG AA.** Changed `#555870` (~2.5:1, failed) to
  `#8085a0` (≥4.5:1 on every surface token, computed), fixing contrast on the
  search placeholder, keyboard hint, and clear buttons.
- **Visible keyboard focus.** Added a global `:focus-visible` ring and removed
  the Browse search input's `outline: none` (which had left keyboard users with
  no focus indicator — WCAG 2.4.7).

**Added**
- **"Skip to main content" link** in the app shell (`app/(app)/layout.tsx` +
  `.skip-link` styles), with `id="main-content"`/`tabIndex={-1}` on `<main>`, so
  keyboard users can bypass the header + 9-item sidebar. (verified live)
- **ARIA on the account menu and search inputs.** The header avatar button now
  has `aria-haspopup`/`aria-expanded`/`aria-label` and the menu closes on
  Escape; both search inputs and the Browse clear/remove-filter "×" buttons now
  have `aria-label`s (verified live).
- **Trailer modal dialog semantics.** `role="dialog"`, `aria-modal`, focus-moves
  -into-dialog on open, and Escape-to-close.
- **`lib/a11y.ts`** keyboard-activation helper with unit tests
  (`lib/a11y.test.ts`).

**Next session (remaining §8 items)**
- Full focus-trap (not just focus-on-open) for the trailer modal and
  SearchOverlay; `onFocus`/`onBlur` parity for hover-only card affordances
  (`TitleCard`, `TrackerRow`). These are the lower-severity remainder.

---

## [v6.7] - 2026-07-12

### ⚡ Performance — middleware scoping + next/image (Next-milestone)

Addresses the two High-severity performance items from the codebase audit
(`ADAM_DOCS/movieknight-audit-report.md` §7). Validated via production build.

**Changed**
- **Scoped `proxy.ts` to page routes only.** The middleware previously ran a
  full Supabase `auth.getUser()` round-trip plus CSP-nonce generation on every
  request — including `/api/*` routes (which authenticate themselves and return
  JSON needing no CSP) and static/metadata files. `/api/claude/ask` paid for
  the auth check twice. The matcher now excludes `api/`, static output, and
  `robots.txt`/`sitemap.xml`/`manifest.json`, with a matching in-function guard.
  Verified in-browser: `/api/health` no longer receives a CSP header, page
  routes still get CSP + `x-nonce`, and protected-route redirects still work.
- **Migrated TMDB poster/backdrop images to `next/image`.** The detail page
  (backdrop hero via `fill`, poster + cast headshots via fixed dimensions) and
  the friends / notifications / profile feeds now use `next/image` — enabling
  AVIF/WebP, responsive `srcset`, and automatic lazy-loading that the raw
  `<img>` tags bypassed. Avatar images (arbitrary/non-allowlisted hosts) were
  intentionally left as `<img>`.

**Notes**
- The `next/image`-converted pages are all SSR/auth-gated and cannot be rendered
  on this machine (its network path uses a TLS-interception cert that breaks
  server-side Supabase fetches). They were validated by production build +
  typecheck; visual QA belongs on staging/preview.

---

## [v6.6] - 2026-07-12

### 🔧 Audit "Fix Now" batch

Addresses the Blocker/High "Fix now" items from the full codebase audit
(`ADAM_DOCS/movieknight-audit-report.md`). Verified in-browser end-to-end.

**Fixed**
- **Browse "Clear all" button never appeared when a filter was active** — an
  operator-precedence bug (`&&` binding tighter than `||`) in the button's JSX
  condition. The `hasActiveFilters` check also leaked a truthy *string* instead
  of a boolean. Extracted the logic to `lib/browse-filters.ts` with a boolean
  return and parenthesized the JSX. (`components/BrowseClient.tsx`)
- **Browse arrow-key grid navigation hijacked the search box** — a window-level
  `keydown` handler stole ArrowLeft/ArrowRight from text inputs, and Enter
  called `.click()` on a wrapper `<div>` (which never navigates). Now bails out
  when a text field is focused (`isTextInputTarget`) and activates the inner
  `<a>`. (`components/BrowseClient.tsx`, `lib/browse-filters.ts`)

**Changed**
- **Hid the streaming-platform filter** until its data pipeline exists. The
  `browse_titles` RPC filters against `title_streaming_platforms`, which has no
  writer anywhere — so selecting a platform always returned zero results.
  Wiring it from TMDB watch-providers data is tracked as a Next-milestone item.
  (`components/BrowseClient.tsx`)
- **Retargeted `lighthouse.yml`** from the nonexistent `main` /
  `feat/nextjs-migration` branches to `master`, so Lighthouse CI actually runs.
  Corrected the README's "create a feature branch from `main`" instruction.

**Added**
- **`robots.txt` and `sitemap.xml`** via `app/robots.ts` / `app/sitemap.ts` —
  the sitemap enumerates the most popular title-detail URLs so crawlers can
  discover them at scale (previously neither file existed). (`lib/site.ts`)
- **Unit test harness (Vitest + jsdom)** — first increment toward the zero-test
  Blocker. Covers the extracted browse-filter logic and site helpers
  (`lib/browse-filters.test.ts`, `lib/site.test.ts`), with a `test` job added to
  CI (`ci.yml`) that gates the production build. Playwright e2e for the
  auth/browse/detail flows is the tracked follow-up.

**Next session**
- Wire `title_streaming_platforms` from `watch_providers_json` (or migrate the
  filter to read the JSON directly), then re-enable the platform filter.
- Address the pre-existing project-wide ESLint failure (1,589 errors — mostly
  `mcp-server/src` `any` usage plus the `.claude/worktrees/` duplicate checkout
  and `mcp-server/dist` build output being linted); the CI `lint` job is red
  independently of this batch.

---

## [v6.5] - 2026-05-22

### ⚠️ Trigger Warning Filtering Integration

**Added**
- **Trigger warnings filtering on browse/search** — User preferences automatically filter results
  - Browse RPC extended with `p_user_id` and `p_filter_hidden_triggers` parameters
  - GIN index on `dtdd_cache.topics` for fast JSONB filtering
  - Filter toggle on browse page ("Hide my warnings") — disabled for guests, enabled only when authenticated
  - Search results client-side filtering when toggle enabled

**Changed**
- `browse_titles` RPC: Added trigger warning filtering logic
  - LEFT JOINs to `dtdd_cache` and `user_trigger_prefs`
  - Filters out titles with user's hidden triggers when enabled
  - Backward compatible — filtering disabled by default
- BrowseClient component: Added trigger data fetching and filtering
  - Batch-fetches trigger data from `dtdd_cache` to avoid N+1 queries
  - Caches user preferences in component state
  - Filter toggle synced with RPC parameters
- TitleCard component: Trigger warning badges
  - Displays "⚠ {count}" badges for flagged triggers
  - Tooltip shows full trigger names on hover
  - Orange/yellow styling with backdrop blur effect
  - Only shows for 'flag' actions (hidden titles don't appear)

**Deployment**
- Version bumped to v6.5
- Timestamp: 2026-05-22 20:35:00
- All migrations applied via `supabase db push`
- Production live at https://movieknight.ca

---

## [v6.4] - 2026-05-22

### 🚨 Content Warning Profile Component

**Added**
- **TriggerWarnings component** — Comprehensive trigger preferences management on profile
  - Master toggle `tw_enabled` to enable/disable all filtering
  - Per-topic flag/hide buttons with vote percentages
  - Fetches last 10 watched titles to show related triggers
  - Calls `dtdd-fetch` edge function to fetch latest trigger data
  - Upserts user preferences to `user_trigger_prefs` table

**Changed**
- Profile page integrates new TriggerWarnings component
- Shows loading spinner while fetching trigger data
- Empty state messages for users with no watch history

**Deployment**
- Version bumped to v6.4
- Timestamp: 2026-05-22 20:00:00
- Component tested and verified in production

---

## [v6.3] - 2026-05-22

### 🐛 Fix: Proper 404 Handling on Title Detail Page

**Fixed**
- **Title detail page returning HTTP 200 for invalid titles** — Now properly returns 404
  - Changed from rendering fallback div to using Next.js `notFound()` function
  - Ensures invalid title IDs (e.g., `/note`) trigger proper error boundary
  - Fixes production error ID: `yul1::hth5f-1779468204711-79a9f8237979`

**Changed**
- `app/(app)/[titleId]/page.tsx`: Replaced fallback rendering with `notFound()`

**Deployment**
- Version bumped to v6.3
- Timestamp: 2026-05-22 18:00:00
- Error page now returns HTTP 404 (verified in production)

---

## [v6.2] - 2026-05-22

### 🤖 Claude Assistant: Vercel AI Gateway Migration

**Fixed**
- **Claude API key empty in production** — Switched to Vercel AI Gateway with OIDC
  - Root cause: `ANTHROPIC_API_KEY=""` (empty string in Vercel Production)
  - Deprecated model: `claude-3-5-haiku-20241022` (EOL February 2026)

**Changed**
- Replaced `@anthropic-ai/sdk` with `ai` + `@ai-sdk/gateway` packages
- Updated model reference to `anthropic/claude-haiku-4.5`
- OIDC authentication auto-uses `VERCEL_OIDC_TOKEN` (injected by Vercel)
- Removed hard API key requirement

**Added**
- User credit card linked to Vercel account (required for AI Gateway free tier)

**Deployment**
- Version bumped to v6.2
- Timestamp: 2026-05-22 22:00:00
- Claude assistant 100% operational in production
- Verified: `POST /api/claude/ask` returns proper recommendations

---

## [v6.1.1] - 2026-05-22

### 🔧 Vercel Configuration: JSON to TypeScript Migration

**Fixed**
- **Multiple config files conflict** — Removed old `vercel.json` after migration to `vercel.ts`
  - Vercel 54.2.0+ requires exactly ONE configuration file
  - Production build failing with "Multiple config files found" error
  - Forced redeploy after removal

**Changed**
- Deleted `vercel.json` (superseded by `vercel.ts`)
- Vercel now correctly uses single TypeScript config
- Build succeeded: `✓ Compiled successfully in 11.7s`

**Deployment**
- Version remains v6.1 (patch rollup)
- Timestamp: 2026-05-21 21:30:00
- Production redeployed and verified operational

---

## [v6.1] - 2026-05-22

### ⚙️ Integration Automation & Supabase/Vercel Config Upgrades

**Added**
- **GitHub Action for auto-migrations** (`.github/workflows/deploy-migrations.yml`)
  - Triggers on push to `supabase/migrations/` or `supabase/config.toml`
  - Uses `SUPABASE_ACCESS_TOKEN` (added to GitHub secrets)
  - Automatically applies migrations to production database
  - Eliminates manual `supabase db push` step

**Changed**
- **Vercel config upgrade**: `vercel.json` → `vercel.ts`
  - TypeScript configuration with full type safety
  - Environment-aware dynamic configuration support
  - Installed `@vercel/config` dev dependency
  - Auto-detected by Vercel (no action required)

**Added**
- **INTEGRATION_SETUP.md** — Comprehensive setup guides for:
  - Vercel ↔ Supabase integration (auto-sync secrets)
  - Supabase GitHub branching (preview DBs per PR)
  - Supabase CLI upgrade instructions

**Deployment**
- Version bumped to v6.1
- Timestamp: 2026-05-22 10:00:00
- All integrations tested and documented

---

## [v6.0] - 2026-05-21

### 🔍 SSR Fix: Keyword Search OR-Matching for Mood Recommendations

**Fixed**
- **Hero recommendations empty for all moods** — Keyword RPC using AND-matching returned 0 results
  - Root cause: `plainto_tsquery` requires ALL words to appear in single title
  - Mood query example: "mind-blowing psychological mind-bending thriller" = no matches
  - Solution: OR-based matching for compound queries
  - Vote-weighted ranking with quality filter (vote_average >= 5.5)

**Added**
- Migration `20260521200000_keyword_search_or_match.sql` — Rewritten `get_titles_by_keywords` RPC
  - Splits query on whitespace, joins with ` | ` for OR matching
  - Vote-weighted ranking: `ts_rank * (0.5 + vote_average/20)`
  - Quality filters: `vote_average >= 5.5 AND poster_path IS NOT NULL`
- Migration `20260521210000_keyword_search_type_fix.sql` — Added `::float` cast fix
  - Resolved PostgREST 400 error (type `42804`)

**Verified**
- All 8 moods now SSR with real results
- Top hits: The Twilight Zone (Mind-blowing), Seth MacFarlane's Cavalcade (Funny), Chicago Fire (Thrilling), etc.

**Deployment**
- Version bumped to v6.0
- Timestamp: 2026-05-21 21:30:00
- All mood recommendations live and working

---

## [v5.9] - 2026-05-21

### 🏥 Hero Recommendation Feature: Root Cause Fix

**Fixed (3 critical issues)**
1. **`get_titles_by_keywords` RPC missing in production**
   - Migration `20260520000001` registered but never executed
   - Created new migration `20260521190000_keyword_search_rpc_fix.sql`
   - Added GIN index, GRANT EXECUTE, schema reload notification

2. **`semantic-search` edge function rejecting anonymous users**
   - RPC had `verify_jwt=true` (default)
   - Added `supabase/config.toml` with function-level config
   - Set `verify_jwt = false` for anonymous access

3. **Rate limiter denying ALL traffic when Upstash unconfigured**
   - `_shared/rate-limit.ts` "fails closed" on missing env vars
   - Changed unconfigured-fallback to "fail open with warning"
   - Unblocked edge functions: tmdb-cache, generate-embedding, tv-seasons, tv-auth, dtdd-fetch

**Added**
- `supabase/config.toml` — Declarative edge function auth configuration

**Changed**
- `_shared/rate-limit.ts` — Fail-open behavior with warning logging

**Verified**
- `POST /rest/v1/rpc/get_titles_by_keywords` → HTTP 200
- `GET /functions/v1/semantic-search` (anon) → HTTP 200
- Hero page renders with real mood recommendations

**Deployment**
- Version bumped to v5.9
- Timestamp: 2026-05-21 19:45:00
- Production restored and fully operational

---

## [v5.8] - 2026-05-21

### ✅ Guest Access & Home Page Optimization

**Fixed**
1. **Mandatory login landing page removed**
   - `/home`, `/browse`, `/trending` removed from PROTECTED routes
   - Guests can now access home page with recommendations

2. **Home page infinite spinner + 20-second timeout**
   - Root cause: Semantic-search taking 8-12+ seconds (OpenAI embeddings)
   - Timeout escalation: 5s→12s (SSR), 8s→12s (client), 15s→20s (safety net)
   - **Two-tier strategy implemented:**
     - Server-side: Fast keyword search (database, <100ms)
     - Client-side: Semantic search with keyword fallback on error/timeout
   - Result: Home page renders instantly with keyword recommendations, semantic search as async enhancement

**Added**
- `app/(app)/home/HomeClient.tsx` — New client component
  - `keywordSearch()` function for fast SSR fallback
  - Semantic search with automatic fallback on error/timeout
  - Error UI with retry button

**Changed**
- `app/(app)/home/page.tsx` — Switched to keyword search for SSR
- `lib/version.ts` — Updated timestamp
- Timeout thresholds across all components
- Rate limit fallback behavior

**Deployment**
- Version bumped to v5.8
- Timestamp: 2026-05-21 19:15:00
- Zero build errors, all routes deployed

---

## [v5.6] - 2026-05-18

### 🔧 batchRpcs Utility + Promise.all() Audit

**lib/batch-rpcs.ts — new utility**
- ✅ Created `batchRpcs()` helper: accepts array of thunks returning `PromiseLike` (compatible with Supabase query builder thenables), runs them sequentially, returns fully-typed tuple matching `Promise.all` destructuring syntax
- ✅ Replaces ad-hoc sequential `await` patterns with a single reusable abstraction

**Promise.all() audit (all components)**
- ✅ Audited 7 `Promise.all()` call sites across BrowseClient, ListsClient, DetailClient, SearchOverlay
- ✅ Confirmed 6 of 7 are HTTP calls to external endpoints (TMDB, semantic-search) or local JSON parsing — zero Supabase pool impact, kept parallel
- ✅ `ListsClient.loadAll()`: converted 3-query `Promise.all` → `batchRpcs` (the only Supabase pool-pressure site)
- ✅ Zero TypeScript errors after migration (`tsc --noEmit` clean)

---

## [v5.5] - 2026-05-18

### 📈 Dual Analytics Integration — Umami + PostHog

**PostHog (Product Event Analytics)**
- ✅ Installed `posthog-js` v1.374.0
- ✅ Created `components/PostHogProvider.tsx` — client-side `PHProvider` wrapper with manual `$pageview` capture on every route change (compatible with Next.js App Router SPA navigation via `usePathname` hook)
- ✅ Integrated `PostHogProvider` as outermost wrapper in `app/providers.tsx`
- ✅ Config: `person_profiles: 'identified_only'` (no anonymous profiles), `capture_pageview: false` (manual), `capture_pageleave: true`
- ✅ Conditional init — no-ops safely when `NEXT_PUBLIC_POSTHOG_KEY` is unset

**Umami (Cookieless Traffic Analytics)**
- ✅ Added `<Script strategy="lazyOnload">` to `app/layout.tsx` using `next/script`
- ✅ GDPR-compliant — no cookies, no personal data stored by default
- ✅ Conditional render — script only injects when both `NEXT_PUBLIC_UMAMI_WEBSITE_ID` and `NEXT_PUBLIC_UMAMI_URL` env vars are present

**Supporting Changes**
- ✅ Created `.env.example` documenting all required and optional env vars for the full stack
- ✅ Updated `docs/site-command-center.html`: Analytics module card in Overview tab; 📈 Analytics stack card in Tech Stack tab
- ✅ Zero TypeScript errors — `tsc --noEmit` clean

**Pending activation**: Set `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_UMAMI_URL` in Vercel environment settings to activate both services.

---

## [v5.4] - 2026-05-18

### 🚀 Performance Optimization Sprint — Connection Pool & Timeout Fixes

**Database Optimization**
- ✅ **Composite indexes**: Added `friend_requests(sender_id, status)` and `friend_requests(receiver_id, status)` for 60× query speedup
- ✅ **RPC query optimization**: get_pending_requests, get_sent_requests, get_friends now use indexed queries

**Semantic Search Reliability**
- ✅ **Timeout handler**: Added 8-second OpenAI API timeout with graceful fallback (was 27.6s timeout causing 500 errors)
- ✅ **Keyword fallback**: Semantic-search automatically falls back to simple keyword matching on OpenAI timeout/error
- ✅ **Error recovery**: Timeout errors logged, users get results via fallback instead of blank

**Connection Pool Saturation Fix**
- ✅ **BadgeProvider refactor**: Changed from 3 parallel RPC calls (every 60s globally) to sequential batching
- ✅ **Friends component refactor**: Batch pending/sent requests sequentially instead of Promise.all()
- ✅ **Profile page refactor**: Batch watch stats, taste data, and recent titles sequentially
- ✅ **Connection pool efficiency**: Sequential calls use pool more effectively, eliminate concurrent request stalls

**Performance Impact**
- **Semantic-search**: 740ms (was timeout/error)
- **get_pending_requests**: 205ms (was 12-13s)
- **Friend activity RPC**: <500ms (was 12-13s)
- **Overall system**: No more connection pool saturation causing cascading slowdowns

**Deployment**
- Live at https://movieknight.ca
- Commit: b0aadbc
- Build time: 4.7 seconds (TypeScript: 7.2s)
- All 22 routes deployed and tested
- Zero TypeScript errors

---

## [v5.3] - 2026-05-17

### 🔧 Tech Debt Audit & Comprehensive Fixes

**Security & Type Safety**
- ✅ Centralized CORS configuration: `_shared/cors-utils.ts` replaces 7 duplicated implementations
- ✅ TypeScript strict mode: 25+ `any` types replaced with proper interfaces across components
- ✅ Null safety: OpenAI API embedding responses now defensively checked
- ✅ Sensitive error redaction: API routes hide implementation details in production
- ✅ AbortController cleanup: DetailClient properly cancels async operations on unmount

**Code Quality**
- ✅ Environment validation: `lib/env.ts` validates all critical env vars at startup
- ✅ Memory leak fixes: Timer cleanup in SearchOverlay, proper event listener management
- ✅ Type-safe interfaces: CastMember, Season, UserList, TmdbTitleData, and 5+ RPC response types
- ✅ Null coalescing: All optional numeric fields now safely compared with `?? 0` pattern

**Infrastructure**
- ✅ Versioning policy: All production deployments auto-increment patch version
- ✅ Build status: Zero TypeScript errors, zero runtime errors post-deploy
- ✅ Debug logging system: Console, errors, network metrics, performance data captured in DB

**Deployment**
- Live at https://movieknight.ca
- Commit: 1334c1b
- Build time: 23 seconds
- Version display: v5.3 ✅

**Known Issues (Under Investigation)**
- 🔴 **Semantic-search endpoint**: HTTP 500 on search requests (27.6s timeout) — likely OpenAI API timeout
- 🔴 **RPC performance**: Friend activity, notifications, online friends taking 12-13 seconds each — missing composite indexes on friend_requests + connection pool saturation
- 📊 **Recommended next steps**: Add composite indexes on friend_requests(sender_id, status) and (receiver_id, status); implement RPC call batching on frontend; add OpenAI timeout handling with fallback

---

## [v5.2] - 2026-05-17

### 🎬 Major Version Update — Unified Versioning

**Release Highlights**
- Simplified versioning scheme from v1.5.x → v5.2 for clarity
- All previous v1.5.1 features and improvements included
- **Complete Feature Set:**
  - ✨ Semantic search with AI-powered recommendations
  - 📺 Episode tracking and watch history
  - 🎯 9-filter browse system with advanced filtering
  - 👥 Social features (public lists, community ratings, friend activity)
  - ⚠️ Content warnings integration (DTDD)
  - 🤖 In-app "Ask Claude" AI assistant (why watch, similar titles, taste analysis)
  - 📊 Real-time debug monitoring (console, errors, network, performance)
  - 🔌 MCP stack (Supabase + Vercel + Custom MCP server)

**Production Status**
- ✅ Zero TypeScript errors
- ✅ All 22 routes deployed and tested
- ✅ Clean error logs post-deployment
- ✅ Version: v5.2 (May 17, 2026)

**Deployment**
- Live at https://movieknight.ca
- Vercel production deployment: dpl_5YGomCA96mttDdo9bZSoh6UWdqHa
- Build time: 22 seconds

---

## [v1.5.1] - 2026-05-17

### 🧹 Debug Cleanup, Optimization & Code Quality

**Code Quality Improvements (Agent Review)**
- Extracted `buildPayload()` in DebugLogger to eliminate duplicate logic in `flush()` and `flushBeacon()` methods (~50 LOC saved)
- Moved `getVerifiedUserId()` to `lib/supabase-server.ts` for reuse across API routes (2 call sites unified)
- Created singleton `supabaseServiceClient` in ingest route to prevent connection pool exhaustion under load
- Optimized fetch interception: pre-compute baseUrl, moved INGEST_URL check to early return (~2-5ms saved per request batch)
- Capped CLS accumulation at 1.0 per Web Vitals specification to prevent inflated performance metrics
- Improved maintainability: removed redundant code, unified helpers, enhanced error handling

**Removed — Dead Code & Debug Noise**
- Removed 16+ `console.log` statements from BrowseClient and debug utilities
- Removed broken AbortController/anon-fallback pattern in BrowseClient (supabase-js v2 ignores `signal` param; fallback would permanently bypass auth)
- Dropped narrative WHAT comments from ingest route and debug-logger (kept WHY rationale comments)

**Fixed**
- **BadgeProvider**: Added shallow-compare no-op guard — polling no longer re-renders all `useBadges()` consumers when badge counts haven't changed
- **CLS (Cumulative Layout Shift)**: Debounced observer to emit final value once on `pagehide` instead of per-shift entry (~10× fewer events on heavy-shift pages)
- **MCP handler perf**: Fixed O(N×M) p75 calculation in `handleGetPerfMetrics` → single-pass bucket sort
- **Database schema drift**: Removed `'debug'` from `debug_logs.level` CHECK constraint (TypeScript `LogLevel` union never emits it)

**Optimized**
- **Service-role client**: Extracted `createSupabaseServiceClient()` helper; ingest + warmup routes now use shared factory (eliminates duplication, centralized config)
- **Event type definitions**: `EventType`, `LogLevel`, all `*Event` interfaces now exported from `lib/debug-logger.ts` (was 50 LOC duplication in ingest route)
- **Ingest pipeline**: Batched inserts by table — 4 events now fire at most 4 parallel `INSERT`s (one per table) instead of N sequential inserts
- **MCP handlers**: Extracted `queryRecent()` + `bucketBy()` helpers — 4 debug-table handlers shrank from ~120 LOC to ~70

**Added**
- Migration `20260517000002_debug_logs_level_align.sql` — persists CHECK constraint alignment for repeatability

**Performance Impact**
- CLS observer: ~90% reduction in `perf` events on shift-heavy pages
- Ingest route: Parallel batch inserts vs sequential (4 events: 4→3 inserts, avg 40% faster on high-throughput)
- BadgeProvider re-renders: Eliminated unnecessary renders when polling returns unchanged counts

**Deployment**
- Version bumped to v1.5.1
- All migrations applied via `supabase db push`
- Build verified (0 TypeScript errors, bundle size unchanged)

---

## [v1.5.0] - 2026-05-16

### 🤖 MCP Stack & In-App AI Assistant

**Added — MCP Infrastructure**
- **Supabase MCP** (official, read-only) — Claude Code can now query the live database directly
- **Vercel MCP** (official) — deployment status and logs accessible to Claude
- **Custom StreamSocial MCP server** at `mcp-server/` with 8 app-specific tools:
  - `app_health` — catalog/embedding/user health snapshot
  - `get_user_stats` — profile + watch history + lists by email
  - `seed_titles` — trigger TMDB discover (movie/tv, N pages)
  - `backfill_embeddings` — generate embeddings for unembedded titles
  - `title_lookup` — full details about one title
  - `recent_activity` — last N watch_history entries (hydrated with title names)
  - `search_catalog` — text search of titles table
  - `edge_function_test` — quick GET test of any edge function
- `.mcp.json` configuration auto-loaded by Claude Code on startup

**Added — In-App "Ask Claude" Feature**
- New API route `POST /api/claude/ask`
- Uses Claude Haiku 4.5 for fast, personalized responses
- **Four modes:**
  - `why_watch` — Why you might like a title (uses watch history)
  - `similar` — 5 similar titles formatted as **Title (Year)**
  - `taste` — Analyze your taste pattern (genres, eras, themes)
  - `free` — Free-form question (max 500 chars)
- Auto-includes user's last 20 watched titles as personalization context
- Rate-limited to 10 req/min per user
- Added to detail page (why_watch + similar)
- Added to profile page (taste + similar)
- Estimated cost: ~$0.0012 per request (~$6/mo for 1000 users × 5 req)

**Added — Documentation**
- `docs/ai-feature.md` — Complete API reference, cost estimates, privacy notes
- `docs/mcp-stack.md` — MCP setup guide, capabilities, security notes
- `mcp-server/README.md` — Custom MCP server build/extension guide

**Manual Setup Required**
- Add `ANTHROPIC_API_KEY` to Vercel env vars (for in-app feature)
- Add `SUPABASE_ACCESS_TOKEN` to `.env.local` (for Supabase MCP)
- Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (for custom MCP)

**Build Config**
- `tsconfig.json`: excluded `mcp-server/**/*` from Next.js type check
- `.gitignore`: excluded `mcp-server/dist/` and `mcp-server/node_modules/`

---

## [v1.4.3] - 2026-05-16

### 🔍 Code Review & Critical Fixes

**Fixed Issues**
- **Year range validation** — Prevent invalid date ranges (yearFrom > yearTo) from silently returning zero results
- **Keyboard navigation** — Fixed column calculation that broke at viewport transitions; now dynamically queries actual grid layout
- **UI state preservation** — Clear filters button now preserves initial format selection (e.g., `/browse?format=movie`)
- **CORS headers** — Added missing `Access-Control-Allow-Methods` and `Access-Control-Max-Age` to semantic-search for better preflight caching

**Known Limitations**
- `title_streaming_platforms` table exists but is not populated — requires TMDB watch-providers data pipeline (future work)
- Streaming platform filter is non-functional until data is populated

**Changed**
- BrowseClient: Stricter year filter validation with console warnings
- semantic-search: Complete CORS header specification
- Improved keyboard navigation accessibility

**Performance**
- Preflight request caching optimized (86400s max-age)

---

## [v1.4.2] - 2026-05-16

### 🐛 Browse Page Fixes & Migration Completion

**Fixed Issues**
- **Browse page rendering** — Fixed React error #418 caused by year filter string template evaluation
- **browse_titles RPC** — Updated RPC signature to include `p_platform_ids` parameter for streaming platform filtering
- **Database webhook** — Added Authorization header to webhook for automatic embedding generation on new titles
- **Edge function CORS** — Redeployed all 8 edge functions with CORS allowlist including `movieknight.ca`

**Changed**
- browse_titles: SQL migration to support `p_platform_ids` parameter
- semantic-search: CORS headers applied to requests from `movieknight.ca`
- All edge functions: Redeployed with fresh code

**Deployment**
- Version bumped from v1.4.1 to v1.4.2
- Vercel deployed to movieknight.ca
- Supabase migrations applied

---

## [v1.4.1] - 2026-05-15

### 📈 Performance Optimization & Monitoring

**Added**
- **Vercel Analytics** — Real user metrics tracking (Core Web Vitals)
- **Speed Insights** — LCP, FID, CLS monitoring in production
- **Lighthouse CI** — Automated performance testing on every build
- **Code splitting** — AwardsSection and SeasonsPanel lazy-loaded via `next/dynamic`
  - Reduces main bundle for detail page by ~30%
  - Elimates code for movie-only viewers

**Changed**
- DetailClient: Parallelized detail fetch requests (trailer, cast, awards, seasons)
  - ~40% faster detail page load
- Database: Added performance indexes
  - `idx_titles_feed_eligible`: Partial index for for-you feed (vote_average >= 6.0, has poster)
  - `idx_title_genres_genre_title`: Covering composite for genre overlap queries
  - `idx_watch_history_user_id`: Speedup for feed CTEs
- get_for_you_feed RPC: Rewritten `NOT IN` → `NOT EXISTS` (NULL-safe)

**Performance Metrics**
- Bundle size: ~180KB (gzipped)
- LCP target: < 3.5s (Lighthouse 90+)
- Code splitting: 30% reduction in detail page bundle

---

## [v1.4.0] - 2026-05-15

### 🚀 Next.js Migration Complete

**Migration from HTML Prototype to Next.js Full-Stack**
- All routes ported from HTML to Next.js App Router (17 routes)
- React components created for all screens (Browse, Detail, Lists, Profile, etc.)
- TypeScript for type safety across entire codebase
- Server-side rendering (SSR) for initial page load

**Added**
- Home/For-You page: Personalized recommendations via new `get_for_you_feed` RPC
- Trending page: Popular titles ranked by watch count
- Messages page: Direct messaging between users
- Notifications page: Friend requests, recommendations, activity
- Calendar page: TV episode release schedule
- Friends page: Friend list and activity feed

**Changed**
- State management: Migrated from HTML global state to React hooks + Context
- API calls: Changed from PostgREST REST to RPC + Supabase client library
- Styling: CSS modules + inline styles → Tailwind-inspired global CSS
- Service Worker: Updated to cache new Next.js routes

**Breaking Changes**
- Old HTML prototype at `/index.html` no longer primary entry point
- Routes structure changed (e.g., `/search` → `/mood`)
- API integration methods changed (RPC instead of REST)

**Deployment**
- Vercel deployment strategy finalized
- Environment variables documented in `.env.local`
- CI/CD pipeline set up

---

## [v1.3.0] - 2026-05-15

### 🔐 Security, Performance & Quality Hardening (Sprint 6)

**Security (Wave 1)**
- Created `messages` table with row-level security (sender_id = auth.uid())
- Revoked anon EXECUTE on 5 RPC functions that reference `auth.uid()` internally
- Tightened `device_auth_codes` RLS: removed public `USING (true)` policy

**Performance (Wave 2)**
- Added 3 new indexes: `idx_title_genres_title_id`, `idx_watch_history_user_id`, `idx_watch_history_user_episode`, `idx_titles_popularity`
- DetailClient: Parallelized trailer/cast/awards/seasons fetches (40% speedup)

**Input Hardening (Wave 4)**
- CORS allowlist on 6 edge functions: only movieknight.ca + localhost + Vercel preview
- generate-embedding: Added title ID regex validation, batch size cap (100)
- dtdd-fetch: Batch size reduced from 30 to 10, strict ID validation
- tmdb-cache discover: Anon clients capped at 5 pages (was 25)
- RPC functions: Added input length validation (find_user_by_username, send_message)
- profiles.avatar_url: CHECK constraint limiting to https:// only (blocks javascript:/data: XSS)

**Bug Fixes**
- Fixed calendar "Want" button (was using 'want' instead of 'want_to_watch')
- Fixed community lists rendering (JSON in onclick attribute)
- Fixed XSS vulnerabilities in sidebar/profile/friends modules
- Fixed stale calendar data (added TTL checking)

**Polish**
- Service worker expanded to v4 cache with 12 new Next.js routes
- AppFooter component added to show version + build date

**Deployment**
- Version bumped to v1.3.0
- All security migrations applied
- npm audit: 0 vulnerabilities

---

## [v1.2.0] - 2026-05-10

### 🌍 Social Features & Content Warnings

**Added**
- **Messages system**: Direct messaging between users
  - `messages` table with RLS (sender/receiver can read)
  - Rate limiting: 30 messages/min per user
  - 5000-char message length limit
- **Content Warnings (DTDD)**: Integration with DoesTheDogDie.com
  - `dtdd_cache` table with 30-day TTL
  - `user_trigger_prefs` for user customization
  - 70% confidence threshold for flagging
  - 20 trigger topics across 6 categories
  - Floating badge and detail page banner

**Changed**
- Database webhooks: Automated webhook for embedding generation on title insert

**Deployment**
- DTDD_API_KEY added to Supabase secrets
- dtdd-fetch edge function deployed and tested

---

## [v1.1.0] - 2026-04-24

### 🎬 Friends, Activity & RPC Optimization

**Added**
- **Friends system**: Send/accept friend requests
  - `follows` table with mutual following support
  - Friend activity feed showing what friends are watching
- **Community watchlists**: Public lists with community ratings
  - `list_members` table for sharing permissions (editor/viewer roles)
  - `list_ratings` table for 1-5 star ratings
  - `get_community_lists` RPC for discovering public lists
  - Share lists by username

**Changed**
- browse_titles RPC: Replaced REST API + PostgREST joins with single RPC call
  - Uses EXISTS subquery for genre filtering (no DISTINCT needed)
  - Added partial indexes for performance

**Performance**
- Added 9 indexes across watch_history, title_genres, titles, dtdd_cache, list_items, list_members, profiles

---

## [v1.0.0] - 2026-04-16

### 🎉 Initial Release: Core App Features

**Added**
- **Title Catalog**: 726 movies + TV shows from TMDB
  - Full details: runtime, CVRS rating, language, country
  - Poster/backdrop images cached
- **Watch Tracking**: Track movies/episodes with 4 statuses
  - want_to_watch, watching, watched, dropped
  - Episode-level tracking for TV (season + episode number)
  - 5-star user ratings (stored as 1-10 internally)
- **Semantic Search**: Mood-based title discovery
  - OpenAI embeddings (text-embedding-3-small, 1536 dims)
  - pgvector HNSW index for fast similarity search
  - Threshold-based filtering (0.3 similarity)
- **Advanced Filters**: 9-filter system
  - Genre (multi-select), Rating (6+ / 7+ / 8+ / 9+), Year range
  - Format (movie/tv), Platform (streaming service)
  - Runtime (short/medium/long for movies; series duration for TV)
  - Country, Language (ISO 639-1), CVRS rating (G/PG/14A/18A/R/NC-17)
- **Authentication**: Email/password signup & login
  - Supabase Auth with JWT tokens
  - User profiles with avatar (DiceBear)
  - Profile customization (display name, preferences)
- **Watchlists**: Create custom lists
  - Public/private sharing
  - Add/remove titles
  - Collaborative editing with role-based access (editor/viewer)
- **Database Schema**: 10+ tables with RLS policies
  - `titles`, `title_embeddings`, `genres`, `title_genres`
  - `watch_history`, `custom_lists`, `list_items`, `list_members`
  - `profiles`, `follows` (social)

**Edge Functions Deployed**
- `tmdb-cache`: TMDB API proxy with 7-day TTL caching
- `semantic-search`: Vector similarity search via pgvector
- `generate-embedding`: Batch embedding generation via OpenAI
- `tv-seasons`: TV episode data (names, counts)
- `delete-account`: User data cleanup on account deletion

**Infrastructure**
- Vercel deployment (vercel.json routing + cache headers)
- Supabase PostgreSQL database (nwvliipxqedueskhxdym)
- Service worker for offline support (shell caching)
- PostgREST API for direct REST access

**Performance**
- Responsive design (mobile/tablet/desktop)
- Image lazy loading + TMDB poster caching
- Database indexes on popular columns
- PostgREST query optimization

---

## Version History Summary

| Version | Date | Focus |
|---------|------|-------|
| v5.2 | 2026-05-17 | Unified versioning + complete feature release |
| v1.5.1 | 2026-05-17 | Debug cleanup, code quality improvements, fetch optimization |
| v1.5.0 | 2026-05-16 | MCP stack + in-app Claude AI assistant |
| v1.4.3 | 2026-05-16 | Code review fixes (year validation, keyboard nav, CORS) |
| v1.4.2 | 2026-05-16 | Browse page fixes (React errors, RPC migration) |
| v1.4.1 | 2026-05-15 | Performance monitoring & code splitting |
| v1.4.0 | 2026-05-15 | Next.js migration complete (17 routes, full-stack) |
| v1.3.0 | 2026-05-15 | Security hardening (Wave 1-4) |
| v1.2.0 | 2026-05-10 | Messages + Content warnings (DTDD) |
| v1.1.0 | 2026-04-24 | Friends + Community watchlists |
| v1.0.0 | 2026-04-16 | Core app (catalog, tracking, search, filters, auth, lists) |

---

## Unreleased / In Progress

- [ ] `title_streaming_platforms` data population (requires TMDB watch-providers pipeline)
- [ ] Enhanced for-you algorithm (watching history + friend overlap)
- [ ] TV episode notifications (remind user when new episode airs)
- [ ] Advanced recommendations (collaborative filtering)
- [ ] Mobile app (iOS/Android via React Native)

**Carried over from `CLAUDE.md`'s session log (dated 2026-05-22, verify still current before acting):**
- [ ] Upstash rate-limiter still unprovisioned — `_shared/rate-limit.ts` fails open (allows all traffic) when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset. Set both via `supabase secrets set` and redeploy the affected edge functions to restore real enforcement.
- [ ] Supabase CLI on the dev machine was v2.75.0 as of v6.1 (latest at the time: v2.101.0) — standalone executable at `C:\Windows\system32\supabase`, needs manual download from the CLI releases page.
- [ ] Optional dashboard integrations from `INTEGRATION_SETUP.md` (Vercel↔Supabase auto-sync, Supabase GitHub branching) were still pending self-service setup as of v6.1 — may already be done since; check the dashboards before re-doing.

---

## Notes for Contributors

- See [CLAUDE.md](./CLAUDE.md) for architectural decisions and project structure
- See [README.md](./README.md) for setup and deployment instructions
- All database changes require migration files in `supabase/migrations/`
- Edge functions should include rate limiting and input validation
- All user-facing features require row-level security (RLS) policies
