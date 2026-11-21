import { defineConfig, devices } from '@playwright/test';

/**
 * E2E journeys run against a live stack (web + API + Postgres + Redis), e.g. `docker compose up` or the
 * dev servers. The database must contain the reference seed and a platform admin (see README).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    // Staging stacks with self-signed certificates.
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS === 'true',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
