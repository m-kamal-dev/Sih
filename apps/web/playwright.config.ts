import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100',
    env: {
      ...process.env,
      NEXT_DEV_DIST: '.next-dev',
    },
    url: 'http://localhost:3100/demo',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
