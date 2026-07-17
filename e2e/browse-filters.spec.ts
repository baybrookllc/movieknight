import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/supabase-mock';

/**
 * Regression guards for browse-filter behaviour:
 *  1. The Platform filter is now wired up and must render. It was originally
 *     removed in v6.6 because its RPC filtered against an unwritten table (always
 *     zero results); the streaming-platform sync (title_streaming_platforms
 *     trigger + backfill) now populates that table, so the filter is functional.
 *  2. The "Clear all" button had an operator-precedence bug that both hid it
 *     when it should show and leaked a truthy string. Its visibility must track
 *     active-filter state exactly.
 * The underlying pure logic is unit-tested in lib/browse-filters.test.ts; these
 * assert the wired-up UI behaviour end-to-end.
 */
test.describe('Browse filters (regression guards)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/browse', { waitUntil: 'domcontentloaded' });
    // Filter bar has rendered (dropdown buttons carry a ▾ caret).
    await expect(page.getByRole('button', { name: /Format/ })).toBeVisible();
  });

  test('the Platform filter is rendered', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Platform/i })).toHaveCount(1);
  });

  test('"Clear all" appears only when a filter is active, then resets it', async ({ page }) => {
    const clearAll = page.getByRole('button', { name: /Clear all/i });

    // (1) No active filters → button absent.
    await expect(clearAll).toHaveCount(0);

    // (2) Set a string filter (Format → Movies) — the exact truthy-string case
    //     the precedence bug mishandled.
    await page.getByRole('button', { name: /^Format/ }).click();
    await page.getByRole('button', { name: 'Movies', exact: true }).click();
    await expect(clearAll).toBeVisible();
    // Scope to the dropdown button ("Format: Movies ▾") — the active-filter chip
    // adds a "Remove Format: Movies filter" button that also matches /Format: Movies/.
    await expect(page.getByRole('button', { name: /^Format: Movies/ })).toBeVisible();

    // (3) Clear all → filters reset, button gone.
    await clearAll.click();
    await expect(clearAll).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Format: Movies/ })).toHaveCount(0);
  });
});
