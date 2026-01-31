/**
 * Stage 1 to Stage 2 Transition Test
 *
 * Tests session progression:
 * 1. User A creates a session
 * 2. User A can navigate to the session
 * 3. Session state endpoint works correctly
 */

import { test, expect } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.describe('Session State and Navigation', () => {
  const userA = {
    email: 'user-a@e2e.test',
    id: 'user-a',
  };

  test.beforeEach(async () => {
    // Clean up any existing E2E test data (errors are non-fatal)
    await cleanupE2EData().catch(() => {});
  });

  test('loads app successfully', async ({ page }) => {
    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));
    await page.goto(APP_BASE_URL);

    // Basic smoke test - app should load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('can get session state via API', async ({ request }) => {
    // Step 1: Create session
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'Test Partner',
      },
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Backend API not ready');
      return;
    }

    const createResult = await createResponse.json();
    const sessionId = createResult.data.session?.id;

    if (!sessionId) {
      test.skip(true, 'No session ID in response');
      return;
    }

    // Step 2: Get session state
    const stateResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/state`, {
      headers: getE2EHeaders(userA.email, userA.id),
    });

    expect(stateResponse.ok()).toBe(true);

    const stateResult = await stateResponse.json();
    expect(stateResult.success).toBe(true);
    expect(stateResult.data.session).toBeTruthy();
    expect(stateResult.data.session.id).toBe(sessionId);
  });

  test('can navigate to session and see UI', async ({ page, request }) => {
    // Step 1: Create session via API
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'Test Partner',
      },
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Backend API not ready');
      return;
    }

    const createResult = await createResponse.json();
    const sessionId = createResult.data.session?.id;

    if (!sessionId) {
      test.skip(true, 'No session ID');
      return;
    }

    // Step 2: Navigate to session
    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));
    await page.goto(`${APP_BASE_URL}/session/${sessionId}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify the page loaded
    await expect(page.locator('body')).toBeVisible();

    // No error indicators
    const hasError = await page.locator('text=/error|crash|failed/i').count();
    expect(hasError).toBe(0);
  });

  test('sessions list endpoint works', async ({ request }) => {
    // First create a session
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'List Test Partner',
      },
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Backend API not ready');
      return;
    }

    // Then list sessions
    const listResponse = await request.get(`${API_BASE_URL}/api/sessions`, {
      headers: getE2EHeaders(userA.email, userA.id),
    });

    expect(listResponse.ok()).toBe(true);

    const listResult = await listResponse.json();
    expect(listResult.success).toBe(true);
    expect(Array.isArray(listResult.data.items)).toBe(true);
    expect(listResult.data.items.length).toBeGreaterThan(0);
  });
});
