import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production setup: the client is built into
 * client/dist and served by the chat server itself on port 4000, so REST and
 * Socket.IO share one origin. The database must be seeded (`npm run db:seed`).
 * Set E2E_SKIP_SERVER=1 when the server is already running.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    process.env.E2E_SKIP_SERVER === '1'
      ? undefined
      : {
          command: 'npm start',
          cwd: '..',
          url: `${BASE_URL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
});
