import { expect, test } from '@playwright/test';

test('presenter beat navigates and fixture data can be reset', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Demo Presenter View' })).toBeVisible();

  await page.getByRole('link', { name: /0:45/ }).click();
  await expect(page).toHaveURL(/\/self-check\/INTK-2026-0229$/);

  await page.goto('/demo');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page).toHaveURL(/\/demo$/);
});
