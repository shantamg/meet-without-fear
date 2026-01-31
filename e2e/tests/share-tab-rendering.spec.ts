/**
 * Share Tab Rendering Test
 *
 * Tests that the Share tab renders correctly when loading from database.
 * Seeds a session at CONTEXT_SHARED_B stage (User B has shared context)
 * and verifies:
 * 1. No duplicate messages (the bug we fixed)
 * 2. Shared content shows with correct delivery status
 * 3. Share suggestion is NOT shown (since content was already shared)
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { SessionBuilder, SessionSetupResult } from '../helpers/session-builder';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'render-test-shantam@e2e.test', name: 'Shantam' };
const userB = { email: 'render-test-darryl@e2e.test', name: 'Darryl' };

/**
 * Helper to set up page with E2E auth headers
 */
async function setupAuthenticatedPage(
  context: BrowserContext,
  sessionSetup: SessionSetupResult,
  user: 'A' | 'B'
): Promise<Page> {
  const page = await context.newPage();

  // Get the appropriate user info
  const userInfo = user === 'A' ? sessionSetup.userA : sessionSetup.userB;
  if (!userInfo) {
    throw new Error(`User ${user} not found in session setup`);
  }

  // Navigate to the session with E2E auth params
  const url = `${APP_BASE_URL}/session/${sessionSetup.session.id}?e2e-user-id=${userInfo.id}&e2e-user-email=${encodeURIComponent(userInfo.email)}`;
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  return page;
}

test.describe('Share Tab Rendering (from database)', () => {
  let setup: SessionSetupResult;

  test.beforeAll(async ({ request }) => {
    // Seed the session at CONTEXT_SHARED_B stage
    // This creates a session where User B has already shared context
    const builder = new SessionBuilder(API_BASE_URL);
    setup = await builder
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('CONTEXT_SHARED_B')
      .setup(request);

    console.log('[Setup] Session:', setup.session.id);
    console.log('[Setup] User A:', setup.userA.id);
    console.log('[Setup] User B:', setup.userB?.id);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup E2E test data
    await request.post(`${API_BASE_URL}/api/e2e/cleanup`);
  });

  test('User B sees shared context correctly without duplicates', async ({ browser }) => {
    // Create a fresh browser context for User B
    const context = await browser.newContext();
    const page = await setupAuthenticatedPage(context, setup, 'B');

    // Handle mood check if present
    const moodContinue = page.getByTestId('mood-check-continue-button');
    const hasMoodCheck = await moodContinue.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheck) {
      await moodContinue.click();
      await page.waitForLoadState('networkidle');
    }

    // Navigate to Share tab by clicking "Go to share" button
    const goToShareButton = page.getByRole('button', { name: /share/i });
    await expect(goToShareButton).toBeVisible({ timeout: 5000 });
    await goToShareButton.click();

    // Wait for Share screen to load
    await page.waitForURL(/\/share$/);
    await page.waitForLoadState('networkidle');

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/share-tab-user-b-view.png' });

    // Verify the shared content is visible (matches text from seeded state)
    const contentCards = page.locator('text=/running on empty/i');
    const cardCount = await contentCards.count();

    console.log(`[Test] Found ${cardCount} cards with shared content text`);

    // THE KEY ASSERTION: There should only be ONE card with the shared content
    // Before the fix, this was showing 2 (one "Delivered", one "Not delivered yet")
    expect(cardCount).toBe(1);

    // Verify the card shows "Delivered" status (not "Not delivered yet")
    const deliveredStatus = page.getByText('Delivered', { exact: true });
    await expect(deliveredStatus).toBeVisible();

    // Verify "Not delivered yet" is NOT shown (the duplicate bug)
    const notDeliveredStatus = page.getByText('Not delivered yet', { exact: true });
    await expect(notDeliveredStatus).not.toBeVisible();

    // Verify the share suggestion card is NOT shown (since content was already shared)
    const shareSuggestionCard = page.locator('[data-testid*="share-suggestion"]');
    const suggestionVisible = await shareSuggestionCard.isVisible().catch(() => false);
    expect(suggestionVisible).toBe(false);

    // Verify the "You shared this" attribution is shown (within the share tab, not main chat)
    const shareTabContainer = page.getByTestId('share-screen-partner-tab');
    const sharedAttribution = shareTabContainer.getByText(/You shared this/i);
    await expect(sharedAttribution).toBeVisible();

    await context.close();
  });

  test('User A sees received context correctly', async ({ browser }) => {
    // Create a fresh browser context for User A
    const context = await browser.newContext();
    const page = await setupAuthenticatedPage(context, setup, 'A');

    // Handle mood check if present
    const moodContinue = page.getByTestId('mood-check-continue-button');
    const hasMoodCheck = await moodContinue.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheck) {
      await moodContinue.click();
      await page.waitForLoadState('networkidle');
    }

    // Navigate to Share tab
    const goToShareButton = page.getByRole('button', { name: /share/i });
    await expect(goToShareButton).toBeVisible({ timeout: 5000 });
    await goToShareButton.click();

    // Wait for Share screen to load
    await page.waitForURL(/\/share$/);
    await page.waitForLoadState('networkidle');

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/share-tab-user-a-view.png' });

    // User A should see the received context from Darryl (within the share tab)
    const shareTabContainer = page.getByTestId('share-screen-partner-tab');
    const receivedContext = shareTabContainer.getByText(/running on empty/i);
    await expect(receivedContext).toBeVisible();

    // User A should also see their own empathy statement (be specific to avoid matching chat messages)
    const myEmpathy = shareTabContainer.getByText(/I understand you might be feeling/i);
    await expect(myEmpathy).toBeVisible();

    await context.close();
  });

  test('Share tab loads correctly after page refresh', async ({ browser }) => {
    // Create a fresh browser context for User B
    const context = await browser.newContext();

    // Get User B info
    const userInfo = setup.userB!;

    // Navigate directly to the share page with auth params (simulating a direct load from URL)
    const page = await context.newPage();
    const shareUrl = `${APP_BASE_URL}/session/${setup.session.id}/share?e2e-user-id=${userInfo.id}&e2e-user-email=${encodeURIComponent(userInfo.email)}`;
    await page.goto(shareUrl);
    await page.waitForLoadState('networkidle');

    // Handle mood check if present
    const moodContinue = page.getByTestId('mood-check-continue-button');
    const hasMoodCheck = await moodContinue.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheck) {
      await moodContinue.click();
      await page.waitForLoadState('networkidle');
    }

    // Take first screenshot
    await page.screenshot({ path: 'test-results/share-tab-direct-load.png' });

    // Verify the share tab loaded with content (this tests loading from database)
    const shareTabContainer = page.getByTestId('share-screen-partner-tab');
    await expect(shareTabContainer).toBeVisible({ timeout: 10000 });

    // Verify only ONE card with shared content
    const contentCards = shareTabContainer.locator('text=/running on empty/i');
    const cardCount = await contentCards.count();
    console.log(`[Test] Direct load to share page, found ${cardCount} cards with shared content text`);
    expect(cardCount).toBe(1);

    // Verify a delivery status is shown (could be "Delivered" or "Seen" depending on test order)
    // Status updates when partner views the content
    const deliveryStatus = shareTabContainer.getByText(/Delivered|Seen/);
    await expect(deliveryStatus).toBeVisible();

    await context.close();
  });
});
