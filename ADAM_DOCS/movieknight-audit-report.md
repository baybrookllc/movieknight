# MovieKnight — Ground-Truth Codebase Audit

**Date:** 2026-07-12 · **Branch audited:** `master` (@ `3477455`) · **Method:** 9-dimension structured audit, every high-severity "Confirmed" finding independently re-verified against source. 49 findings total (2 Blocker, 10 High, 16 Medium, 20 Low, 1 downgraded to Inferred on re-check).

> **Known gap in this audit — CLOSED 2026-07-13.** Live Supabase advisors were originally **not reachable** (no access token). The token was configured on 2026-07-13 and `get_advisors(security)` + `get_advisors(performance)` were run against the live project. Findings + remediation are in the "Live advisor remediation" section directly below. The originally-flagged code/migration-SQL reasoning held up: RLS *was* genuinely missing on the two streaming tables live. Net-new items the live scan surfaced that static review could not: the exact function-search_path inventory (45), the live RLS-disabled confirmation with effective anon-INSERT, the performance advisors, and a latent token-leak policy in the device-auth migration (see below).

---

## Blunt summary

**This is "needs targeted fixes + one vertical built from zero," not "rebuild the core."** The core the team actually built — Next.js 16 App Router with real SSR, a coherent Supabase schema, semantic search, social graph, trigger-warning system — is genuine, working, and architecturally sound. That's the good news, and it's a real surprise relative to the brief. The bad news is threefold: (1) the **physical-media marketplace — the one differentiator the product positioning is built on — does not exist in any form**, not even a stub; (2) there is **zero automated test coverage** feeding a pipeline that auto-deploys to production; and (3) there's a scattering of **shipped-but-broken features** (a streaming-platform filter that silently returns nothing, a "Clear all" button that never appears, keyboard navigation that steals your arrow keys) that indicate features are being marked "done" without being exercised end-to-end. None of that requires a rewrite. It requires closing the test gap, fixing the broken-in-production bugs, and deciding whether "physical media marketplace" is real or should be dropped from the positioning. The gap between the five-vertical pitch and the four-vertical (tracking/discovery/streaming/social) reality is the single most important thing on this list.

## Outstanding as of 2026-07-13 (end of session)

Everything **safe to fix and within Claude's authority** has been fixed, deployed to production, and re-verified against live `get_advisors`. What's left, grouped by why it's still open:

**Blocked on you — ✅ both resolved 2026-07-13 (walked through step-by-step, same day as this audit):**
- [x] **Enable "Leaked password protection"** — done via Supabase dashboard → Authentication → Providers → Email. `get_advisors(security)` re-run confirms the WARN is gone.
- [x] **Add a `SUPABASE_DB_PASSWORD` GitHub Actions secret** — added via repo Settings → Secrets and variables → Actions (a first attempt saved it as `UPABASE_DB_PASSWORD` — missing leading "S" — caught via `gh secret list` and corrected). `deploy-migrations.yml` will now auto-deploy migrations on push instead of skipping gracefully.

