/**
 * Playwright config for live-AI tests (MOCK_LLM=false).
 *
 * Run with:
 *   npx playwright test --config=e2e/playwright.live-ai.config.ts
 */
import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './tests',
  testMatch: 'live-ai-full-flow.spec.ts',
  timeout: 900000, // 15 minutes per test (real AI: ~50-60s per response including classifier timeout)
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
      name: 'live-ai-flow',
      testMatch: /live-ai-full-flow\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
  ],
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
        MOCK_LLM: 'false',
      },
    },
    {
      // --no-dev forces production-mode bundle. Dev-mode ships hundreds of
      // lazy module fetches that race the test's first interaction (the
      // compact bar) on slower hardware (CI, EC2). Production-mode is
      // deterministic — single bundle, single round-trip, then mounts.
      // Mirrors the single-user-journey fix in PR #192.
      command: 'cd ../mobile && EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web --port 8082 --no-dev',
      url: 'http://localhost:8082',
      reuseExistingServer: false,
      timeout: 300000,
    },
  ],
  globalSetup: require.resolve('./global-setup'),
  outputDir: 'test-results/',
});
