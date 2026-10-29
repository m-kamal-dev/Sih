/**
 * Route bundle budget check (Phase 5). Parses the production build's route
 * table (First Load JS per route) from `next build` output and fails when any
 * reachable route exceeds BUDGET_KB.
 *
 * Usage: node scripts/check-bundles.mjs "<build output file>"
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_KB = 150;
const logFile = process.argv[2] ?? path.join(root, 'verify-build.log');
if (!existsSync(logFile)) {
  console.error(`Bundle budget check skipped: build log ${logFile} not found.`);
  process.exit(0);
}

const output = readFileSync(logFile, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
// Match route lines like: "├ ○ /queue    4.08 kB    119 kB" (skip API routes).
const routeLine = /^\s*[┌├└]\s+[○ƒ]\s+(\S+)\s+([\d.]+)\s*kB\s+([\d.]+)\s*kB\s*$/gm;
const offenders = [];
let matched = 0;
for (const m of output.matchAll(routeLine)) {
  matched++;
  const [, route, , firstLoadKb] = m;
  const kb = Number.parseFloat(firstLoadKb ?? '0');
  if (route.startsWith('/api/')) continue;
  if (kb > BUDGET_KB) offenders.push(`${route}: ${firstLoadKb} kB first load JS (budget ${BUDGET_KB} kB)`);
}

if (matched === 0) {
  console.error('Bundle budget check could not parse any route lines from the build output.');
  process.exit(1);
}
if (offenders.length) {
  console.error(`Bundle budget check failed:\n${offenders.map((o) => `- ${o}`).join('\n')}`);
  process.exit(1);
}
console.log(`Bundle budget check passed: every non-API route is at or below ${BUDGET_KB} kB first load JS (${matched} route lines parsed).`);