**Deliberately deferred (documented rationale — degrade-risk or needs its own reviewed pass, not a quick fix):**
- [ ] `unused_index` (59 live findings) — every index in the DB, including every primary key, shows `idx_scan = 0` with stats never reset (`pg_stat_database.stats_reset` is null), so there's no real traffic signal to judge by. Not a case-by-case call to make today. One-time recheck task `movieknight-unused-index-recheck` scheduled for 2026-09-26 to re-run `get_advisors(performance)` once real traffic has accumulated.
- [ ] `anon`/`authenticated_security_definer_function_executable` (90 rows) and `rls_enabled_no_policy` on `device_auth_codes` (1, INFO) — both re-confirmed present by Session 4's advisor re-run, **not new**: already documented and accepted-by-design in the "Live advisor remediation" table below (search_path pinning already closes the exploitable surface on the former; the latter is an intentional service-role-only deny-all, already hardened against DR-replay).
- [x] **Migration-history bootstrap-gap baseline — ✅ resolved 2026-07-13.** `20260401000000_baseline_schema.sql` reconstructs all 13 pre-tracking tables, the `vector` extension, 15 functions, and 3 triggers; a full 41-file replay from a blank database now succeeds and matches live. Detail: `CHANGELOG.md` → "Remediation Session 2".
- [x] **Rewrite `auth_rls_initplan` + consolidate `multiple_permissive_policies` — ✅ resolved 2026-07-13.** 61 policies across 27 tables rewritten via `ALTER POLICY` to `(select auth.<fn>())`; 4 redundant policies dropped and 1 narrower replacement added on `messages`/`list_members`. Validated locally (structural + 9 functional access-scenario tests) before deploy. Both advisor findings confirmed at 0 post-deploy. Detail: `CHANGELOG.md` → "Remediation Session 3".
- [x] **Move the `vector` extension out of `public` — ✅ resolved 2026-07-13.** Relocated to a dedicated `extensions` schema; `match_titles`'s two overloads updated to resolve it. Validated locally with real embedding inserts + HNSW similarity queries (both roles, both overloads) before and after deploy. `extension_in_public` confirmed cleared post-deploy. Detail: `CHANGELOG.md` → "Remediation Session 4".
- [x] **3 `duplicate_index` pairs (`follows`, `list_members`, `messages`) — ✅ resolved 2026-07-13.** Root-caused to Session 2's index-fix migration re-creating indexes that already existed under different names; dropped the duplicates, kept the originals. Validated locally, advisor confirmed cleared post-deploy. Detail: `CHANGELOG.md` → "Remediation Session 5".

**Pre-existing, unrelated to this session's Supabase-token work** (tracked below in "Implementation progress"): Playwright e2e tests, the `CircuitBreaker`-in-TMDB-path decision, ~20 remaining `any`-type errors spread across smaller files, and commerce Phases P1–P4 (P0 is done and live; P1 is now unblocked).

~~Accessibility focus-trap/hover-parity~~ — **✅ resolved 2026-07-13 (Remediation Session 7).** A shared `useFocusTrap` hook (`lib/a11y.ts`) now handles Escape-to-close, Tab/Shift+Tab wrapping, initial focus, and focus restore across all 7 modals found in the codebase (2 separate trailer-modal implementations, search overlay, and 4 more with the identical gap not originally named in the plan). Plus 10 hover/focus-parity fixes, including 2 elements (`FriendItem`, `ListCard`) that weren't keyboard-reachable at all. Verified live: opened the search overlay via Ctrl+K, confirmed initial focus, bidirectional Tab-wrap, and Escape-close all work in the running app. Detail: `CHANGELOG.md` → "Remediation Session 7".

~~Error tracking (Sentry or equivalent)~~ — **✅ resolved 2026-07-13 (Remediation Session 8).** No Sentry account/DSN existed and creating one isn't something Claude can do autonomously, so — per explicit user choice — extended the existing debug-logger/`error_logs` pipeline instead of adding a new vendor. Wired into both error boundaries, all 4 API routes, and 6 of 10 edge functions (the other 4 deliberately left alone — see `CHANGELOG.md` for why). Verified with a real deliberately-thrown error landing in `error_logs` with a real stack trace; all 6 edge functions redeployed and smoke-tested post-deploy. Detail: `CHANGELOG.md` → "Remediation Session 8".

~~The `sharp-mayer` branch decision + rollback/down-migration story~~ — **✅ resolved 2026-07-13 (Remediation Session 9).** Compared all 7 of the branch's commits against master — every fix was already independently present there; abandoned it (worktree removed, local + remote branch deleted) rather than rebasing in redundant work. Added `docs/rollback-runbook.md`: a forward-fix-migration path (actually tested end-to-end against a simulated bad migration on a local replica) plus a documented-but-not-live-tested point-in-time-restore path for catastrophic data loss, using this project's real, confirmed-live PITR backup configuration. Detail: `CHANGELOG.md` → "Remediation Session 9".

