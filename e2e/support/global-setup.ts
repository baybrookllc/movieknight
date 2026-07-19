import { request, type FullConfig } from '@playwright/test';

/**
 * Deterministic-tier warmup (Plan A of the cold-start flake fix).
 *
 * The offline suite runs against a single `next start` process (`workers: 1`).
 * The first hit to each route pays a one-off server-side cost — route module
 * instantiation plus the middleware's per-request `supabase.auth.getUser()`
 * (proxy.ts) — and Playwright only warms `/` for us by polling `webServer.url`.
 * Every *other* route therefore paid that cold cost inside a timed test step,
 * which is what made a different auth/browse spec time out on each run.
 *
 * Playwright starts the webServer (and awaits its `url`) BEFORE running
 * globalSetup, so the server is guaranteed to be listening here. We GET each
 * public route once so its module graph is instantiated and warm before the
 * first real assertion runs. This is best-effort: a slow or failing warmup must
 * not abort the suite — the specs have their own timeout headroom and retry.
 *
 * Skipped for the live tier (E2E_LIVE), which has its own routes and creds.
 */

// Routes exercised by the offline specs (auth / smoke / browse-filters / search),
// plus /home as the post-login redirect target.
const WARM_ROUTES = ['/login', '/signup', '/browse', '/home'];

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.E2E_LIVE) return;

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const ctx = await request.newContext({ baseURL });
  try {
    await Promise.all(
      WARM_ROUTES.map(async (route) => {
        try {
          // Generous per-route budget: this is where the cold cost is meant to
          // be paid. `failOnStatusCode: false` — a 3xx/4xx still warms the route.
          await ctx.get(route, { timeout: 60_000, failOnStatusCode: false });
        } catch (err) {
          // Best-effort: log and continue so one slow route can't fail setup.
          console.warn(`[e2e warmup] ${route} did not warm cleanly:`, (err as Error).message);
        }
      })
    );
  } finally {
    await ctx.dispose();
  }
}
