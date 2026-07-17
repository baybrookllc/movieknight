# End-to-end tests (Playwright)

Two tiers, selected by the `E2E_LIVE` environment variable.

## Deterministic tier (default — gates CI)

```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # interactive UI mode for debugging
```

- Runs against `next dev` booted with **dummy** Supabase env, so it needs no
  secrets and makes **zero** real network calls.
- Every `*.supabase.co` request is intercepted at the browser layer by
  `e2e/support/supabase-mock.ts`, which serves tiny local fixtures (auth token,
  edge-function search results) and returns an empty array for everything else.
- Covers only client-rendered public routes (`/login`, `/signup`, `/browse` and
  its search overlay) — the parts whose behaviour is deterministic and
  backend-independent.

Specs:
- `auth.spec.ts` — login/signup render, required-field validation, invalid-
  credential error, successful-login redirect to `/home`.
- `browse-filters.spec.ts` — **regression guards** for browse-filter behaviour:
  the Platform filter renders (restored once its streaming-sync pipeline shipped),
  and "Clear all" visibility tracks active-filter state (the operator-precedence /
  truthy-string bug).
- `search.spec.ts` — the ⌘K/Ctrl+K search overlay: opens, renders results,
  Enter and "See all" route to `/browse?q=`.
- `smoke.spec.ts` — public routes boot without an uncaught exception.

## Live tier (opt-in — NOT in CI)

```bash
E2E_LIVE=1 npm run test:e2e
```

- Runs against a real production build (`next build && next start`) using your
  local `.env.local`, hitting the **real** Supabase backend, **read-only**.
- Only picks up `e2e/live/**`. Covers the SSR pages that fetch server-side and
  therefore can't be intercepted in the browser: `/home`'s hero and a title
  detail page (discovered by clicking a real browse result).
- Deliberately excluded from CI so pull requests never touch production.

## Notes

- Playwright specs use the `.spec.ts` suffix; Vitest unit tests use `.test.ts`
  and live next to the code under `lib/`, `components/`, `app/`. The two runners
  never pick up each other's files.
- Reports land in `playwright-report/` and traces/results in `test-results/`;
  both are git-ignored.
