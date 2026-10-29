/**
 * One-command launcher (Windows-safe, no pnpm needed).
 *   node scripts/start.mjs          build if the code changed, start, open the browser
 *   node scripts/start.mjs --fresh  always rebuild first
 *   node scripts/start.mjs --dev    development server with live reload
 * Picks the first free port from 3100, waits until the app answers, then opens it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const nextBin = path.join(web, 'node_modules', 'next', 'dist', 'bin', 'next');
const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');

function fail(message) {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

const [major] = process.versions.node.split('.').map(Number);
if ((major ?? 0) < 20) fail(`Node ${process.versions.node} is too old. Install Node 20 or newer from https://nodejs.org`);
if (!existsSync(nextBin)) fail('Dependencies are missing (apps/web/node_modules was not found). Copy the full project folder including node_modules, or install dependencies with pnpm on a machine where it is allowed.');

/** Newest modification time of any source file the build depends on. */
function newestSource() {
  let newest = 0;
  const visit = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.next') || name === '.data') continue;
      const p = path.join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) visit(p);
      else newest = Math.max(newest, s.mtimeMs);
    }
  };
  for (const dir of ['apps/web/src', 'packages/domain/src', 'packages/engine/src', 'packages/fixtures/src', 'rules']) visit(path.join(root, dir));
  return newest;
}

function needsBuild() {
  if (args.has('--fresh')) return true;
  const buildId = path.join(web, '.next', 'BUILD_ID');
  return !existsSync(buildId) || statSync(buildId).mtimeMs < newestSource();
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    // No host: binds the same dual-stack (IPv6 + IPv4) address Next.js uses.
    server.listen(port);
  });
}

async function pickPort() {
  for (let port = 3100; port < 3120; port++) if (await portFree(port)) return port;
  fail('Ports 3100-3119 are all in use. Close other servers and try again.');
  return 0;
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

function openBrowser(url) {
  if (args.has('--no-open')) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
}

if (!dev && needsBuild()) {
  console.log('\n  > Building the app (about a minute, only when the code changed)...\n');
  const res = spawnSync(process.execPath, [nextBin, 'build'], { cwd: web, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (res.status !== 0) fail('The build failed. The error is shown above.');
}

const port = await pickPort();
const url = `http://localhost:${port}`;
console.log(`\n  > Starting EvidenceGraph (${dev ? 'development' : 'production'}) on ${url} ...`);
const child = spawn(process.execPath, [nextBin, dev ? 'dev' : 'start', '-p', String(port)], {
  cwd: web,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.stdout.on('data', (d) => process.stdout.write(d));
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));

if (await waitFor(`${url}/api/health`, dev ? 180_000 : 60_000)) {
  console.log(`\n  OK EvidenceGraph is running at ${url}\n    Press Ctrl+C in this window to stop it.\n`);
  openBrowser(url);
} else {
  console.error(`\n  x The server did not answer at ${url}. Check the messages above.\n`);
}
