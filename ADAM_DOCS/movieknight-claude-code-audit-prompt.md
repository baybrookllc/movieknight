# MovieKnight — Full Codebase Audit (Claude Code Prompt)

Paste everything below the line into a fresh Claude Code session, run from the project root.

---

I want a ground-truth audit of this codebase — not a feature wishlist, a structural assessment of what exists, what's broken, what's missing, and what it takes to move this from pre-release to a shippable v1.

**Project:** MovieKnight — a film/TV tracking and discovery platform combining Letterboxd-style logging, JustWatch-style streaming availability aggregation, IMDb-style metadata, and a physical media marketplace, targeting the Canadian cinephile/collector market.

**Assumed context — verify, don't trust:**
- Client-only Vue SPA, no SSR/pre-rendering, as of the last external check.
- Pre-release, multiple active branches, no version tags at last check.
- Five product verticals (tracking, discovery, streaming aggregation, social, physical-media commerce) compete for the same UI.

Do not accept any of the above as fact. Confirm or correct each claim against the actual repo, and say explicitly where reality diverges from what I described.

## Phase 1 — Read-only reconnaissance

Before touching anything, map the repo. Read `package.json` / framework config (`nuxt.config`, `vite.config`, or equivalent), the folder structure, README, CI config, `.env.example`, and git branch/tag history. Identify: framework + version, rendering strategy (CSR/SSR/SSG/hybrid), state management, API layer, database/ORM, auth provider, payment/commerce integration, hosting/deploy target, test framework (if any), lint/type-check setup. State what you find from opening the files — don't infer from filenames alone.

## Phase 2 — Structured audit

For each area below: assess it, cite the specific file/directory backing each claim, tag each finding **Confirmed** (you read the code) or **Inferred** (you're reasoning from indirect signals), and rate severity — **Blocker / High / Medium / Low**.

1. **Architecture & rendering** — Is the CSR-only assumption still true? If so, quantify the SEO/LLM-citation/social-preview impact concretely (what a crawler or link unfurler actually receives today). What's the realistic migration path to SSR/SSG — framework-native upgrade vs. rewrite — and its cost in dev-weeks?
2. **Data model & API layer** — How is movie/TV metadata sourced (TMDB/OMDb/custom)? How is streaming availability sourced, and how fresh is it? Any caching or rate-limit handling? Is the schema coherent across the five verticals, or bolted together?
3. **Physical media commerce** — What actually exists: catalog, cart, checkout, inventory, payment processor? This is the one vertical no competitor (Letterboxd/Trakt/JustWatch/Serializd) offers — assess whether the code reflects that priority, or if it's a stub.
4. **Code quality & tech debt** — Dead code, duplicated logic, inconsistent patterns across branches, TODOs/FIXMEs, anti-patterns. Are branches diverging in ways that will cause merge pain?
5. **Testing & CI** — What coverage exists (unit/integration/e2e)? Is CI actually running anything, or is this trust-the-developer territory?
6. **Security** — Auth handling, secrets management, input validation/sanitization, exposed API keys, CORS config, dependency vulnerabilities (`npm audit` or equivalent).
7. **Performance** — Bundle size, unnecessary re-renders, N+1 query patterns, image handling for a media-heavy UI, lazy-loading.
8. **Accessibility** — Semantic HTML, alt text, keyboard nav, contrast — this product lives on a media-browsing interface.
9. **Scope vs. maturity** — Does the code match the five-vertical ambition, or is it further behind (or further along) than the product positioning assumes? Be blunt about the gap.
10. **Deployment & ops** — Build pipeline, environment config, monitoring/error tracking (or its absence), rollback story.

## Phase 3 — Output

Produce one report containing:
- A one-paragraph blunt summary: is this codebase closer to "needs polish" or "needs a rebuild of core parts"?
- The Phase 2 findings, each tagged Confirmed/Inferred and Blocker/High/Medium/Low.
- A prioritized roadmap ordered by (impact × urgency) ÷ effort — not a wishlist, a sequence. Buckets: **Fix now** (blockers), **Next milestone** (high-value structural work), **Later** (polish/nice-to-have).
- For each roadmap item: a rough effort estimate (hours/days/weeks) and a concrete definition of "done."

Do not pad this with encouragement or soften findings to be diplomatic. If something is genuinely bad, say so and say why.
