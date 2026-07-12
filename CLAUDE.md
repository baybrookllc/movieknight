@AGENTS.md

## Rules

### Operational Model

- **You are the only technical member of this team.** I will specify what I want; you confirm the approach and execute it.
- **Timeline communication:** Only report your actual required time to complete the work. No multi-week estimates that depend on hiring, organizational decisions, or external factors. If something takes 4 hours to code and test, say "4 hours." If deployment needs human approval, say "deployment ready, waiting on approval" — but the technical work is done.
- **Decision-making:** Make architectural and technical decisions autonomously. If you encounter a trade-off, state it clearly (e.g., "this costs $X/month more but adds 99.99% uptime") and proceed with what aligns to the stated goal.
- **No handoff delays:** Ship working code immediately. Do not wait for planning meetings, architecture reviews, or team consensus.
- **Versioning:** every push to git/prod requires the version code on the website to be updated, including date and time stamp (`lib/version.ts`).

### Session & Cost Discipline

- Default model for this project is Sonnet 5. Only switch to Opus for a specific hard problem (a tricky architecture call, a bug Sonnet has already failed on twice) and switch back once it's resolved — don't leave Opus or Fast Mode selected for routine implementation/debug work. Opus costs several times more per token than Sonnet.
- Treat the end of a unit of work (feature shipped, bug fixed and verified, blocker hit) as a natural point to end the session, not just pause. Every turn re-reads the entire accumulated conversation, so one conversation spanning many tasks or many hours makes each later turn far more expensive than starting fresh. Prefer starting a new session for the next task over continuing a long-running one.
- Don't invoke multi-agent workflow/orchestration tooling on generic continuation prompts like "proceed" or "continue" — only when explicitly asked for a multi-agent review/workflow pass.
- Keep this file (`CLAUDE.md`) to durable operating rules only. Session-by-session history, version notes, and status updates belong in `CHANGELOG.md` — this file is read in full on every turn, so anything that only matters once bloats every future session for no benefit.

### Session Handoff Protocol

- **State management:** Before wrapping up a task, hitting a blocker you can't solve, or when asked to pause, add an entry to `CHANGELOG.md` under `## [Unreleased]` — not to this file.
- **Format:** `Added` / `Changed` / `Fixed` bullets consistent with the rest of `CHANGELOG.md`, plus a short "Next session" note if there's a clear, specific follow-up.
- **Git:** After updating, stage and commit `CHANGELOG.md` (and `lib/version.ts` per the versioning rule) so the record is preserved on the branch.
