/**
 * Playwright config for two-browser tests (MOCK_LLM=true, no global fixture ID).
 *
 * Key differences from main config:
 * - No E2E_FIXTURE_ID in webServer env (per-user fixtures via X-E2E-Fixture-ID header)
 * - MOCK_LLM=true for deterministic AI responses
 * - testMatch covers two-browser-*.spec.ts files
 *
 * Run with:
 *   cd e2e && npx playwright test --config=playwright.two-browser.config.ts
 */
import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './tests',
  testMatch: /two-browser-.*\.spec\.ts/,
  timeout: 900000, // 15 minutes per test (Stage 2 needs 13 AI interactions + reconciler)
  expect: {
    timeout: 15000, // 15s for Ably events and partner updates
  },
  fullyParallel: false, // Run tests sequentially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8082',
    screenshot: 'on',
    video: 'on',
    viewport: { width: 375, height: 667 },
    trace: 'on',
  },
  projects: [
    {
      name: 'two-browser',
      testMatch: /two-browser-.*\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
  ],
  // Web server configuration
  // CRITICAL: No E2E_FIXTURE_ID here - each user sets fixture via X-E2E-Fixture-ID header
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://localhost:3000/health',
      reuseExistingServer: false,
      cwd: '..',
      timeout: 60000,
      env: {
        ...process.env,
        E2E_AUTH_BYPASS: 'true',
        MOCK_LLM: 'true',
        // NO E2E_FIXTURE_ID - per-user fixtures via request headers
      },
    },
    {
      command: 'cd ../mobile && EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web --port 8082',
      url: 'http://localhost:8082',
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
  // Global setup: Clean database and run migrations before tests
  globalSetup: require.resolve('./global-setup'),
  outputDir: 'test-results/',
});
