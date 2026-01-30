/**
 * Stage 1 to Stage 2 Transition Test
 *
 * Tests the witnessing completion and stage transition:
 * 1. User A exchanges messages through Stage 1 witnessing
 * 2. AI response includes FeelHeardCheck: Y flag
 * 3. "I feel heard" button appears
 * 4. User A clicks button
 * 5. Stage 1 marked complete
 * 6. Stage 2 begins with transition message
 */

import { test, expect } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.describe('Stage 1 to Stage 2 Transition', () => {
  const userA = {
    email: 'user-a@e2e.test',
    id: 'user-a',
  };

  test.beforeEach(async () => {
    try {
      await cleanupE2EData();
    } catch (error) {
      console.log('Cleanup failed:', error);
    }
  });

  test('loads app successfully', async ({ page }) => {
    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));
    await page.goto(APP_BASE_URL);

    // Basic smoke test - app should load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test.skip('full flow: witnessing to feel-heard to Stage 2', async ({ page }) => {
    // This test is skipped until the mobile app implements E2E auth bypass
    // and the full conversation flow can be automated

    await page.setExtraHTTPHeaders(getE2EHeaders(userA.email, userA.id));
    await page.goto(APP_BASE_URL);

    // Pre-requisites: User should already have a session in Stage 1
    // For a real test, we'd set this up via API

    // Step 1: Send messages through witnessing
    // await page.getByPlaceholder('Type your message').fill(
    //   "I feel like my partner never listens to me."
    // );
    // await page.getByRole('button', { name: 'Send' }).click();
    // await page.waitForTimeout(2000); // Wait for AI response

    // Step 2: Continue conversation until FeelHeardCheck: Y
    // (In mock mode, the fixture determines when this happens)

    // Step 3: Verify "I feel heard" button appears
    // await expect(page.getByRole('button', { name: /feel heard/i })).toBeVisible({
    //   timeout: 15000,
    // });

    // Step 4: Click "I feel heard" button
    // await page.getByRole('button', { name: /feel heard/i }).click();

    // Step 5: Verify Stage 1 completion indicator
    // await expect(page.getByText(/Stage 1 Complete/i)).toBeVisible();

    // Step 6: Verify Stage 2 transition message
    // await expect(
    //   page.getByText(/Now that you've had space to express/i)
    // ).toBeVisible({ timeout: 10000 });
  });
});
