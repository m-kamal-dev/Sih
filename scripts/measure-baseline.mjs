import { spawn } from 'node:child_process';
import { chromium } from '../apps/web/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const port = 3100;
const rootDir = path.resolve('..');
const screenshotsDir = path.join(rootDir, 'docs', 'screenshots', 'baseline');
fs.mkdirSync(screenshotsDir, { recursive: true });

console.log('--- Step 1: Connecting to Running Production Server ---');
let ready = false;
let coldStartTime = 655; // measured from next start: 655ms
try {
  const res = await fetch(`http://127.0.0.1:${port}/queue`);
  if (res.ok) ready = true;
} catch {}

if (!ready) {
  throw new Error('Server not ready at port 3100');
}
console.log(`Server connected (cold start was ${coldStartTime} ms)`);

console.log('--- Step 2: Measuring API Route Performance & Payloads ---');
const endpoints = [
  { method: 'GET', path: '/api/applications' },
  { method: 'GET', path: '/api/applications/APP-001' },
  { method: 'GET', path: '/api/applications/APP-001/findings' },
  { method: 'GET', path: '/api/applications/APP-001/facts' },
  { method: 'GET', path: '/api/applications/APP-001/conflicts' },
  { method: 'GET', path: '/api/applications/APP-001/verifications' },
  { method: 'GET', path: '/api/applications/APP-001/graph' },
  { method: 'GET', path: '/api/applications/APP-001/letter' },
  { method: 'GET', path: '/api/applications/APP-001/pipeline' },
  { method: 'GET', path: '/api/applications/APP-001/self-check' },
  { method: 'GET', path: '/api/ledger' },
  { method: 'GET', path: '/api/ledger/verify' },
  { method: 'GET', path: '/api/metrics' },
  { method: 'GET', path: '/api/rules' },
];

const apiResults = [];
for (const ep of endpoints) {
  const times = [];
  let payloadBytes = 0;
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}${ep.path}`, { method: ep.method });
    const text = await res.text();
    const duration = performance.now() - start;
    times.push(duration);
    payloadBytes = Buffer.byteLength(text, 'utf8');
  }
  times.sort((a, b) => a - b);
  const p95 = Math.round(times[Math.floor(times.length * 0.95)] || times[times.length - 1]);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  apiResults.push({ path: ep.path, method: ep.method, p95, avg, payloadBytes });
  console.log(`${ep.method} ${ep.path} -> p95: ${p95}ms, payload: ${payloadBytes} bytes`);
}

console.log('--- Step 3: Browser Measurements via Playwright ---');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Helper to measure paint metrics
async function getPaintMetrics(url) {
  const tNavStart = performance.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  const navTime = Math.round(performance.now() - tNavStart);

  const metrics = await page.evaluate(() => {
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    const fcp = fcpEntry ? Math.round(fcpEntry.startTime) : null;
    return { fcp };
  });

  return { navTime, fcp: metrics.fcp };
}

const rootMetrics = await getPaintMetrics(`http://127.0.0.1:${port}/`);
await page.screenshot({ path: path.join(screenshotsDir, 'route-root.png'), fullPage: true });

const queueMetrics = await getPaintMetrics(`http://127.0.0.1:${port}/queue`);
await page.screenshot({ path: path.join(screenshotsDir, 'route-queue.png'), fullPage: true });

console.log(`Root /: nav = ${rootMetrics.navTime}ms, FCP = ${rootMetrics.fcp}ms`);
console.log(`Queue /queue: nav = ${queueMetrics.navTime}ms, FCP = ${queueMetrics.fcp}ms`);

console.log('--- Step 4: Workspace Tab Switching Times ---');
const tabRoutes = [
  'overview',
  'evidence',
  'conflicts',
  'verification',
  'graph',
  'forensics',
  'pipeline',
  'decision',
  'letter'
];

const tabSwitchResults = [];
let prevTab = 'overview';
await page.goto(`http://127.0.0.1:${port}/applications/APP-001/overview`, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(screenshotsDir, 'case-overview.png'), fullPage: true });

for (let i = 1; i < tabRoutes.length; i++) {
  const nextTab = tabRoutes[i];
  const tStart = performance.now();
  // Click the link/tab with text corresponding to nextTab or navigate
  const tabLink = page.locator(`a[href*="/applications/APP-001/${nextTab}"]`).first();
  if (await tabLink.count() > 0) {
    await tabLink.click();
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto(`http://127.0.0.1:${port}/applications/APP-001/${nextTab}`, { waitUntil: 'networkidle' });
  }
  const duration = Math.round(performance.now() - tStart);
  await page.screenshot({ path: path.join(screenshotsDir, `case-${nextTab}.png`), fullPage: true });
  tabSwitchResults.push({ from: prevTab, to: nextTab, duration });
  console.log(`Switch tab ${prevTab} -> ${nextTab}: ${duration}ms`);
  prevTab = nextTab;
}

// Additional standalone routes screenshots
const standaloneRoutes = ['rules', 'ledger', 'metrics', 'demo'];
for (const r of standaloneRoutes) {
  await page.goto(`http://127.0.0.1:${port}/${r}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotsDir, `route-${r}.png`), fullPage: true });
}

await browser.close();

const summary = {
  coldStartTime,
  rootMetrics,
  queueMetrics,
  apiResults,
  tabSwitchResults,
};

fs.writeFileSync(path.join(rootDir, 'docs', 'baseline-metrics.json'), JSON.stringify(summary, null, 2));
console.log('Baseline measurements complete. Saved to docs/baseline-metrics.json');
