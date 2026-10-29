import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke test over every route plus the Apply and Live Check flows. Fails on
 * any console error or warning (hydration warnings included), uncaught page
 * error, failed request, HTTP error response, or axe WCAG A/AA violation of
 * any impact. Cancelled navigations/prefetches (net::ERR_ABORTED) are not
 * failures: the browser aborts them by design when a page changes.
 */
const CASE = 'EOA-2026-0142';
const ROUTES = [
  '/', '/queue', '/apply', '/analyze', '/network', '/rules', '/ledger', '/metrics', '/demo', '/self-check/INTK-2026-0229',
  ...['overview', 'evidence', 'conflicts', 'forensics', 'verification', 'graph', 'pipeline', 'decision', 'letter'].map((t) => `/applications/${CASE}/${t}`),
];

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const err = r.failure()?.errorText ?? ''; if (!err.includes('ERR_ABORTED')) problems.push(`requestfailed: ${r.url()} ${err}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return problems;
}

async function axe(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map((v) => `axe ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target?.join(' ')}`);
}

test.describe('smoke', () => {
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      const problems = watch(page);
      const res = await page.goto(route, { waitUntil: 'networkidle' });
      expect(res?.status(), route).toBeLessThan(400);
      await expect(page.locator('h1, h2').first()).toBeVisible();
      problems.push(...(await axe(page)));
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('Live Check flow: a signed-then-edited sample raises a strong signal', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/analyze', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Signed, then edited/ }).click();
    await expect(page.getByRole('heading', { name: 'High attention' })).toBeVisible();
    await expect(page.getByText('Strong signal').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /What the AI read/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    problems.push(...(await axe(page)));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('Apply flow: form, multi-file upload, checklist and one summary', async ({ page, request }) => {
    const problems = watch(page);
    const files = await Promise.all(['clean-fire-noc', 'signed-then-modified'].map(async (name) => ({
      name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await (await request.get(`/api/forensics/samples/${name}`)).body()),
    })));
    await page.goto('/apply', { waitUntil: 'networkidle' });
    await page.getByLabel('Institution name').fill('Sample Institute of Technology');
    await page.getByLabel('AICTE ID').fill('1-0000000000');
    await expect(page.getByText(/APH reference: pending/).first()).toBeVisible();
    await page.getByLabel('Choose PDF files').setInputFiles(files);
    await expect(page.getByText('signed-then-modified.pdf').first()).toBeVisible();
    await page.getByRole('button', { name: 'Check my application' }).click();
    await expect(page.getByRole('heading', { name: /things to fix|Ready for an officer/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/How to fix:/).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    problems.push(...(await axe(page)));
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
