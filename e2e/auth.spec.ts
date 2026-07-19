import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/supabase-mock';

test.describe('Authentication', () => {
  test('login page renders both fields and the submit button', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  });

  test('empty submit is blocked by HTML required validation', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Log In' }).click();
    // The required email field prevents submission — we never leave /login.
    await expect(page).toHaveURL(/\/login/);
    const emailValid = await page
      .locator('input[type="email"]')
      .evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(emailValid).toBe(false);
  });

  test('invalid credentials surface an error and stay on /login', async ({ page }) => {
    await mockSupabase(page, { auth: 'invalid' });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill('wrong@example.com');
    await page.locator('input[type="password"]').fill('badpassword');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('valid credentials redirect to /home', async ({ page }) => {
    await mockSupabase(page, { auth: 'success' });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill('e2e@example.com');
    await page.locator('input[type="password"]').fill('correct-password');
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForURL(/\/home/);
    await expect(page).toHaveURL(/\/home/);
  });

  test('signup page renders 3 fields with a 6-char password minimum', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    const pw = page.locator('input[type="password"]');
    await expect(pw).toBeVisible();
    await expect(pw).toHaveAttribute('minlength', '6');
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });
});
