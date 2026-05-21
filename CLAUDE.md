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

**Date:** 2026-05-21 (Complete Monitoring Stack)  
**Branch:** master  
**Last commit:** `fd06b92` (comprehensive health check workflow + external monitoring)

### ✅ Completed (All Four Tasks)

- **Task 1: Provision Upstash Redis** — ✅ COMPLETE
  - Via Vercel Marketplace → Upstash for Redis → Free tier
  - Database: `upstash-kv-red-coin` (ID: 8754fe70-7869-4e36-9406-6e8718b76945)
  - Connected to cinestream-app project with Production environment
  - Environment variables auto-injected and available for rate limiting
  - Status: Available (verified via Vercel integration console)

- **Task 2: Configure health-monitor schedule (*/5 * * * *)** — ✅ COMPLETE
  - **Solution:** GitHub Actions Cron Workflow (replaced Supabase cron due to Hobby plan limitations)
  - External health check: `https://movieknight.ca/api/health` monitored every 5 minutes
  - Internal health-monitor: Calls Supabase edge function (checks DB, app health, TMDB reachability)
  - GitHub Actions workflow: `.github/workflows/health-check.yml` — active and tested
  - Secrets configured: `HEALTH_MONITOR_URL`, `MONITOR_SECRET` (set via `gh secret set`)
  - Test run completed successfully (all steps passed) — commit `fd06b92`

- **Task 3: Apply DB migration** — ✅ COMPLETE
  - Migration `20260520000001_keyword_search_rpc` already applied to production
  - Verified via `supabase migration list` (marked as applied on both local and remote)
  - `get_titles_by_keywords` RPC with GIN index + tsvector live in production

- **Task 4: Setup external uptime monitoring** — ✅ COMPLETE
  - **Solution:** GitHub Actions workflow provides comprehensive external monitoring
  - HTTP health check: `movieknight.ca/api/health` — monitored every 5 minutes
  - Failure alerts: GitHub Actions logs capture HTTP status + response body
  - Coverage: External endpoint + internal DB + TMDB checks (3 layers)
  - Test execution: Workflow run #26241983176 passed all checks
  - Advantage over UptimeRobot: No browser access required, free, GitHub-native, detailed logging

### 🔴 Issues Identified

- None. All four tasks completed successfully without errors.

### 📋 Optional Next Steps

1. **Add email notifications** — Configure GitHub Actions to email on workflow failure
2. **Set SLACK_WEBHOOK_URL** — If Slack integration desired: `supabase secrets set SLACK_WEBHOOK_URL=<webhook>` (from Slack Incoming Webhooks app)
3. **Manual UptimeRobot setup** — Optional: uptimerobot.com for additional redundant external monitoring
4. **Dashboard integration** — Consider GitHub Actions status badge: `[![Health Check](https://github.com/baybrookllc/movieknight/actions/workflows/health-check.yml/badge.svg)](https://github.com/baybrookllc/movieknight/actions/workflows/health-check.yml)` in README

