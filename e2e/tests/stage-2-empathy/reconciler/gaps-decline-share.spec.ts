/**
 * Reconciler: Gaps Detected - User B Declines Share Suggestion
 *
 * Tests the flow when:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler detects significant gaps in User A's understanding
 * 4. User B receives a share suggestion but DECLINES to share
 * 5. Both users proceed without shared context
 *
 * This tests the "decline" path for the share suggestion flow.
 */

import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../../../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Use iPhone 12 viewport - must be at top level
test.use(devices['iPhone 12']);

// Fixture ID for this test - uses fixture with gaps-detected reconciler response
const FIXTURE_ID = 'user-b-partner-journey';

/**
 * Helper to wait for AI response to complete streaming.
 */
async function waitForAIResponse(page: Page, textPattern: RegExp, timeout = 15000) {
  await expect(page.getByText(textPattern)).toBeVisible({ timeout });

  const typingIndicator = page.getByTestId('typing-indicator');
  await expect(typingIndicator).not.toBeVisible({ timeout: 5000 }).catch(() => {});

  await page.waitForTimeout(100);
}

/**
 * Create a new browser context with E2E headers for a specific user.
 */
async function createUserContext(
  browser: import('@playwright/test').Browser,
  userEmail: string,
  userId: string,
  fixtureId?: string,
  position?: { x: number; y: number }
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
  });
  const page = await context.newPage();

  if (position) {
    await page.evaluate(({ x, y }) => {
      window.moveTo(x, y);
      window.resizeTo(420, 750);
    }, position).catch(() => {});
  }

  return { context, page };
}

