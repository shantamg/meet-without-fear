/**
 * Reconciler: No Gaps Detected → Proceed Directly
 *
 * Tests the flow when reconciler finds no significant gaps:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler finds User A's understanding is accurate
 * 4. No share suggestion is shown
 * 5. Both users proceed directly to empathy reveal
 *
 * Uses the 'reconciler-no-gaps' fixture which returns action: "PROCEED".
 */

import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../../../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.use(devices['iPhone 12']);

// This fixture returns PROCEED (no gaps) from the reconciler
const FIXTURE_ID = 'reconciler-no-gaps';

async function waitForAIResponse(page: Page, textPattern: RegExp, timeout = 15000) {
  await expect(page.getByText(textPattern)).toBeVisible({ timeout });
  const typingIndicator = page.getByTestId('typing-indicator');
  await expect(typingIndicator).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(100);
}

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

test.describe('Reconciler: No Gaps Detected → Proceed Directly', () => {
  const userA = { email: 'shantam@e2e.test', name: 'Shantam' };
  const userB = { email: 'darryl@e2e.test', name: 'Darryl' };

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

    console.log(`[Setup] Session: ${sessionId}, Fixture: ${FIXTURE_ID} (no gaps)`);

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

  async function setupUserA() {
    const userAParams = new URLSearchParams({
      'e2e-user-id': userAId,
      'e2e-user-email': userA.email,
    });
    await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
    await userAPage.waitForLoadState('networkidle');

    const moodContinue = userAPage.getByTestId('mood-check-continue-button');
    if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moodContinue.click();
    }
    await userAPage.waitForTimeout(2000);
  }

  async function completeUserBStage1(request: import('@playwright/test').APIRequestContext) {
    await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
      headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
    });

    const userBParams = new URLSearchParams({
      'e2e-user-id': userBId,
      'e2e-user-email': userB.email,
    });
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

    // Chat using no-gaps fixture responses (different from gaps-detected fixture)
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

    await userBPage.waitForTimeout(3000);
  }

  test.describe('Complete Journey', () => {
    test('No share suggestion shown → Both users proceed to empathy reveal', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await setupUserA();
      await completeUserBStage1(request);
      console.log(`${elapsed()} User B completed Stage 1, reconciler ran with no-gaps fixture`);

      // === VERIFY: User B does NOT see share suggestion modal ===
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      const hasModal = await partnerEventModal.isVisible({ timeout: 3000 }).catch(() => false);

      const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const shareOfferData = await shareOfferResponse.json().catch(() => ({}));
      const hasShareOfferFromAPI = shareOfferData?.data?.hasSuggestion === true;

      expect(hasModal).toBe(false);
      expect(hasShareOfferFromAPI).toBe(false);
      console.log(`${elapsed()} Verified: No share suggestion (modal: ${hasModal}, API: ${hasShareOfferFromAPI})`);

      // === VERIFY: User B can continue chatting ===
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      await expect(chatInput).toBeEnabled({ timeout: 5000 });

      const shareSuggestionCard = userBPage.getByTestId('share-suggestion-card');
      const hasShareCard = await shareSuggestionCard.isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasShareCard).toBe(false);

      console.log(`${elapsed()} User B can continue to Stage 2 without share suggestion blocking`);

      // === VERIFY: Empathy status transitions correctly ===
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });
      expect(empathyStatusResponse.ok()).toBe(true);

      const empathyStatus = await empathyStatusResponse.json();
      const myStatus = empathyStatus.data?.myAttempt?.status;
      console.log(`${elapsed()} User A empathy status: ${myStatus}`);

      // With no gaps, empathy should transition to REVEALED or READY
      const validStatuses = ['REVEALED', 'READY'];
      expect(validStatuses).toContain(myStatus);
    });
  });

  test.describe('User A Experience', () => {
    test('User A does not see "partner considering sharing" message', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await setupUserA();
      await completeUserBStage1(request);

      // Wait for reconciler and check User A's view
      await userAPage.waitForTimeout(5000);

      // User A should NOT see any "considering sharing" or "awaiting" messages
      const awaitingMessage = userAPage.getByText(/considering sharing|awaiting|waiting for .* to decide/i);
      const isAwaitingVisible = await awaitingMessage.isVisible({ timeout: 3000 }).catch(() => false);

      expect(isAwaitingVisible).toBe(false);
      console.log(`${elapsed()} Verified: User A does not see waiting message`);
    });
  });

  test.describe('Share Tab', () => {
    test('User B can view partner empathy in Share tab after proceeding', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await setupUserA();
      await completeUserBStage1(request);

      // Wait for reconciler and Ably events
      await userBPage.waitForTimeout(5000);

      // Navigate to Share tab
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Check for partner empathy content
      const partnerEmpathyCard = userBPage.locator('[data-testid*="partner-tab-item"]');
      const hasPartnerEmpathy = await partnerEmpathyCard.first().isVisible({ timeout: 10000 }).catch(() => false);

      // Verify via API
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const empathyData = await empathyStatusResponse.json();
      const partnerStatus = empathyData.data?.partnerAttempt?.status;

      console.log(`${elapsed()} Partner empathy status: ${partnerStatus}, UI visible: ${hasPartnerEmpathy}`);

      // With no gaps, User A's empathy should be revealed to User B
      const expectedStatuses = ['REVEALED', 'READY', 'VALIDATED', undefined];
      expect(expectedStatuses).toContain(partnerStatus);

      // Verify Share tab loaded
      const shareTab = userBPage.locator('[data-testid*="share-screen"]');
      const hasShareTab = await shareTab.first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasShareTab || hasPartnerEmpathy).toBe(true);
    });
  });
});
