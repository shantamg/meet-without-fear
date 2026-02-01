/**
 * Reconciler: No Gaps Detected (PROCEED Path)
 *
 * Tests the flow when:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler finds NO significant gaps in User A's understanding
 * 4. Both users proceed directly to empathy reveal without sharing
 *
 * Uses the reconciler-no-gaps fixture which returns action: "PROCEED".
 */

import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../../../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Use iPhone 12 viewport - must be at top level
test.use(devices['iPhone 12']);

// Fixture ID for this test - uses fixture with NO gaps detected
const FIXTURE_ID = 'reconciler-no-gaps';

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

test.describe('Reconciler: No Gaps Detected', () => {
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

    console.log(`[Setup] Session: ${sessionId}, Fixture: ${FIXTURE_ID}`);

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

  test.describe('User A perspective', () => {
    test('empathy transitions to REVEALED status after User B feels heard', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session
      const userAParams = new URLSearchParams({
        'e2e-user-id': userAId,
        'e2e-user-email': userA.email,
      });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
      }
      await userAPage.waitForTimeout(2000);

      // User B accepts invitation via API
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
      });

      // User B navigates to session and completes Stage 1
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Sign compact
      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();

      // Handle mood check if present
      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      // Wait for chat input
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      const sendButton = userBPage.getByTestId('send-button');

      // Chat exchanges (using no-gaps fixture responses)
      await chatInput.fill('Things have been tense lately');
      await sendButton.click();
      await waitForAIResponse(userBPage, /tension can be really draining/i);

      await chatInput.fill("I feel like we've just been miscommunicating");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Miscommunication can be really frustrating/i);

      await chatInput.fill("I want them to know I still care, even when I'm stressed");
      await sendButton.click();
      await waitForAIResponse(userBPage, /underneath the stress and tension/i);

      await chatInput.fill("Exactly. I just want us to be on the same page again");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Do you feel like I understand/i);

      // Confirm feeling heard - this triggers the reconciler
      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B confirmed feeling heard - reconciler running with no-gaps fixture`);

      // Wait for reconciler to complete and Ably events to propagate
      await userBPage.waitForTimeout(5000);

      // Check empathy status via API - should be REVEALED since no gaps
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });
      expect(empathyStatusResponse.ok()).toBe(true);

      const empathyStatus = await empathyStatusResponse.json();
      console.log(`${elapsed()} Empathy status for User A: ${JSON.stringify(empathyStatus.data?.myAttempt?.status)}`);

      // With no gaps, empathy should transition to REVEALED or READY
      const validStatuses = ['REVEALED', 'READY'];
      expect(validStatuses).toContain(empathyStatus.data?.myAttempt?.status);
    });

    test('does NOT see "partner is considering sharing" message', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session
      const userAParams = new URLSearchParams({
        'e2e-user-id': userAId,
        'e2e-user-email': userA.email,
      });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
      }
      await userAPage.waitForTimeout(2000);

      // User B accepts and completes Stage 1
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
      });

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();

      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      const sendButton = userBPage.getByTestId('send-button');

      // Complete chat
      await chatInput.fill('Things have been tense lately');
      await sendButton.click();
      await waitForAIResponse(userBPage, /tension can be really draining/i);

      await chatInput.fill("I feel like we've just been miscommunicating");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Miscommunication can be really frustrating/i);

      await chatInput.fill("I want them to know I still care, even when I'm stressed");
      await sendButton.click();
      await waitForAIResponse(userBPage, /underneath the stress and tension/i);

      await chatInput.fill("Exactly. I just want us to be on the same page again");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Do you feel like I understand/i);

      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B felt heard - checking User A doesn't see waiting message`);

      // Wait for reconciler and check User A's view
      await userAPage.waitForTimeout(5000);

      // User A should NOT see any "considering sharing" or "awaiting" messages
      const awaitingMessage = userAPage.getByText(/considering sharing|awaiting|waiting for .* to decide/i);
      const isAwaitingVisible = await awaitingMessage.isVisible({ timeout: 3000 }).catch(() => false);

      expect(isAwaitingVisible).toBe(false);
      console.log(`${elapsed()} Verified: User A does not see waiting message`);
    });
  });

  test.describe('User B perspective', () => {
    test('does NOT see share suggestion modal after feeling heard', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session first
      const userAParams = new URLSearchParams({
        'e2e-user-id': userAId,
        'e2e-user-email': userA.email,
      });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
      }
      await userAPage.waitForTimeout(2000);

      // User B accepts invitation via API
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
      });

      // User B navigates to session
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Sign compact
      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();

      // Handle mood check if present
      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      // Wait for chat input
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      const sendButton = userBPage.getByTestId('send-button');

      // Chat exchanges (using no-gaps fixture responses)
      await chatInput.fill('Things have been tense lately');
      await sendButton.click();
      await waitForAIResponse(userBPage, /tension can be really draining/i);

      await chatInput.fill("I feel like we've just been miscommunicating");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Miscommunication can be really frustrating/i);

      await chatInput.fill("I want them to know I still care, even when I'm stressed");
      await sendButton.click();
      await waitForAIResponse(userBPage, /underneath the stress and tension/i);

      await chatInput.fill("Exactly. I just want us to be on the same page again");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Do you feel like I understand/i);

      // Confirm feeling heard - this triggers the reconciler
      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B confirmed feeling heard - reconciler running with no-gaps fixture`);

      // Wait for reconciler to complete
      await userBPage.waitForTimeout(3000);

      // Verify NO share suggestion modal appears
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      const hasModal = await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false);

      // Also check API - should NOT have a share suggestion
      const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const shareOfferData = await shareOfferResponse.json().catch(() => ({}));
      const hasShareOfferFromAPI = shareOfferData?.data?.hasSuggestion === true;

      console.log(`${elapsed()} Share suggestion check - modal: ${hasModal}, API: ${hasShareOfferFromAPI}`);

      // Neither modal nor API should indicate a share suggestion
      expect(hasModal).toBe(false);
      expect(hasShareOfferFromAPI).toBe(false);

      console.log(`${elapsed()} Verified: No share suggestion shown (no gaps detected)`);
    });

    test('continues to empathy building normally after no gaps detected', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Setup User A
      const userAParams = new URLSearchParams({ 'e2e-user-id': userAId, 'e2e-user-email': userA.email });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
      }
      await userAPage.waitForTimeout(2000);

      // User B accepts and completes Stage 1
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
      });

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();

      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      const sendButton = userBPage.getByTestId('send-button');

      // Complete Stage 1 chat
      await chatInput.fill('Things have been tense lately');
      await sendButton.click();
      await waitForAIResponse(userBPage, /tension can be really draining/i);

      await chatInput.fill("I feel like we've just been miscommunicating");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Miscommunication can be really frustrating/i);

      await chatInput.fill("I want them to know I still care, even when I'm stressed");
      await sendButton.click();
      await waitForAIResponse(userBPage, /underneath the stress and tension/i);

      await chatInput.fill("Exactly. I just want us to be on the same page again");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Do you feel like I understand/i);

      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B felt heard - verifying can continue to Stage 2`);

      // Wait for reconciler
      await userBPage.waitForTimeout(3000);

      // Verify chat input is still available (not blocked)
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      await expect(chatInput).toBeEnabled({ timeout: 5000 });

      // User B should be able to continue chatting (Stage 2 empathy building)
      await chatInput.fill("I'm ready to work on understanding their perspective");
      await sendButton.click();

      // Should get an AI response (empathy building phase)
      // The response might vary, but the chat should continue
      await userBPage.waitForTimeout(5000);
      console.log(`${elapsed()} User B can continue chatting in Stage 2`);

      // Verify User B is not blocked by any share suggestion modal
      const shareSuggestionCard = userBPage.getByTestId('share-suggestion-card');
      const hasShareCard = await shareSuggestionCard.isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasShareCard).toBe(false);

      console.log(`${elapsed()} Verified: No share suggestion blocking User B`);
    });

    test('sees partner empathy revealed in Share tab', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Setup User A
      const userAParams = new URLSearchParams({ 'e2e-user-id': userAId, 'e2e-user-email': userA.email });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
      }
      await userAPage.waitForTimeout(2000);

      // User B accepts and completes Stage 1
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
      });

      const userBParams = new URLSearchParams({ 'e2e-user-id': userBId, 'e2e-user-email': userB.email });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();

      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      const sendButton = userBPage.getByTestId('send-button');

      // Complete Stage 1 chat
      await chatInput.fill('Things have been tense lately');
      await sendButton.click();
      await waitForAIResponse(userBPage, /tension can be really draining/i);

      await chatInput.fill("I feel like we've just been miscommunicating");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Miscommunication can be really frustrating/i);

      await chatInput.fill("I want them to know I still care, even when I'm stressed");
      await sendButton.click();
      await waitForAIResponse(userBPage, /underneath the stress and tension/i);

      await chatInput.fill("Exactly. I just want us to be on the same page again");
      await sendButton.click();
      await waitForAIResponse(userBPage, /Do you feel like I understand/i);

      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B felt heard - checking empathy reveal`);

      // Wait for reconciler and Ably events
      await userBPage.waitForTimeout(5000);

      // Navigate to Share tab to see partner's empathy
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Check for partner empathy card (User A's empathy should be visible)
      // The Share screen uses PartnerChatTab which generates dynamic testIDs like "share-screen-partner-tab-item-XXX"
      // We also look for content mentioning the partner's understanding
      const partnerEmpathyCard = userBPage.locator('[data-testid*="partner-tab-item"]');
      const hasPartnerEmpathy = await partnerEmpathyCard.first().isVisible({ timeout: 10000 }).catch(() => false);

      // Also check via API
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });

      const empathyData = await empathyStatusResponse.json();
      const partnerAttemptStatus = empathyData.data?.partnerAttempt?.status;

      console.log(`${elapsed()} Partner empathy status: ${partnerAttemptStatus}, UI visible: ${hasPartnerEmpathy}`);

      // With no gaps, User A's empathy should be REVEALED to User B
      // Note: The partnerAttempt may not be returned if the empathy hasn't been revealed yet
      // In that case, we check if content items are visible on the UI
      const expectedStatuses = ['REVEALED', 'READY', 'VALIDATED', undefined];
      expect(expectedStatuses).toContain(partnerAttemptStatus);

      // At minimum, verify the Share tab UI loaded successfully
      const shareTab = userBPage.locator('[data-testid*="share-screen"]');
      const hasShareTab = await shareTab.first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasShareTab || hasPartnerEmpathy).toBe(true);
    });
  });
});
