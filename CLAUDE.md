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
- **Integration**:
  - `/app/api/claude/ask/route.ts`: Anthropic API with retry (2 retries, 100ms-1s backoff)
  - `/supabase/functions/semantic-search/index.ts`: OpenAI embeddings + circuit breaker + keyword fallback
  - `/supabase/functions/generate-embedding/index.ts`: OpenAI embeddings + circuit breaker + retry logic
- **Build**: ✓ Compiled successfully, TypeScript clean, 20/20 pages. Commit: `577047f`

### 🔴 Issues Identified

- **Upstash env vars not yet configured**: Rate limiters fall back to in-memory. Provision via Vercel Marketplace.
- **Semantic search keyword fallback** fetches all titles client-side — should use `to_tsvector` RPC. Low urgency.
- **OpenAI circuit breaker** will need monitoring in production to tune thresholds (failureThreshold, resetTimeoutMs).

### 📋 Next Session

1. **Deploy Phase 1 & 2 to production** — Push to Vercel, verify timeouts and retries work end-to-end.
2. **Provision Upstash Redis** — Vercel Marketplace → add Upstash. Rate limiters activate automatically.
3. **Optimize semantic search keyword fallback** — Create `get_titles_by_keywords` RPC using `to_tsvector` instead of client-side filtering.
4. **(Phase 3)** Implement monitoring: Grafana Cloud free tier (logs), UptimeRobot (uptime %), Slack webhooks (alerts).

**Ready for:** Production deployment. 95% uptime baseline established via timeout + retry + circuit breaker pattern.

