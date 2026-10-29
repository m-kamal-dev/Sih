import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility sweep (Phase 7): an axe-core scan of every primary route for
 * serious and critical violations only. Zero tolerance on those levels -
 * moderate/minor findings are tracked separately, not blockers.
 */
const ROUTES = [
  '/queue',
  '/applications/EOA-2026-0117/overview',
  '/applications/EOA-2026-0117/evidence',
  '/applications/EOA-2026-0117/conflicts',
  '/applications/EOA-2026-0117/forensics',
  '/applications/EOA-2026-0117/verification',
  '/applications/EOA-2026-0117/graph',
  '/applications/EOA-2026-0117/pipeline',
  '/applications/EOA-2026-0117/decision',
  '/applications/EOA-2026-0117/letter',
  '/analyze',
  '/rules',
  '/ledger',
  '/metrics',
  '/self-check/INTK-2026-0229',
];

test.describe('axe sweep', () => {
  for (const route of ROUTES) {
    test(`no serious/critical axe violations: ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const offenders = results.violations
        .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
        .map((v) => `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${v.nodes[0]?.target?.join(' > ')}`);
      expect(offenders, `${route}\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
