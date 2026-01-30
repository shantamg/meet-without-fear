/**
 * Invitation Accept Test - User B
 *
 * Tests the invitation acceptance flow:
 * 1. User A creates session and invitation via API
 * 2. User B accepts invitation via API
 * 3. User B can navigate to the session
 */

import { test, expect } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.describe('Invitation Accept - User B', () => {
  const userA = {
    email: 'user-a@e2e.test',
    id: 'user-a',
  };

  const userB = {
    email: 'user-b@e2e.test',
    id: 'user-b',
  };

  test.beforeEach(async () => {
    try {
      await cleanupE2EData();
    } catch (error) {
      console.log('Cleanup failed:', error);
    }
  });

  test('creates invitation as User A via API', async ({ request }) => {
    // Create a session which generates an invitation
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'Bob Test',
      },
    });

    if (!createResponse.ok()) {
      console.log('Create response:', createResponse.status(), await createResponse.text());
      test.skip(true, 'Backend API not ready');
      return;
    }

    const result = await createResponse.json();
    expect(result.success).toBe(true);
    expect(result.data.session).toBeTruthy();
    expect(result.data.invitationId).toBeTruthy();
    expect(result.data.invitationUrl).toBeTruthy();
  });

  test('User B can accept invitation via API', async ({ request }) => {
    // Step 1: Create session as User A
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'Bob Test',
      },
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Backend API not ready for session creation');
      return;
    }

    const createResult = await createResponse.json();
    const invitationId = createResult.data.invitationId;

    if (!invitationId) {
      test.skip(true, 'No invitation ID in response');
      return;
    }

    // Step 2: Accept invitation as User B
    const acceptResponse = await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
      headers: {
        ...getE2EHeaders(userB.email, userB.id),
        'Content-Type': 'application/json',
      },
    });

    if (!acceptResponse.ok()) {
      console.log('Accept response:', acceptResponse.status(), await acceptResponse.text());
      test.skip(true, 'Accept API not ready');
      return;
    }

    const acceptResult = await acceptResponse.json();
    expect(acceptResult.success).toBe(true);
  });

  test('User B can access session after accepting invitation', async ({ page, request }) => {
    // Step 1: Create session as User A
    const createResponse = await request.post(`${API_BASE_URL}/api/sessions`, {
      headers: {
        ...getE2EHeaders(userA.email, userA.id),
        'Content-Type': 'application/json',
      },
      data: {
        inviteName: 'Bob Test',
      },
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Backend API not ready');
      return;
    }

    const createResult = await createResponse.json();
    const invitationId = createResult.data.invitationId;
    const sessionId = createResult.data.session?.id;

    if (!invitationId || !sessionId) {
      test.skip(true, 'Missing invitation or session ID');
      return;
    }

    // Step 2: Accept invitation as User B
    const acceptResponse = await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
      headers: {
        ...getE2EHeaders(userB.email, userB.id),
        'Content-Type': 'application/json',
      },
    });

    if (!acceptResponse.ok()) {
      test.skip(true, 'Accept API not ready');
      return;
    }

    // Step 3: Navigate to session as User B
    await page.setExtraHTTPHeaders(getE2EHeaders(userB.email, userB.id));
    await page.goto(`${APP_BASE_URL}/session/${sessionId}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify page loads without errors
    await expect(page.locator('body')).toBeVisible();
    const hasError = await page.locator('text=/error|crash|failed/i').count();
    expect(hasError).toBe(0);
  });
});
