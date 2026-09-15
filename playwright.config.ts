import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Ledger end-to-end smoke test.
 *
 * The server and client dev servers are started (against a temporary,
 * disposable SQLite database) and torn down by `scripts/e2e-runner.mjs`,
 * which is what `npm run e2e` invokes. This config assumes both are already
 * running by the time tests execute.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
