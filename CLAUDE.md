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

**Date:** 2026-05-21 (Provisioning Session)  
**Branch:** master  
**Last commit:** `d3e97c1` (all code work complete from prior session)

### ✅ Completed (This Session — Provisioning)

- **Task 1: Provision Upstash Redis** — ✅ COMPLETE
  - Via Vercel Marketplace → Upstash for Redis → Free tier
  - Database: `upstash-kv-red-coin` (ID: 8754fe70-7869-4e36-9406-6e8718b76945)
  - Connected to cinestream-app project with Production environment
  - Environment variables auto-injected: `STORAGE_URL`, `STORAGE_REST_API_TOKEN`
  - Status: Available (verified via Vercel integration console)

- **Task 2: Deploy health-monitor edge function** — ✅ MOSTLY COMPLETE
  - Edge function deployed: `supabase functions deploy health-monitor` ✅
  - Executed successfully; function is ACTIVE (Version 1, deployed 2026-05-21 15:24:19)
  - MONITOR_SECRET set: `2615cd72d48dc8a33ed5559150e16929` ✅
  - ⏳ Pending: Cron schedule configuration (*/5 * * * *) via Supabase Dashboard

- **Task 3: Apply DB migration** — ✅ COMPLETE
  - Migration `20260520000001_keyword_search_rpc` already applied to production
  - Verified via `supabase migration list` (marked as applied on both local and remote)
  - `get_titles_by_keywords` RPC with GIN index + tsvector live in production

- **Task 4: Set up UptimeRobot** — ⏳ BLOCKED
  - Browser navigation restriction prevents access to uptimerobot.com
  - Requires manual setup: https://uptimerobot.com → New Monitor → HTTP → `https://movieknight.ca/api/health` → 5-min interval

### 🔴 Issues Identified

- **health-monitor cron schedule not configured** — Function deployed but cron trigger not active. Requires Supabase Dashboard: Edge Functions → Schedules → set `*/5 * * * *` for health-monitor.
- **SLACK_WEBHOOK_URL not set** — Slack alerts will not fire until this secret is configured. Health-monitor will still run and monitor health (code defaults to empty string and skips Slack on line 51).
- **UptimeRobot setup requires browser** — Manual account creation + monitor setup needed (cannot complete programmatically in this session).

### 📋 Next Session

1. **Configure health-monitor cron schedule** — Supabase Dashboard → Edge Functions → Schedules → health-monitor → `*/5 * * * *`
2. **(Optional) Set SLACK_WEBHOOK_URL** — If Slack alerts desired: `supabase secrets set SLACK_WEBHOOK_URL=<your-webhook>` (from Slack Incoming Webhooks app)
3. **Set up UptimeRobot** (manual) — https://uptimerobot.com → Sign up (free) → Add HTTP Monitor → URL: `https://movieknight.ca/api/health` → Interval: 5 minutes → Alert: email
4. **Verify health-monitor cron execution** — Check Supabase Edge Function logs after 5 minutes to confirm first execution