~~`debug-logger` PII redaction, `tv-auth` IP-header order + rate-limiter fail-open alerting, worst `any` offenders, `npm audit`~~ — **✅ resolved 2026-07-13 (Remediation Session 10).** PII redaction applied to all 4 telemetry/error loggers (not just `debug-logger.ts`). `tv-auth`'s IP-header priority fixed exactly as flagged in §6 (was trusting spoofable `x-forwarded-for` over Cloudflare's non-spoofable `cf-connecting-ip`) and the whole handler now has error logging. Separately, the *actual* rate-limiter-fail-open finding from §6 — `_shared/rate-limit.ts` (used by `semantic-search`/`generate-embedding`, not `tv-auth`) silently allowing all requests when Upstash is unconfigured, in front of paid OpenAI-embedding calls — now alerts via `logEdgeError` once per isolate. The reachable `protobufjs` advisory (+ `dompurify`/`js-yaml` for free) resolved via `npm audit fix`; `mcp-server`'s own 2 findings resolved too. `mcp-server/src/index.ts` (19 of 39 total `any` errors, the single worst file) fully typed — 18 were the same `(args as any).field` pattern, the 19th was dead code (a call to a nonexistent RPC whose result was never used) removed rather than typed. Detail: `CHANGELOG.md` → "Remediation Session 10".

> **Update 2026-07-13 (remediation Session 1 — see `CHANGELOG.md` "Remediation Session 1"):** product-naming unification (cosmetic scope — display strings only, not the Vercel domain or webOS bundle ID), git tags (v6.1–v6.10, not yet pushed to origin as of this writing), `cors.ts`/`cron/health-check` dead-code deletion, and the `npm run lint` failure are now **done**. The lint failure turned out to be 97% one `eslint.config.mjs` ignore-pattern bug (linting a nested branch checkout as app source), not a real 1,589-error backlog — real remaining count is ~50. Full remediation plan for everything still open: `C:\Users\adamm\.claude\plans\keen-sniffing-nygaard.md`.
>
> **Update 2026-07-13 (remediation Session 3 — see `CHANGELOG.md` "Remediation Session 3"):** `auth_rls_initplan` and `multiple_permissive_policies` are both resolved and confirmed at 0 findings. Ground truth re-checked directly against `pg_policies`/`get_advisors` rather than the numbers below (which reflect 2026-07-12 and are now stale for these two rows — see the "Live advisor remediation" table just below for the as-deferred snapshot).
>
> **Update 2026-07-13 (remediation Session 4 — see `CHANGELOG.md` "Remediation Session 4"):** `extension_in_public` is resolved and confirmed cleared. The re-run also re-confirmed the SECURITY DEFINER RPC-executability and RLS-no-policy findings from the table below are still present — both already documented there as accepted-by-design, not new.
>
> **Update 2026-07-13 (remediation Session 5 — see `CHANGELOG.md` "Remediation Session 5"):** `duplicate_index` is resolved and confirmed cleared. `unused_index` is deferred again, now with concrete evidence (project-wide 0 scans including primary keys) and a scheduled 2026-09-26 recheck rather than an open-ended "someday."
>
> **Update 2026-07-13 (remediation Session 7 — see `CHANGELOG.md` "Remediation Session 7"):** accessibility focus-trap/hover-parity is resolved — see above.
>
> **Update 2026-07-13 (remediation Session 8 — see `CHANGELOG.md` "Remediation Session 8"):** error tracking is resolved via the existing debug-logger pipeline, not Sentry — see above.
>
> **Update 2026-07-13 (remediation Session 9 — see `CHANGELOG.md` "Remediation Session 9"):** `sharp-mayer` branch abandoned and cleaned up; rollback runbook added — see above.
>
> **Update 2026-07-13 (remediation Session 10 — see `CHANGELOG.md` "Remediation Session 10"):** PII redaction, `tv-auth` hardening, and the worst `any`-type offenders are resolved — see above. This closes out the original audit's full remediation punch list except Playwright e2e and commerce P1–P4, both pre-existing and unrelated to the audit-remediation arc.
>
> **Update 2026-07-14 (remediation Session 6 — see `CHANGELOG.md` "Remediation Session 6"):** Playwright e2e is now built (deterministic tier gates CI + opt-in live tier), the two v6.6 browse bugs have regression guards, releases v6.11–v6.19 are tagged, and the `unused_index` deferral is re-affirmed with its recheck still scheduled for 2026-09-26. **This closes the entire audit-remediation punch list.** The only remaining roadmap items are commerce Phases P1–P4 — net-new feature work, never part of the audit. (Separately noted: `npm run lint` still fails on ~31 pre-existing errors — 20 `any` + newer React-Compiler rules — untouched by this session and left for a dedicated lint pass.)

