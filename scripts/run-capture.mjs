/**
 * Runs the production build from apps/web while CAPTURING its output, so the
 * bundle budget checker can parse the route table afterwards. The log lands in
 * verify-build.log at the repo root (gitignored).
 */
import { spawnSync } from 'node:child_process';
import { openSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logPath = path.join(root, 'verify-build.log');
const out = openSync(logPath, 'w');
const res = spawnSync('node', ['node_modules/next/dist/bin/next', 'build'], {
  cwd: path.join(root, 'apps/web'),
  stdio: ['ignore', out, out],
  env: { ...process.env, FORCE_COLOR: '0' },
});
if (res.status !== 0) {
  console.error(readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n'));
  process.exit(res.status ?? 1);
}
if (!existsSync(logPath)) process.exit(0);
// Echo the route table tail so callers see summary inline, keep log for check-bundles.
const text = readFileSync(logPath, 'utf8');
const tail = text.split('\n').filter(Boolean);
console.log(tail.slice(-8).join('\n'));
