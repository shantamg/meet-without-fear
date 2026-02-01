import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Shared web server configurations
const webServers = (fixtureId: string) => [
  {
    command: 'npm run dev:api',
    url: 'http://localhost:3002/health',
    reuseExistingServer: !process.env.CI,
    cwd: '..',
    timeout: 60000,
    env: {
      ...process.env,
      E2E_AUTH_BYPASS: 'true',
      MOCK_LLM: 'true',
      E2E_FIXTURE_ID: fixtureId,
    },
  },
  {
    command: 'cd ../mobile && EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3002 npx expo start --web --port 8082',
    url: 'http://localhost:8082',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
];

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
  // Projects for different test scenarios
  projects: [
    {
      name: 'user-a-journey',
      testMatch: /single-user-journey\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'partner-journey',
      testMatch: /partner-journey\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'homepage',
      testMatch: /homepage\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'share-tab-rendering',
      testMatch: /share-tab-rendering\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    // Stage 2 Empathy: Reconciler tests
    {
      name: 'reconciler-gaps-accept',
      testMatch: /stage-2-empathy\/reconciler\/gaps-accept-share\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'reconciler-no-gaps',
      testMatch: /stage-2-empathy\/reconciler\/no-gaps-detected\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'reconciler-gaps-decline',
      testMatch: /stage-2-empathy\/reconciler\/gaps-decline-share\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
    {
      name: 'reconciler-gaps-refine',
      testMatch: /stage-2-empathy\/reconciler\/gaps-refine-share\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8082',
      },
    },
  ],
  // Web server configuration
  // Each test specifies its fixture via the X-E2E-Fixture-ID header.
  // The default fixture is used for tests that don't specify one.
  webServer: webServers(process.env.E2E_FIXTURE_ID || 'user-a-full-journey'),
  // Global setup disabled - run migrations manually before tests if needed
  // globalSetup: require.resolve('./global-setup'),
  outputDir: 'test-results/',
});
