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
      command: 'cd ../mobile && EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web --port 8082',
      url: 'http://localhost:8082',
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
  globalSetup: require.resolve('./global-setup'),
  outputDir: 'test-results/',
});
