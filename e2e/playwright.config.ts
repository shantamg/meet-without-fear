import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000, // 10s for Ably events
  },
  fullyParallel: false, // Run tests sequentially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8081',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 375, height: 667 },
    trace: 'on-first-retry',
  },
});