## Implementation progress (updated 2026-07-13)

Work done against this roadmap since the audit. Ten commits on `master`, all pushed and deployed. Legend: ✅ done · 🟡 partial · ⬜ not started.

### Fix now — ✅ complete
| Item | Status | Where |
|---|---|---|
| 1. Streaming-platform filter | ✅ Hidden (always returned zero; pipeline is a milestone item) | v6.6 `ff3031a` |
| 2. Browse "Clear all" button | ✅ Fixed (precedence + boolean) | v6.6 `ff3031a` |
| 3. `robots.txt` + `sitemap.xml` | ✅ Added (`app/robots.ts`, `app/sitemap.ts`) | v6.6 `ff3031a` |
| 4. Test harness + smoke tests | ✅ Vitest harness + 29 unit tests + CI `test` job (v6.6), **plus Playwright e2e** (deterministic tier gates CI + opt-in live tier; regression guards for items 1 & 2; auth/search/smoke coverage) | v6.6 `ff3031a`, Session 6 v6.20 |
| 5. `lighthouse.yml` branches | ✅ Retargeted to `master` | v6.6 `ff3031a` |
| 6. Arrow-key hijack | ✅ Fixed (guard + inner-anchor activation) | v6.6 `ff3031a` |

### Next milestone — partial
| Item | Status | Where |
|---|---|---|
| 7. Commerce vertical | 🟡 Plan written; **Phase P0 done, validated, and DEPLOYED to prod 2026-07-13** (8 tables + RLS + money math + tests; 12 owner/seller/anon/service-role RLS scenarios pass; live on the project + advisor-clean). P1 is now **unblocked**. P1 (cart/catalog UI), P2 (Stripe), P3 (orders), P4 (marketplace) remain | `0d55c96`, `84b6be7`, `a34815d` |
| 8. Accessibility pass | ✅ Keyboard reachability, focus ring, ARIA, AA contrast, skip link (v6.8) + focus-trap/Escape on all 7 modals + hover/focus parity (Session 7, v6.16) done | v6.8 `c733de5`, Session 7 |
| 9. `next/image` migration | ✅ Detail + feed posters migrated (visual QA on staging pending) | v6.7 `3d48d03` |
| 10. `proxy.ts` matcher scoping | ✅ Done (verified) | v6.7 `3d48d03` |
| 11. Error tracking (Sentry or equivalent) | ✅ Done via existing debug-logger/`error_logs` pipeline (no Sentry account existed; extended what was already there per user decision) | Session 8, v6.17 |
| 12. Branch reconciliation + rollback | ✅ Dead `elegant-agnesi` deleted; `sharp-mayer` confirmed fully superseded and abandoned (worktree + local + remote); rollback runbook written and Tier 1 tested end-to-end | Session 9, v6.18 |

