import { test, expect } from '@playwright/test';

/**
 * OPT-IN LIVE TIER — runs only when E2E_LIVE=1 (see playwright.config.ts, which
 * points testDir at e2e/live for that run). These exercise the SSR pages that
 * fetch server-side and therefore cannot be intercepted at the browser layer:
 * /home's hero and a title detail page. They hit the REAL backend using
 * .env.local, read-only (GETs only — no writes, no mutations), so they never
 * degrade production data. Not part of the CI gate.
 */
test.describe('Live SSR smoke (real backend, read-only)', () => {
  test('/home renders its shell', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));

    const resp = await page.goto('/home');
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });
    expect(crashes, crashes.join('\n')).toEqual([]);
  });

  test('a real title detail page renders from a browse result', async ({ page }) => {
    await page.goto('/browse');

    // Wait for the first real title card (default browse returns live data).
    const firstCard = page.locator('[data-title-idx="0"]').first();
    await expect(firstCard).toBeVisible({ timeout: 25000 });

    await firstCard.locator('a').first().click();

    // We left /browse for a detail route, and it renders a title heading.
    await expect(page).not.toHaveURL(/\/browse/);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 25000 });
  });
});
