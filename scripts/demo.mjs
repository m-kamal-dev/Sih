import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const port = 3100;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(' ')} exited with ${code}`)));
  });
}

await run(['build']);
const server = spawn(pnpm, ['start'], { stdio: 'inherit', shell: process.platform === 'win32' });
server.once('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/queue`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error(`Production server did not become ready on port ${port}`);

  const reset = await fetch(`http://127.0.0.1:${port}/api/demo/reset`, { method: 'POST', headers: { 'x-eg-role': 'senior_reviewer' } });
  if (!reset.ok) throw new Error(`Seed reset failed: HTTP ${reset.status}`);
  process.stdout.write(`Demo is ready at http://localhost:${port}; seed reset completed. Press Ctrl+C to stop.\n`);
} catch (error) {
  server.kill();
  throw error;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.kill(signal));