### Later — not started
✅ 13. Unify product naming (cosmetic scope; Vercel domain + webOS bundle ID deliberately excluded) · ⬜ 14. Redact `debug-logger` PII · 🟡 15. Delete dead code (`cors.ts` ✅, `cron/health-check` ✅; `CircuitBreaker`-in-TMDB-path decision still open) · ⬜ 16. `tv-auth` IP order + rate-limiter alerting · ✅ 17. Version tags (v6.1–v6.10 tagged 2026-07-13; pre-v6.1 history skipped, ambiguous duplicate bumps) · 🟡 18. `npm run lint` failure fixed (1,589 → 50, mostly an eslint ignore-pattern bug); real `any` types still open

### Also outstanding
- ~~The **project-wide `npm run lint` failure (~1,589 errors)**~~ — **✅ resolved 2026-07-13.** 1,539 of the 1,589 (97%) were `eslint.config.mjs` linting `.claude/worktrees/sharp-mayer-5e02fe/**` (a full checked-out branch copy) as app source — it had overridden `eslint-config-next`'s default ignores without re-excluding nested checkouts/build output. Added `.claude/worktrees/**` + `mcp-server/dist/**` to `globalIgnores`. Real remaining count: 50 errors (31 app source, 19 `mcp-server/src`), tracked under item 18.
- ~~The commerce migration is committed but not applied~~ — **✅ resolved 2026-07-13.** Applied to prod via `supabase db push` and verified live (8 tables, 13 tax rows). See "Live advisor remediation" below.
- ~~**Migration-history bootstrap gap**~~ (2026-07-13, discovered while validating the commerce migration) — **✅ fully resolved 2026-07-13 (remediation Session 2).** The migration history was **not bootstrappable from a blank database**: `supabase/migrations/20260416000000_add_title_columns.sql` assumes `titles` already exists (it was created out-of-band before migration tracking started), so replaying from zero failed at that file. The deploy-blocking naming-collision symptom was fixed same-day (see "Live advisor remediation"); the broader from-zero-replay gap is now closed too — `20260401000000_baseline_schema.sql` reconstructs all 13 pre-tracking tables (not just `titles`), the `vector` extension, 15 functions, and 3 triggers from the live schema. A full 41-file replay against a throwaway local Postgres now succeeds and matches live on tables/columns/policies/functions. Bonus find during validation: two migrations recorded as "applied" on prod had actually silently failed (a `watch_history.created_at`-vs-`watched_at` typo, and a friend_requests index swap) — fixed with a small follow-up migration, deployed and verified. Detail: `CHANGELOG.md` → "Remediation Session 2".

## Live advisor remediation (2026-07-13) — ✅ DEPLOYED & VERIFIED

Once the `SUPABASE_ACCESS_TOKEN` was configured, `get_advisors` was run against the live project. Tracked migrations were authored, **validated end-to-end against an isolated local Postgres** (RLS behaviour, the search_path loop incl. pgvector exclusion, FK indexes, duplicate-index drops, idempotency), then **applied to prod via `supabase db push` and re-verified by re-running the advisors**.

**Post-deploy advisor counts:** `rls_disabled_in_public` 2→**0**, `function_search_path_mutable` 45→**0**, `unindexed_foreign_keys` 8→**0** (incl. 4 commerce FKs surfaced post-deploy, fixed in `20260713000003`), `duplicate_index` 2→**0**. Commerce P0 (8 tables, 13 tax rows) also live.

**Two pre-existing infrastructure bugs were found and fixed while deploying:**
- **CI deploy silently broken for months.** `deploy-migrations.yml` ran `supabase db push --project-ref …`; `--project-ref` is not a valid `db push` flag, so every run failed (migrations had been applied by other means). Fixed: `supabase link` + `db push`, a working commit-comment failure notifier, and a graceful skip when `SUPABASE_DB_PASSWORD` is absent. **Requires** a `SUPABASE_DB_PASSWORD` Actions secret to auto-deploy.
- **Migration-history mismatch.** The 8-digit `20260515_add_streaming_platforms.sql` collated ambiguously vs. its 14-digit siblings, so `db push` refused with a spurious "remote versions not found in local" error (recurring every push). Durably fixed: renamed to `20260515000000_…` and reconciled the remote history table; `migration list` now fully matched. (This was the deploy-blocking symptom of the broader bootstrap-gap; the full baseline was closed 2026-07-13, see "Outstanding as of 2026-07-13" above.)

