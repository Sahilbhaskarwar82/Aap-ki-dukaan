import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration — Task SUJ-10
 *
 * Configured for the Aap-ki-dukaan / CoBuy AI hackathon demo verification:
 *   - Runs against the local Vite frontend on http://localhost:5173
 *   - Interacts authoritatively with the Express backend on http://localhost:8000
 *   - Enforces sequential execution (workers: 1) to preserve deterministic multi-shop scenario state
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
