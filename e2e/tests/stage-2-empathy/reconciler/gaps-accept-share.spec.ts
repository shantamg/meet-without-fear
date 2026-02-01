/**
 * Reconciler: Gaps Detected - User B Accepts Share Suggestion
 *
 * Tests the flow when:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler detects significant gaps in User A's understanding
 * 4. User B receives a share suggestion and accepts it
 * 5. User A receives the shared context
 *
 * This is the "happy path" for the share suggestion flow.
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

test.describe('Reconciler: Gaps Detected - User B Accepts Share', () => {
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

  test.describe('User B perspective', () => {
    test('sees share suggestion modal after feeling heard', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session first (establishes Ably connection)
      const userAParams = new URLSearchParams({
        'e2e-user-id': userAId,
        'e2e-user-email': userA.email,
      });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      // Handle mood check if present for User A
      const userAMoodContinue = userAPage.getByTestId('mood-check-continue-button');
      if (await userAMoodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userAMoodContinue.click();
        await userAPage.waitForLoadState('networkidle');
      }

      // Wait for Ably to connect
      await userAPage.waitForTimeout(3000);

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

      // Chat exchanges
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

      // Confirm feeling heard
      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} User B confirmed feeling heard - reconciler running`);

      // Wait for reconciler to complete
      await userBPage.waitForTimeout(3000);

      // Check for share suggestion modal
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      const hasModal = await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false);

      // Also check API for share offer
      const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const shareOfferData = await shareOfferResponse.json().catch(() => ({}));
      const hasShareOfferFromAPI = shareOfferData?.data?.hasSuggestion === true;

      expect(hasModal || hasShareOfferFromAPI).toBe(true);
      console.log(`${elapsed()} Share suggestion available (modal: ${hasModal}, API: ${hasShareOfferFromAPI})`);
    });

    test('can share context via the suggestion card', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Setup User A
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
      await userAPage.waitForTimeout(3000);

      // Accept invitation and navigate User B
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
      });

      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Sign compact and handle mood check
      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();
      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      // Complete chat and feel heard
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

      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      await userBPage.waitForTimeout(3000);

      // Navigate to share screen (either via modal or directly)
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      const hasModal = await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasModal) {
        const viewButton = userBPage.getByText('View', { exact: true });
        await viewButton.click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      // Find and click share button
      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      await expect(shareButton).toBeVisible({ timeout: 10000 });

      const shareResponsePromise = userBPage.waitForResponse(
        (response) => response.url().includes('/reconciler/share-offer/respond') && response.request().method() === 'POST',
        { timeout: 15000 }
      );

      await shareButton.click();

      const shareResponse = await shareResponsePromise;
      expect(shareResponse.status()).toBeLessThan(300);

      console.log(`${elapsed()} User B successfully shared context`);

      // Verify share suggestion prompt disappears
      const shareSuggestionText = userBPage.getByText(/Would you like to share something to help/i);
      await expect(shareSuggestionText).not.toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('User A perspective', () => {
    test('receives shared context from User B', async ({ request }) => {
      test.setTimeout(300000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Set up User A console logging
      const userAConsoleLogs: string[] = [];
      userAPage.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Realtime]') || text.includes('context_shared') || text.includes('empathy.')) {
          userAConsoleLogs.push(text);
        }
      });

      // Navigate User A
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
      await userAPage.waitForTimeout(3000);

      // Complete User B's journey through sharing
      await request.post(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        headers: { ...getE2EHeaders(userB.email, userBId, FIXTURE_ID), 'Content-Type': 'application/json' },
      });

      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Sign compact and handle mood check
      const agreeCheckbox = userBPage.getByTestId('compact-agree-checkbox');
      await expect(agreeCheckbox).toBeVisible({ timeout: 10000 });
      await agreeCheckbox.click();
      await userBPage.getByTestId('compact-sign-button').click();
      const moodContinue = userBPage.getByTestId('mood-check-continue-button');
      if (await moodContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
        await moodContinue.click();
      }

      // Chat and feel heard
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

      const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
      await expect(feelHeardYes).toBeVisible({ timeout: 5000 });
      await feelHeardYes.click();
      await expect(feelHeardYes).not.toBeVisible({ timeout: 5000 });

      await userBPage.waitForTimeout(3000);

      // Navigate to share screen and share
      const partnerEventModal = userBPage.getByTestId('partner-event-modal');
      if (await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userBPage.getByText('View', { exact: true }).click();
        await expect(partnerEventModal).not.toBeVisible({ timeout: 5000 });
      } else {
        await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      }
      await userBPage.waitForLoadState('networkidle');

      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      await expect(shareButton).toBeVisible({ timeout: 10000 });
      await shareButton.click();

      console.log(`${elapsed()} User B shared - checking if User A receives via Ably`);

      // Wait for Ably event
      await userAPage.waitForTimeout(5000);

      // Check if indicator appeared via Ably (no reload)
      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      let indicatorVisible = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (!indicatorVisible) {
        console.log(`${elapsed()} Ably update not received - reloading to verify state`);
        await userAPage.reload();
        await userAPage.waitForLoadState('networkidle');

        const moodCheck = userAPage.getByTestId('mood-check-continue-button');
        if (await moodCheck.isVisible({ timeout: 3000 }).catch(() => false)) {
          await moodCheck.click();
        }
      }

      await expect(sharedContextIndicator).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} User A sees "Context from Darryl" indicator`);

      // Verify via API
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });
      expect(empathyStatusResponse.ok()).toBe(true);
    });
  });
});