**Security (`get_advisors security`) — 2 ERROR, 137 WARN, 1 INFO:**

| Finding | Count | Disposition |
|---|---|---|
| `rls_disabled_in_public` — `streaming_platforms`, `title_streaming_platforms` | 2 (ERROR) | **Fixed & deployed** in `20260713000001` — enable RLS + `public read` SELECT policy (mirrors `genres`). Confirmed live: anon had *effective INSERT* via default privileges (a real write hole); reads unchanged, writes now service-role-only. Advisor now reports 0. |
| `function_search_path_mutable` — user functions with a role-mutable `search_path` | 45 | **Fixed & deployed** in `20260713000001` — self-scoping loop pins every non-extension public function to `search_path = public` (matches the 5 already-pinned siblings). pgvector functions excluded. Advisor now reports 0. |
| `anon`/`authenticated_security_definer_function_executable` | 90 | Not a distinct fix — these are the same SECURITY DEFINER RPCs; pinning their search_path (above) closes the exploitable surface. Their EXECUTE grants are intentional (they *are* the app's RPC API, each doing its own auth check). |
| `rls_enabled_no_policy` — `device_auth_codes` | 1 (INFO) | **By design** (service-role-only device flow). BUT the source migration `20260416000005` defines `CREATE POLICY … FOR SELECT USING (true)` which would leak `access_token`/`refresh_token` to any anon if replayed. **Hardened** in `20260713000001` with a defensive `DROP POLICY IF EXISTS` (no-op today; protects against DR replay). |
| `extension_in_public` — `vector` in `public` | 1 | **✅ Fixed & deployed 2026-07-13 (Session 4).** Relocated to a dedicated `extensions` schema; `match_titles` updated to resolve it there. Validated with real embedding inserts + HNSW queries before deploy. Advisor now reports 0. |
| `auth_leaked_password_protection` disabled | 1 | **Needs a dashboard/API toggle** (Pro-plan Auth setting — Authentication → Providers → Email → "Leaked password protection", or `PATCH /v1/projects/{ref}/config/auth`). Not changed autonomously (auth-settings change). |

**Performance (`get_advisors performance`) — 76 WARN, 50 INFO:**

| Finding | Count | Disposition |
|---|---|---|
| `unindexed_foreign_keys` | 8 (+4) | **Fixed & deployed** — a covering index per FK column in `20260713000002`; 4 more commerce FKs surfaced post-deploy fixed in `20260713000003`. Advisor now reports 0. |
| `duplicate_index` — redundant UNIQUE identical to the PK (`list_ratings`, `title_genres`) | 2 | **Fixed & deployed** in `20260713000002` — dropped the redundant UNIQUE (verified no FK references it; PK still enforces uniqueness). Advisor now reports 0. |
| `duplicate_index` — pairs surfaced 2026-07-13 post-Session-3 (`follows`, `list_members`, `messages`) | 3 | **✅ Fixed & deployed 2026-07-13 (Session 5).** Root-caused to Session 2's index-fix migration duplicating pre-tracking/earlier-migration indexes under new names. Dropped the duplicates, kept the originals. Advisor now reports 0. |
| `auth_rls_initplan` — `auth.uid()` re-evaluated per-row | 53→61 (grew with commerce P0) | **✅ Fixed & deployed 2026-07-13 (Session 3).** All 61 live policies rewritten via `ALTER POLICY` to `(select auth.<fn>())`. Validated locally (structural + 9 functional access-scenario tests), deployed, advisor confirms 0. |
| `multiple_permissive_policies` | 21 (unchanged) | **✅ Fixed & deployed 2026-07-13 (Session 3).** Only 2 tables involved (`messages`, `list_members`) — 4 redundant policies dropped, 1 narrower UPDATE-only replacement added. Advisor confirms 0. |
| `unused_index` | 41→59 (grew with commerce P0) | **Deliberately deferred (Session 5), with evidence.** Every index in the DB — including every primary key — shows `idx_scan = 0` and `pg_stat_database.stats_reset` is null: no traffic signal exists yet to judge by, not a case-by-case call to make today. Scheduled task `movieknight-unused-index-recheck` re-checks 2026-09-26. |

## Where reality diverges from the stated "assumed context"

The audit brief's assumptions were mostly wrong — stated here because the brief explicitly asked:

| Assumption | Reality |
|---|---|
| "Client-only Vue SPA, no SSR/pre-rendering" | **False.** Next.js 16.2.6 App Router + React 19, with genuine SSR — Home and title-detail pages server-render real content, detail pages have correct per-title `generateMetadata` for SEO/social unfurling. Not Vue, not CSR-only. |
| "No version tags" | **True.** `git tag` is empty despite a v6.5 in `lib/version.ts` and CHANGELOG. Releases are tracked in prose, not tags. |
| "Multiple active branches" | **True.** `master` + `claude/elegant-agnesi-6a348c` (dead, safe to delete) + `claude/sharp-mayer-5e02fe` (genuinely diverged — would strip ~2,945 lines if merged today). |
| "Five product verticals compete for the same UI" | **Four exist** (tracking, discovery, streaming, social). The fifth (physical-media commerce) has **zero code**. It isn't competing for UI — it isn't there. |
| Product identity | **Four different names** for one product: `package.json` → `cinestream`, `README.md` → "StreamSocial", app metadata → "CineStream", domain/branding → "MovieKnight" (movieknight.ca). Evidence of an incomplete rebrand. |

A prior third-party audit (`ADAM_DOCS/gemini_feedback_05242026.md`, Gemini CLI, 2026-05-24) exists. This audit corroborates its real findings (rate-limiter fail-open, hook-ordering issues, `debug-logger` PII risk) and **corrects two of its numbers**: "100+ `any` instances" is now **39**, and the `.in('id', [...])` URL-length risk is **not currently live** (all call sites are bounded). Where this audit goes further: the commerce vertical, the broken streaming filter, framework/rendering identity, testing, accessibility, and deployment/rollback.

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

- **[Medium · Confirmed]** `tv-auth`'s local `getClientIp()` (`tv-auth/index.ts:36`) prioritizes the spoofable `X-Forwarded-For` over `cf-connecting-ip` — the **opposite** of the safer shared helper — undermining its own documented brute-force limits on device-pairing (20 claims/min/IP). **✅ resolved 2026-07-13 (Remediation Session 10)** — priority swapped.
- **[Medium · Confirmed]** The rate limiter (`_shared/rate-limit.ts:34-39`) **fails open** when Upstash env vars are missing (`console.warn` + `return true`) — corroborates Gemini. Network errors *after* config fail closed, so only the missing-config path is silently permissive, in front of paid OpenAI-embedding endpoints. **✅ resolved 2026-07-13 (Remediation Session 10)** — now alerts via `logEdgeError` (once per isolate) in addition to the console.warn.
- **[Medium · Confirmed]** `lib/debug-logger.ts` globally intercepts `console.*`/`onerror`/`fetch` and ships raw, **unredacted** message text + stringified args + stack traces to `/api/debug/ingest`, stored verbatim in Postgres. No sanitization step. Mitigated on the read side (auth-required ingest + RLS restricting reads to owner/service-role), so it's a data-*minimization* risk, not a cross-user leak — any future `console.log` with a token/email gets durably persisted. **✅ resolved 2026-07-13 (Remediation Session 10)** — `lib/pii-redact.ts` applied here and to the other 3 telemetry/error loggers.
- **[Low · Confirmed]** The hardcoded JWT in `20260417000004_content_sync_schedule.sql` is **`role:anon`, not service-role** (decoded and confirmed) — and the target function has `verify_jwt = false`, so the header isn't even enforced. Materially lower severity than it looks; still worth moving to `current_setting()` like the newer migrations do.
- **[Low · Confirmed]** Two CORS helpers coexist: the strict `cors-utils.ts` (used by all 8 edge functions) and a weaker `cors.ts` that falls back to a default allow-origin — the latter is **dead code** (zero importers). Not exploitable; invites a future copy-paste mistake.
- **[Low · Confirmed]** `npm audit`: **0 critical, 4 high** of 467 packages. The reachable one is `protobufjs` via `posthog-js` (ships to client, but the vulnerable server-side parse path is unlikely reachable from a browser SDK; `fixAvailable: true`); the rest are dev/build-only (`path-to-regexp` via `@vercel/config`, `@babel/core`). **✅ resolved 2026-07-13 (Remediation Session 10)** — `protobufjs` gone entirely via `npm audit fix`; the dev-only `path-to-regexp` chain deliberately left (would need a breaking `--force` downgrade for a non-reachable dependency).

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
- **[Medium · Confirmed]** Custom modals (trailer, search overlay) lack `role="dialog"`/`aria-modal`, focus trap, and (trailer) any Escape handler — Tab escapes into the page behind. **✅ resolved 2026-07-13 (Remediation Session 7)** — and extended to 5 more modals found with the identical gap; see "Outstanding" above.
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
| 13 | ~~**Unify product naming**~~ (§9) — pick one (MovieKnight) across `package.json`, README, app metadata. | 1-2 hrs | **✅ Done 2026-07-13** (cosmetic scope — display strings, docs, comments; the live Vercel project/domain and webOS bundle ID are load-bearing infra IDs, deliberately excluded, need a separate migration). |
| 14 | ~~**Redact `debug-logger` before persistence**~~ (§6) — strip auth headers/tokens/emails before `/api/debug/ingest`. | 3 hrs | **✅ Done 2026-07-13** — `lib/pii-redact.ts` applied to all 4 telemetry/error loggers (client, boundaries, API routes, edge functions), not just `debug-logger.ts`; verified against 5 representative test inputs. |
| 15 | **Delete dead code** (§2, §6, §10) — unused `cors.ts`, `cron/health-check/route.ts`, and the `CircuitBreaker` import gap in the TMDB path (either wire it in or note why not). | 2 hrs | Dead files removed; `npx eslint` clean of the ineffective disable comments. |
| 16 | ~~**Fix `tv-auth` IP-header order + rate-limiter fail-open alerting**~~ (§6) — match the safer shared helper; make the missing-Upstash path at least alert loudly. | 2 hrs | **✅ Done 2026-07-13** — `tv-auth` now prioritizes `cf-connecting-ip`; separately, `_shared/rate-limit.ts`'s actual fail-open path (the one really "in front of paid OpenAI-embedding calls") now alerts via `logEdgeError`. |
| 17 | ~~**Version tags + doc refresh**~~ (§ intro, §2) — tag releases (`git tag v6.5`); refresh `docs/database.md` `titles` schema. | 2 hrs | **✅ Done 2026-07-13** — v6.1–v6.10 tagged (pre-v6.1 skipped, ambiguous history); `docs/database.md` now lists all 27 live `titles` columns and all 8 indexes/constraints, verified against `information_schema`/`pg_indexes`. |
| 18 | ~~**Address the 39 `any` + reachable `npm audit` fix**~~ (§4, §6) — type the worst offenders; `npm audit fix` for `protobufjs`. | 3-4 hrs | **✅ Done 2026-07-13** — worst file (`mcp-server/src/index.ts`, 19/39) fully typed; `protobufjs` (+ `dompurify`/`js-yaml` for free) resolved via `npm audit fix`, confirmed 0 remaining reachable advisories. |

---

*Findings sourced from a 9-agent structured audit with adversarial re-verification of all Blocker/High Confirmed claims; a sample re-checked by hand against source before publication. Live Supabase advisor data was unavailable — re-run §6 with an access token to confirm runtime RLS state.*
