import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/demo/reset', { headers: { 'x-eg-role': 'senior_reviewer' } });
  expect(response.ok()).toBeTruthy();
});

test.afterEach(async ({ request }) => {
  await request.post('/api/demo/reset', { headers: { 'x-eg-role': 'senior_reviewer' } });
});

test('queue, evidence, confidence gate, connector retries, and presenter reset work without browser errors', async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto('/queue');
  const queue = page.getByRole('grid');
  await expect(queue).toContainText('Vikramsheela Institute of Technology');
  await page.getByRole('link', { name: 'Vikramsheela Institute of Technology' }).click();
  await expect(page).toHaveURL(/\/applications\/EOA-2026-0142\/overview$/);

  await page.goto('/applications/EOA-2026-0142/evidence');
  await page.getByRole('tab', { name: 'Findings' }).click();
  await page.getByRole('button', { name: /View evidence/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Extracted Facts' })).toHaveAttribute('aria-selected', 'true');

  await page.goto('/applications/EOA-2026-0117/evidence?factKey=faculty.roster_count');
  const gate = page.getByRole('dialog');
  await expect(gate.getByRole('heading', { name: /Please confirm this reading/ })).toBeVisible();
  const beforeFactsResponse = await page.request.get('/api/applications/EOA-2026-0117/facts?key=faculty.roster_count');
  const beforeFacts = await beforeFactsResponse.json() as Array<{ id: string; supersededBy: string | null; source: string }>;
  const originalFact = beforeFacts.find((fact) => !fact.supersededBy);
  expect(originalFact).toBeTruthy();
  const correctionResponsePromise = page.waitForResponse((response) => response.url().includes('/facts/') && response.url().endsWith('/correct') && response.request().method() === 'POST');
  await gate.getByRole('button', { name: 'Confirm value' }).click();
  const correctionResponse = await correctionResponsePromise;
  expect(correctionResponse.ok()).toBeTruthy();
  const correctedFact = await correctionResponse.json() as { id: string; source: string; confidence: number };
  expect(correctedFact.source).toBe('human');
  expect(correctedFact.confidence).toBe(1);
  await expect(gate).toBeHidden();
  const afterFactsResponse = await page.request.get('/api/applications/EOA-2026-0117/facts?key=faculty.roster_count');
  const afterFacts = await afterFactsResponse.json() as Array<{ id: string; supersededBy: string | null; source: string }>;
  expect(afterFacts.find((fact) => fact.id === originalFact?.id)?.supersededBy).toBe(correctedFact.id);
  expect(afterFacts.some((fact) => fact.id === correctedFact.id && fact.source === 'human')).toBeTruthy();

  await page.goto('/applications/NEW-2026-0058/verification');
  await expect(page.getByText(/Retry history: 3 attempts/)).toBeVisible();
  await expect(page.getByText(/Circuit breaker: open/)).toBeVisible();
  await expect(page.getByText(/Manual verification request · queued/)).toBeVisible();

  await page.goto('/demo');
  const resetResponse = page.waitForResponse((response) => response.url().endsWith('/api/demo/reset') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  expect((await resetResponse).ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Demo Presenter View' })).toBeVisible();

  expect(browserErrors).toEqual([]);
});
