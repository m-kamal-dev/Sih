import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const roots = [
  'packages/domain/src',
  'packages/engine/src',
  'packages/fixtures/src',
  'apps/web/src',
  'apps/web/.next',
].map((path) => resolve(path));
const excluded = new Set(['node_modules', '.git', 'cache', 'coverage', 'vendor-chunks']);
const allowedExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html', '.map']);
const aadhaarLike = /(?<!\d)\d{12}(?!\d)/g;
const panLike = /(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/gi;
const findings: string[] = [];

function visit(path: string): void {
  let stat;
  try { stat = statSync(path); } catch { return; }
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) if (!excluded.has(name)) visit(join(path, name));
    return;
  }
  if (!allowedExt.has(path.slice(path.lastIndexOf('.')).toLowerCase())) return;
  const contents = readFileSync(path, 'utf8');
  for (const [pattern, label] of [[aadhaarLike, '12-digit sequence'], [panLike, 'PAN-shaped identifier']] as const) {
    pattern.lastIndex = 0;
    for (const match of contents.matchAll(pattern)) {
      const line = contents.slice(0, match.index).split('\n').length;
      findings.push(`${path}:${line}: ${label}`);
    }
  }
}

for (const root of roots) visit(root);
if (findings.length) {
  process.stderr.write(`PII scan failed:\n${findings.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('PII scan passed: no 12-digit sequences or raw PAN-shaped identifiers in source or application build output (third-party vendor bundles excluded).\n');
}
