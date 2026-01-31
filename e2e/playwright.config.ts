import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

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
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8082',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 375, height: 667 },
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--window-size=375,667'],
    },
  },
  webServer: [
    {
      command: `E2E_AUTH_BYPASS=true MOCK_LLM=true E2E_FIXTURES_PATH=${path.resolve(__dirname, 'fixtures')} npm run dev:api`,
      url: 'http://localhost:3002/health',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 60000,
    },
    {
      command: 'cd ../mobile && EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3002 npx expo start --web --port 8082',
      url: 'http://localhost:8082',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  // Global setup disabled - run migrations manually before tests if needed
  // globalSetup: require.resolve('./global-setup'),
  outputDir: 'test-results/',
});
