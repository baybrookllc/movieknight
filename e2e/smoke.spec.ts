import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/supabase-mock';

/**
 * Cheap always-on guard that the public routes boot and render without an
 * uncaught exception or a non-2xx/3xx response.
 */
test.describe('Public route smoke', () => {
  test('/login renders and does not crash', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));

    await mockSupabase(page);
    const resp = await page.goto('/login');

    expect(resp?.status()).toBeLessThan(400);
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    expect(crashes, crashes.join('\n')).toEqual([]);
  });

  test('/browse renders and does not crash', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));

    await mockSupabase(page);
    const resp = await page.goto('/browse');

    expect(resp?.status()).toBeLessThan(400);
    await expect(page.getByPlaceholder('Search for anything...').first()).toBeVisible();
    expect(crashes, crashes.join('\n')).toEqual([]);
  });
});
