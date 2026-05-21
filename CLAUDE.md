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

### 2026-05-20 — 95% Uptime Stack (master)
- **Phase 1** (timeouts): AbortSignal/Promise.race on all external calls — 3s Upstash, 8s TMDB/OpenAI, 10s Claude/Resend, 15s Wikidata. Graceful fallbacks throughout. (commit `577047f`)
- **Phase 2** (retry + circuit breaker): `lib/retry.ts`, `_shared/retry.ts`, `_shared/circuit-breaker.ts`. Integrated into claude/ask (Anthropic), semantic-search (OpenAI), generate-embedding (OpenAI). (commit `577047f`)
- **Phase 3** (monitoring): `GET /api/health` for UptimeRobot; `health-monitor` cron edge fn with Slack alerts; `get_titles_by_keywords` RPC migration (GIN + tsvector). (commit `820f225`)
- **Refactor**: Extracted `_shared/openai-embeddings.ts` and `_shared/request-utils.ts`; parallelised health checks; removed dead code and duplicate clearTimeout. (commit `d3e97c1`)

---

## Current Session Status

**Date:** 2026-05-20  
**Branch:** master  
**Last commit:** `d3e97c1`

### ✅ Completed

- **Full 95% uptime stack** — all code written, tested (build clean), and committed.
- **`/lib/retry.ts`** + **`/supabase/functions/_shared/retry.ts`**: Exponential backoff + jitter. `isRetryableError()` extracted; JSDoc corrected (retryWithBackoff retries network/timeout only; 429/503 is retryFetch's concern).
- **`/supabase/functions/_shared/circuit-breaker.ts`**: CLOSED→OPEN→HALF_OPEN. 3-failure threshold, 30s reset, 60s window.
- **`/supabase/functions/_shared/openai-embeddings.ts`**: Single source for OpenAI embedding calls — timeout + retry + circuit breaker. Used by semantic-search and generate-embedding.
- **`/supabase/functions/_shared/request-utils.ts`**: Shared `getClientIp()` for edge functions.
- **`/app/api/health/route.ts`**: `GET /api/health` — checks env vars + Supabase DB ping. Returns 200/503.
- **`/supabase/functions/health-monitor/index.ts`**: Cron edge fn (*/5 * * * *). Parallel DB + app + TMDB checks. Slack Block Kit alert on degradation.
- **`/supabase/migrations/20260520000001_keyword_search_rpc.sql`**: `get_titles_by_keywords` RPC (GIN index + plainto_tsquery). semantic-search fallback uses it instead of client-side filter.

### 🔴 Issues Identified

- **Upstash not provisioned**: Rate limiters fall back to in-memory until Vercel Marketplace → Upstash Redis is connected.
- **health-monitor not deployed**: Needs `supabase functions deploy health-monitor` + secrets set.
- **Migration not applied**: `get_titles_by_keywords` RPC is committed but not yet in production DB — `supabase db push` required.
- **UptimeRobot not configured**: Manual step — no code needed, just account setup.

### 📋 Next Session

1. **Provision Upstash Redis** — Vercel Marketplace → Upstash → install to project. Env vars auto-inject; rate limiters activate with no code changes.
2. **Deploy monitoring** — `supabase secrets set MONITOR_SECRET=<random32> SLACK_WEBHOOK_URL=<webhook>` then `supabase functions deploy health-monitor`.
3. **Apply DB migration** — `supabase db push` (deploys `get_titles_by_keywords` RPC + GIN index to production).
4. **Set up UptimeRobot** — uptimerobot.com → New Monitor → HTTP → `https://movieknight.ca/api/health` → 5-min interval → email alert.

