import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Playwright e2e configuration for MovieKnight.
 *
 * Two tiers, selected by the E2E_LIVE env var:
 *
 *  • Deterministic tier (default) — every *browser-layer* Supabase request is
 *    intercepted (see e2e/support/supabase-mock.ts), so the client makes no real
 *    network calls and the suite needs no secrets. It runs against a production
 *    build (`next build && next start`, see webServer below) with dummy Supabase
 *    env, exercising client-rendered public routes (/login, /signup, /browse).
 *    NOTE: the middleware (proxy.ts) still runs a *server-side*
 *    `supabase.auth.getUser()` per request against the dummy host — that call is
 *    not interceptable at the browser layer and fails/degrades gracefully. Its
 *    variable latency on a cold `next start`, not any product bug, is why routes
 *    are warmed up front (globalSetup) and given timeout headroom below. This is
 *    what gates CI.
 *
 *  • Live tier (E2E_LIVE=1) — the specs under e2e/live/ render the SSR pages
 *    (/home, a title detail page) against the real backend using .env.local.
 *    Read-only, opt-in, never part of the CI gate. Run locally to smoke-test
 *    that SSR data fetching still works end-to-end.
 */

const IS_LIVE = !!process.env.E2E_LIVE;
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Dummy Supabase creds for the deterministic tier. The values only need to let
// the browser client construct and the app boot — every request is stubbed.
// Setting them in the process env also stops Next from loading the real values
// out of .env.local (Next never overrides an env var already present).
//
// NOTE: the host stays under *.supabase.co on purpose. `NEXT_PUBLIC_*` is
// build-time-inlined into BOTH the client and the middleware bundle, and the
// production CSP (proxy.ts `connect-src`) only allows `https://*.supabase.co` —
// so any other host would be blocked in the browser before the mock could
// intercept it. The middleware's server-side getUser against this host still
// costs a first-hit DNS/connect (the residual cold-start cost); the globalSetup
// warmup pays it up front and the local retry absorbs the remainder.
const DETERMINISTIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InRlc3QifQ.e2e-deterministic-anon-key',
  // lib/env.ts validateEnv() requires this at runtime (it only warns during the
  // build phase). A dummy value satisfies the check; the service-role client is
  // never actually exercised by the deterministic routes, and any request it
  // made would be intercepted anyway.
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoidGVzdCJ9.e2e-deterministic-service-key',
};

// Live tier only: parse .env.local ourselves and hand the real creds to the
// build+start child. Next won't reliably auto-load .env.local here because the
// Playwright runner sets NODE_ENV=test, under which Next ignores it. Reading it
// explicitly removes any ambiguity about env-file precedence.
function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m || line.trimStart().startsWith('#')) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[m[1]] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export default defineConfig({
  // Live run only picks up e2e/live/**; the default run picks up e2e/** but
  // skips the live folder.
  testDir: IS_LIVE ? './e2e/live' : './e2e',
  testIgnore: IS_LIVE ? undefined : ['**/live/**'],
  // Warm every offline route before the suite so per-route cold-start cost isn't
  // paid inside a timed test step (see e2e/support/global-setup.ts). No-op for
  // the live tier.
  globalSetup: IS_LIVE ? undefined : './e2e/support/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One local retry absorbs the residual server-side getUser() latency variance
  // on a cold prod start; CI keeps 2. Combined with the warmup above and the
  // timeout headroom below, this is what stabilises the offline auth specs.
  retries: process.env.CI ? 2 : 1,
  // Headroom over Playwright's default 5s expect / 30s navigation / 30s per-test
  // so a warm-but-slow first hit doesn't flake. These are ceilings, not waits —
  // a fast route still resolves immediately. The per-test bump matters most: the
  // one observed flake was the login→/home redirect hitting the 30s *test* cap
  // while `waitForURL` waited on the cold server-side getUser; 60s lets it pass
  // on the first attempt rather than leaning on the retry.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One worker: a single `next start` process serves every request, and the
  // first hit to each route pays a cold module-instantiation cost. Parallel
  // workers hammering it at once overwhelm that cold start and time out
  // navigations; serialized, each route warms once and the whole suite runs in
  // ~25s. Correctness over marginal wall-clock here.
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Navigation headroom for the cold first hit; actionTimeout stays modest so
    // a genuinely stuck click still fails fast.
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production build for both tiers: routes are pre-compiled (fast, no
    // on-demand-compile flake) and fire `load` normally, unlike `next dev`
    // whose HMR/streaming connection keeps `load` from ever firing. The build
    // succeeds with dummy env because every app route is dynamic — nothing is
    // prerendered at build time, so the failing SSR fetch is caught at request
    // time and degrades gracefully.
    command: 'npm run build && npm run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Live tier: real creds from .env.local (+ NODE_ENV=production for a clean
    // prod boot). Deterministic tier: dummy creds so no real backend is ever
    // contacted.
    env: IS_LIVE ? { NODE_ENV: 'production', ...loadEnvLocal() } : DETERMINISTIC_ENV,
  },
});
