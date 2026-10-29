import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 3100;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

let serverProcess: ReturnType<typeof spawn> | null = null;

if (!(await isServerUp())) {
  console.log('Starting production server for API timing check...');
  const logFile = path.join(os.tmpdir(), 'next-timing.log');
  const logStream = fs.openSync(logFile, 'w');
  serverProcess = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    stdio: ['ignore', logStream, logStream],
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web'),
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isServerUp()) break;
  }
  if (!(await isServerUp())) {
    console.error(`--- server log (${logFile}) ---`);
    try {
      console.error(fs.readFileSync(logFile, 'utf8').slice(0, 2000));
    } catch {}
  }
}

if (!(await isServerUp())) {
  console.error('Failed to reach production server at port 3100');
  process.exit(1);
}

const endpoints = [
  '/api/health',
  '/api/rules',
  '/api/ledger',
  '/api/metrics',
];

// Case endpoints are exercised against a real id from the dataset.
const casesRes = await fetch(`http://127.0.0.1:${port}/api/cases`);
const casesPayload = (await casesRes.json()) as { items?: Array<{ id: string }> };
const caseId = casesPayload.items?.[0]?.id;
if (caseId) {
  for (const ep of [
    `/api/cases`,
    `/api/cases/${caseId}`,
    `/api/cases/${caseId}/documents`,
    `/api/cases/${caseId}/mismatches`,
    `/api/cases/${caseId}/checks`,
    `/api/cases/${caseId}/connections`,
    `/api/cases/${caseId}/report`,
  ]) {
    endpoints.push(ep);
  }
} else {
  console.error('No cases returned by /api/cases; case endpoints skipped (FAIL).');
  process.exit(1);
}

const BUDGET_P95_MS = 50;
let failed = false;

console.log(`Checking API timing budget (p95 <= ${BUDGET_P95_MS} ms)...`);

for (const ep of endpoints) {
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}${ep}`);
    await res.text();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p95 = Math.round(times[Math.floor(times.length * 0.95)] || times[times.length - 1]!);

  if (p95 > BUDGET_P95_MS) {
    console.error(`FAIL: ${ep} p95 = ${p95} ms (exceeds ${BUDGET_P95_MS} ms)`);
    failed = true;
  } else {
    console.log(`PASS: ${ep} p95 = ${p95} ms`);
  }
}

if (serverProcess) {
  serverProcess.kill();
}

if (failed) {
  console.error('API timing budget check failed.');
  process.exit(1);
} else {
  console.log('All API endpoints meet the p95 <= 50 ms budget.');
}
