import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const roots = ['apps/web/src', 'packages/engine/src', 'packages/fixtures/src', 'rules/aph-2024-27'].map((path) => resolve(path));
const banned = /\b(forged|fake|fraud)\b/gi;
const excludedNames = new Set(['node_modules', '.next', 'coverage']);
const failures: string[] = [];

function visit(path: string): void {
  let stat;
  try { stat = statSync(path); } catch { return; }
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) if (!excludedNames.has(name)) visit(join(path, name));
    return;
  }
  if (/\.test\.[jt]sx?$/.test(path) || path.endsWith('wording.ts')) return;
  if (!/\.(?:ts|tsx|js|jsx|yaml|yml)$/.test(path)) return;
  const contents = readFileSync(path, 'utf8');
  banned.lastIndex = 0;
  for (const match of contents.matchAll(banned)) {
    const line = contents.slice(0, match.index).split('\n').length;
    failures.push(`${path}:${line}: banned user-visible wording`);
  }
}

for (const root of roots) visit(root);
if (failures.length) {
  process.stderr.write(`Wording check failed:\n${failures.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Wording check passed: no banned wording in UI, fixture, rule or report source.\n');
}
