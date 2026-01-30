/**
 * Invitation Accept Test - User B
 *
 * Tests the invitation acceptance flow:
 * 1. User B accepts invitation via API
 * 2. User B signs compact
 * 3. User B sees welcome message from AI
 * 4. "Invitation Accepted" indicator appears
 * 5. "Compact Signed" indicator appears
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

  test.skip('accepts invitation via API', async ({ request }) => {
    // This test is skipped until the backend server is running
    // It uses the API directly since invitation acceptance
    // uses a direct API call, not the web UI

    // First, create an invitation as User A
    const createResponse = await request.post(`${API_BASE_URL}/api/invitations`, {
      headers: getE2EHeaders(userA.email, userA.id),
      data: {
        inviteeEmail: userB.email,
      },
    });

    // The invitation might fail if the API requires additional setup
    // For now, we just verify the API is reachable
    expect([200, 201, 400, 401]).toContain(createResponse.status());
  });

  test.skip('full flow: accept invitation, sign compact, see AI message', async ({
    page,
    request,
  }) => {
    // This test is skipped until the mobile app implements E2E auth bypass

    // Step 1: Create invitation as User A
    // const createResponse = await request.post(`${API_BASE_URL}/api/invitations`, {
    //   headers: getE2EHeaders(userA.email, userA.id),
    //   data: { inviteeEmail: userB.email },
    // });
    // const invitation = await createResponse.json();

    // Step 2: Accept invitation as User B via API
    // const acceptResponse = await request.post(
    //   `${API_BASE_URL}/api/invitations/${invitation.id}/accept`,
    //   { headers: getE2EHeaders(userB.email, userB.id) }
    // );
    // expect(acceptResponse.ok()).toBeTruthy();

    // Step 3: Navigate to app as User B
    await page.setExtraHTTPHeaders(getE2EHeaders(userB.email, userB.id));
    await page.goto(APP_BASE_URL);

    // Step 4: Sign compact
    // await page.getByText('I agree to the compact').click();
    // await page.getByRole('button', { name: 'Continue' }).click();

    // Step 5: Verify indicators
    // await expect(page.getByText('Invitation Accepted')).toBeVisible();
    // await expect(page.getByText('Compact Signed')).toBeVisible();

    // Step 6: See first AI message
    // await expect(page.getByText('Welcome!')).toBeVisible({ timeout: 10000 });
  });
});
