/**
 * Sequential verification runner. Chained `pnpm &&` scripts re-invoke pnpm,
 * which is unavailable inside package-script shells on some Windows setups, so
 * each step is spawned here with plain node/resolved binaries instead.
 * Usage: node scripts/verify.mjs [extra-timeout-seconds]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const steps = [
  {
    name: 'typecheck',
    cmd: 'node',
    args: ['node_modules/typescript/bin/tsc', '-p', 'packages/domain'],
    then: true,
  },
  { name: 'typecheck-engine', cmd: 'node', args: ['node_modules/typescript/bin/tsc', '-p', 'packages/engine'] },
  { name: 'typecheck-fixtures', cmd: 'node', args: ['node_modules/typescript/bin/tsc', '-p', 'packages/fixtures'] },
  { name: 'typecheck-web', cmd: 'node', args: ['node_modules/typescript/bin/tsc', '-p', 'apps/web'] },
  {
    name: 'lint',
    cmd: 'node',
    args: ['node_modules/next/dist/bin/next', 'lint'],
    cwd: 'apps/web',
  },
  {
    name: 'unit tests',
    cmd: 'node',
    args: ['node_modules/vitest/vitest.mjs', 'run'],
  },
  { name: 'contrast check', cmd: 'node', args: ['scripts/check-contrast.ts'] },
  { name: 'PII scan', cmd: 'node', args: ['scripts/grep-pii.ts'] },
  { name: 'wording gate', cmd: 'node', args: ['scripts/check-wording.ts'] },
  {
    name: 'production build',
    cmd: 'node',
    args: ['scripts/run-capture.mjs'],
    cwd: root,
  },
  {
    name: 'bundle budget',
    cmd: 'node',
    args: ['scripts/check-bundles.mjs'],
  },
  {
    name: 'API timing budget',
    cmd: 'node',
    args: ['scripts/api-timing.ts'],
  },
  {
    name: 'e2e tests',
    cmd: 'node',
    args: ['node_modules/@playwright/test/cli.js', 'test'],
    cwd: 'apps/web',
  },
];

const only = process.argv.slice(2);
let failed = 0;
for (const step of steps) {
  if (only.length && !only.includes(step.name)) continue;
  const res = spawnSync(step.cmd, step.args, {
    cwd: step.cwd ?? root,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  if (res.status !== 0) {
    failed++;
    console.error(`\n✗ step failed: ${step.name}`);
    break;
  }
}
if (failed) process.exit(1);
console.log('\n✓ all verification steps passed');
