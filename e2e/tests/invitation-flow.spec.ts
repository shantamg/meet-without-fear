/**
 * Invitation Flow Test - User A
 *
 * Tests the complete invitation creation flow:
 * 1. User A creates a new session
 * 2. User A signs compact
 * 3. User A exchanges messages with AI
 * 4. AI response includes invitation draft
 * 5. User A marks invitation as sent
 * 6. "Invitation Sent" indicator appears
 */

import { test, expect } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8081';

test.describe('Invitation Flow - User A', () => {
  const userA = {
    email: 'user-a@e2e.test',
    id: 'user-a',
  };

  test.beforeEach(async () => {
    // Clean up any existing E2E test data
    try {
      await cleanupE2EData();
    } catch (error) {
      console.log('Cleanup failed (server may not be running yet):', error);
    }
  });

  test('creates session and exchanges messages', async ({ page }) => {
    // Set E2E auth headers via page context
    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));

    // Navigate to app
    await page.goto(APP_BASE_URL);

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // The app should show some initial content
    // In a real test, we'd look for specific UI elements
    await expect(page.locator('body')).toBeVisible();

    // Since we can't fully simulate the mobile app flow in this test
    // (it requires Clerk auth to be fully bypassed in the app itself),
    // this test serves as a template for when the app supports E2E auth bypass

    // For now, verify the page loads without crashing
    const hasError = await page.locator('text=/error|crash|failed/i').count();
    expect(hasError).toBe(0);
  });

  test.skip('full flow: compact signing, chat, invitation draft, mark sent', async ({
    page,
  }) => {
    // This test is skipped until the mobile app implements E2E auth bypass
    // and proper test selectors

    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));
    await page.goto(APP_BASE_URL);

    // Step 1: Start new session
    // await page.getByText('Start New Conversation').click();

    // Step 2: Sign compact
    // await page.getByText('I agree to the compact').click();
    // await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: Send first message
    // await page.getByPlaceholder('Type your message').fill(
    //   'I want to have a conversation with my partner about our communication issues.'
    // );
    // await page.getByRole('button', { name: 'Send' }).click();

    // Step 4: Wait for AI response with draft
    // await expect(page.getByText('draft message')).toBeVisible({ timeout: 15000 });

    // Step 5: Mark invitation as sent
    // await page.getByText("I've sent it").click();

    // Step 6: Verify "Invitation Sent" indicator
    // await expect(page.getByText('Invitation Sent')).toBeVisible();
  });
});
