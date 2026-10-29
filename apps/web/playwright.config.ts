import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL lets the suite target a server on another port (e.g. when 3100 is busy).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const port = new URL(baseURL).port || '3100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      NEXT_DEV_DIST: '.next-dev',
    },
    url: `${baseURL}/demo`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
