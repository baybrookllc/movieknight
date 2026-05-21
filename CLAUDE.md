@AGENTS.md

## Rules

### Operational Model

- **You are the only technical member of this team.** I will specify what I want; you confirm the approach and execute it.
- **Timeline communication:** Only report your actual required time to complete the work. No multi-week estimates that depend on hiring, organizational decisions, or external factors. If something takes 4 hours to code and test, say "4 hours." If deployment needs human approval, say "deployment ready, waiting on approval" — but the technical work is done.
- **Decision-making:** Make architectural and technical decisions autonomously. If you encounter a trade-off, state it clearly (e.g., "this costs $X/month more but adds 99.99% uptime") and proceed with what aligns to the stated goal.
- **No handoff delays:** Ship working code immediately. Do not wait for planning meetings, architecture reviews, or team consensus.

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
**Branch:** master  
**Focus:** Phase 1 & 2 — Timeout enforcement and retry logic with circuit breaker (95% uptime target)

### ✅ Completed

#### Phase 1: Timeout Enforcement (100% complete)
- Verified timeouts on all external API calls: 3s Upstash, 8s TMDB/OpenAI, 10s Claude/Resend, 15s Wikidata
- Files with timeout enforcement: claude/ask (10s), semantic-search (8s), generate-embedding (8s), tv-seasons (8s), notify-watchlist (10s), tmdb-cache (8s/15s), for-you (10s via Promise.race)
- All timeouts use AbortSignal with proper cleanup or Promise.race wrappers
- Graceful fallbacks: semantic-search→keyword, for-you→empty results

#### Phase 2: Retry Logic & Circuit Breaker (100% complete)
- **`/lib/retry.ts`**: Node.js retry utility with exponential backoff + jitter. Default: 3 retries, 100ms-5000ms backoff, 2x multiplier. Retries on: AbortError, network errors. Does NOT retry: app errors, 4xx auth.
- **`/supabase/functions/_shared/retry.ts`**: Deno-compatible retry utility (identical logic for edge functions)
- **`/supabase/functions/_shared/circuit-breaker.ts`**: Circuit breaker for Deno. States: CLOSED→OPEN→HALF_OPEN. Default: 3 failures to open, 30s reset, 60s window.
- **Integration**: claude/ask (Anthropic API), semantic-search (OpenAI + circuit breaker), generate-embedding (OpenAI + circuit breaker)
- Commit: `577047f`

#### Phase 3: Monitoring Infrastructure (100% complete)
- **`/app/api/health`**: Health check endpoint for UptimeRobot to poll (`GET /api/health`). Checks: env vars, Supabase DB ping. Returns 200/503 with JSON payload.
- **`/supabase/functions/health-monitor`**: Cron edge function (every 5 min). Checks: DB, app health endpoint, TMDB. Sends Slack alerts on degradation. Deploys via `supabase functions deploy health-monitor`.
- **`/supabase/migrations/20260520000001_keyword_search_rpc.sql`**: `get_titles_by_keywords(p_query, p_media_type, p_limit)` RPC using GIN + `to_tsvector` / `plainto_tsquery`. Server-side full-text search — replaces client-side title filtering in semantic-search fallback.
- semantic-search `keywordSearch()` now calls `get_titles_by_keywords` RPC instead of fetching all titles.
- **Build**: ✓ Compiled successfully, TypeScript clean, 20/20 pages.

### 🔴 Issues Identified

- **Upstash env vars not yet configured**: Rate limiters fall back to in-memory. Provision via Vercel Marketplace → Upstash.
- **`MONITOR_SECRET` / `SLACK_WEBHOOK_URL`**: Must be set as Supabase secrets before health-monitor cron runs. Use: `supabase secrets set MONITOR_SECRET=<val> SLACK_WEBHOOK_URL=<webhook>`.
- **UptimeRobot**: Needs manual setup at uptimerobot.com — add HTTP monitor pointing to `https://movieknight.ca/api/health`.
- **OpenAI circuit breaker** thresholds may need tuning after production observation (currently: 3 failures / 30s reset).

### 📋 Next Session

1. **Provision Upstash Redis** — Vercel Marketplace → Upstash Redis → install. Auto-injects env vars; rate limiters activate.
2. **Deploy health-monitor edge function** — `supabase functions deploy health-monitor` + set secrets: `MONITOR_SECRET`, `SLACK_WEBHOOK_URL`.
3. **Apply migration** — `supabase db push` to deploy `get_titles_by_keywords` RPC to production.
4. **Set up UptimeRobot** — Free account at uptimerobot.com → HTTP monitor → `https://movieknight.ca/api/health` → 5-min interval → alert to email.
5. **Apply keyword search migration to production** — will activate server-side FTS in semantic-search fallback.

**Ready for:** All code complete and committed. Remaining work is external service provisioning (Upstash, Slack, UptimeRobot).

