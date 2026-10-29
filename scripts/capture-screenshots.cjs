/**
 * Screenshot capture (Phase 7): headless Chromium at 1440x900, light + dark,
 * one shot per key route. Saved to docs/screenshots/. Run after a production
 * server is up (node apps/web/node_modules/next/dist/bin/next start -p 3101).
 */
const pw = require.resolve('@playwright/test', { paths: ['./apps/web/node_modules/@playwright/test'] });
const { chromium } = require(require.resolve('playwright-core', { paths: [pw, './apps/web'] }));

const BASE = 'http://127.0.0.1:3101';
const ROUTES = [
  ['queue', '/queue'],
  ['workspace-overview', '/applications/EOA-2026-0117/overview'],
  ['workspace-evidence', '/applications/EOA-2026-0142/evidence'],
  ['workspace-conflicts', '/applications/EOA-2026-0117/conflicts'],
  ['workspace-graph', '/applications/INTK-2026-0208/graph'],
  ['workspace-verification', '/applications/NEW-2026-0058/verification'],
  ['workspace-decision', '/applications/EOA-2026-0117/decision'],
  ['rules', '/rules'],
  ['ledger', '/ledger'],
  ['metrics', '/metrics'],
  ['self-check', '/self-check/INTK-2026-0229'],
  ['demo', '/demo'],
];

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((t) => window.localStorage.setItem('eg-theme', t), theme);
    const page = await context.newPage();
    for (const [name, route] of ROUTES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `docs/screenshots/${name}-${theme}.png` });
        console.log(`saved ${name}-${theme}.png`);
      } catch (err) {
        failed++;
        console.error(`FAILED ${name}-${theme}: ${err.message.split('\n')[0]}`);
      }
    }
    await context.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'all screenshots saved');
  process.exit(failed ? 1 : 0);
})();