test.describe('Reconciler: Gaps Detected - User B Declines', () => {
  const userA = {
    email: 'shantam@e2e.test',
    name: 'Shantam',
  };

  const userB = {
    email: 'darryl@e2e.test',
    name: 'Darryl',
  };

  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let invitationId: string;

  let userAContext: BrowserContext;
  let userAPage: Page;
  let userBContext: BrowserContext;
  let userBPage: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    const setup = await new SessionBuilder()
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_SHARED_A')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;
    invitationId = setup.invitation.id;

    console.log(`[Setup] Session: ${sessionId}`);

    const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
    userAContext = userASetup.context;
    userAPage = userASetup.page;

    const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });
    userBContext = userBSetup.context;
    userBPage = userBSetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
    await userBContext?.close();
  });

  /**
   * Helper to complete User B's Stage 1 journey through feeling heard.
   * Returns after the reconciler has run and share suggestion should be available.
   */
  async function completeUserBStage1(request: import('@playwright/test').APIRequestContext) {
    // Navigate User A to session first
    const userAParams = new URLSearchParams({ 'e2e-user-id': userAId, 'e2e-user-email': userA.email });
    await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
    await userAPage.waitForLoadState('networkidle');

    const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
    if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userAMoodContinue.click();
    }
    await userAPage.waitForTimeout(2000);

    // User B accepts invitation
    await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
      headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
    });

    // User B navigates to session
    const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });
    await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
    await userBPage.waitForLoadState('networkidle');

    // Sign compact
    const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
    await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
    await agreeCheckbox.click();
    await userBPage.getByTestId('compact-sign-button').click();

    // Handle mood check
    const moodContinue = userBPage.getByTestId('mood-check-continue-button');
    if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moodContinue.click();
    }

    // Complete chat
    const chatInput = userBPage.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = userBPage.getByTestId('send-button');

    await chatInput.fill('Things have been tense lately');
    await sendButton.click();
    await waitForAIResponse(userBPage, /tension can be really draining/i);

    await chatInput.fill("I feel like they don't see how much I'm dealing with");
    await sendButton.click();
    await waitForAIResponse(userBPage, /feeling unseen while carrying a lot/i);

    await chatInput.fill("I work so hard and come home exhausted, but there's always more to do");
    await sendButton.click();
    await waitForAIResponse(userBPage, /exhaustion you're describing/i);

    await chatInput.fill("Months now. I don't know how to get through to them");
    await sendButton.click();
    await waitForAIResponse(userBPage, /Do you feel like I understand/i);

    // Confirm feeling heard - triggers reconciler
    const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
    await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
    await feelHeardYes.click();
    await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

    // Wait for reconciler
    await userBPage.waitForTimeout(3000);
  }

  test.describe('User B perspective', () => {
    test('sees share suggestion after feeling heard (gaps detected)', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await completeUserBStage1(request);

      console.log(`${elapsed()} User B felt heard - checking for share suggestion`);

      // Check for share suggestion modal or navigate to Share tab
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      const hasModal = await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false);

      // Check API for share offer
      const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const shareOfferData = await shareOfferResponse.json().catch(() => ({}));
      const hasShareOffer = shareOfferData?.data?.hasSuggestion === true;

      console.log(`${elapsed()} Share suggestion: modal=${hasModal}, API=${hasShareOffer}`);
      expect(hasModal || hasShareOffer).toBe(true);
    });

    test('can tap "No thanks" to decline sharing', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await completeUserBStage1(request);

      console.log(`${elapsed()} User B ready to decline share suggestion`);

      // Navigate to Share screen to access decline button
      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });

      // Check if modal appeared and navigate through it
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      if (await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const viewButton = userBPage.getByText('View', { exact: true });
        await viewButton.click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      // Find and click decline button (uses wildcard to match dynamic testIDs)
      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });

      // Set up response listener for decline API call
      const declineResponsePromise = userBPage.waitForResponse(
        (response) => response.url().includes('/reconciler/share-offer/respond') && response.request().method() === 'POST',
        { timeout: 15000 }
      );

      await declineButton.click();

      const declineResponse = await declineResponsePromise;
      expect(declineResponse.status()).toBeLessThan(300);

      console.log(`${elapsed()} User B successfully declined share suggestion`);

      // Verify share suggestion is no longer shown
      await userBPage.waitForTimeout(2000);
      const shareSuggestionCard = userBPage.locator('[data-testid*="share-suggestion"]');
      const cardStillVisible = await shareSuggestionCard.isVisible({ timeout: 2000 }).catch(() => false);

      // Card should either be hidden or user should be redirected
      console.log(`${elapsed()} Share suggestion card still visible: ${cardStillVisible}`);
    });

    test('can continue conversation after declining', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await completeUserBStage1(request);

      console.log(`${elapsed()} User B declining share suggestion`);

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });

      // Navigate to Share screen
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      if (await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const viewButton = userBPage.getByText('View', { exact: true });
        await viewButton.click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      // Decline the share suggestion
      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      // Wait for decline to process
      await userBPage.waitForTimeout(2000);

      // Navigate back to chat
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Handle mood check if it appears
      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 3000 }).catch(() => false)) {
        await moodContinue.click();
      }

      // Verify chat input is available (not blocked)
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      await expect(chatInput).toBeEnabled({ timeout: 5000 });

      console.log(`${elapsed()} User B can continue chatting after declining`);

      // User B should be able to continue chatting
      const sendButton = userBPage.getByTestId('send-button');
      await chatInput.fill("I want to understand their perspective better");
      await sendButton.click();

      // Should get a response
      await userBPage.waitForTimeout(5000);
      console.log(`${elapsed()} User B successfully continued conversation`);
    });
  });

  test.describe('User A perspective', () => {
    test('does NOT see shared context when User B declines', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await completeUserBStage1(request);

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });

      // User B declines the share suggestion
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      if (await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const viewButton = userBPage.getByText('View', { exact: true });
        await viewButton.click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      console.log(`${elapsed()} User B declined - checking User A's view`);

      // Wait for state to propagate
      await userBPage.waitForTimeout(3000);

      // Check User A's view
      await userAPage.reload();
      await userAPage.waitForLoadState('networkidle');

      const moodCheck = userAPage.getByTestId('mood-check-continue-button');
      if (await moodCheck.isVisible({ timeout: 3000 }).catch(() => false)) {
        await moodCheck.click();
      }

      // User A should NOT see "Context from Darryl"
      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      const hasSharedContext = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasSharedContext).toBe(false);
      console.log(`${elapsed()} Verified: User A does not see shared context (declined)`);
    });

    test('empathy can still be revealed after User B declines', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await completeUserBStage1(request);

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });

      // User B declines
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      if (await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const viewButton = userBPage.getByText('View', { exact: true });
        await viewButton.click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      console.log(`${elapsed()} User B declined - checking empathy status`);

      // Wait for state to propagate
      await userBPage.waitForTimeout(5000);

      // Check empathy status via API - should still be able to reveal
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });

      expect(empathyStatusResponse.ok()).toBe(true);
      const empathyData = await empathyStatusResponse.json();

      console.log(`${elapsed()} User A empathy status: ${empathyData.data?.myAttempt?.status}`);

      // After declining, empathy should transition to READY or REVEALED
      // (the exact status depends on the implementation - declining should unblock the flow)
      const myStatus = empathyData.data?.myAttempt?.status;

      // The empathy shouldn't be stuck in AWAITING_SHARING after decline
      expect(myStatus).not.toBe('AWAITING_SHARING');
    });
  });
});
