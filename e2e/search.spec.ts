import { test, expect, type Page, type Locator } from '@playwright/test';
import { mockSupabase, type SearchResultFixture } from './support/supabase-mock';

const RESULTS: SearchResultFixture[] = [
  { id: 'movie:603', title: 'The Matrix', media_type: 'movie', release_date: '1999-03-31', vote_average: 8.2, poster_path: null },
  { id: 'movie:604', title: 'The Matrix Reloaded', media_type: 'movie', release_date: '2003-05-15', vote_average: 7.0, poster_path: null },
];

/**
 * The SearchOverlay is a `dynamic()` import, so its Ctrl+K keydown listener
 * attaches a beat after hydration. Retry the shortcut until the dialog appears.
 */
async function openSearch(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  return dialog;
}

test.describe('Global search overlay', () => {
  test('opens on Ctrl+K, renders results, "See all" routes to /browse', async ({ page }) => {
    await mockSupabase(page, { searchResults: RESULTS });
    await page.goto('/browse', { waitUntil: 'domcontentloaded' });

    const dialog = await openSearch(page);

    await dialog.getByPlaceholder('Search for anything...').fill('matrix');
    await expect(dialog.getByRole('button', { name: /The Matrix/ }).first()).toBeVisible();

    await dialog.getByRole('button', { name: /SEE ALL RESULTS/i }).click();
    await page.waitForURL(/\/browse\?q=matrix/);
    await expect(page).toHaveURL(/\/browse\?q=matrix/);
  });

  test('pressing Enter routes to /browse?q=', async ({ page }) => {
    await mockSupabase(page, { searchResults: [] });
    await page.goto('/browse', { waitUntil: 'domcontentloaded' });

    const dialog = await openSearch(page);

    const input = dialog.getByPlaceholder('Search for anything...');
    await input.fill('inception');
    await input.press('Enter');
    await page.waitForURL(/\/browse\?q=inception/);
  });
});
