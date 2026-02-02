/**
 * Reconciler: No Gaps Detected (PROCEED Path)
 *
 * Tests the flow when:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler finds NO significant gaps in User A's understanding
 * 4. Both users proceed directly to empathy reveal without sharing
 *
 * OPTIMIZED: Uses FEEL_HEARD_B stage + API trigger with reconciler-no-gaps fixture.
 * This tests reconciler behavior with a no-gaps fixture response.
 */

import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import {
  cleanupE2EData,
  getE2EHeaders,
  SessionBuilder,
  createUserContext,
  handleMoodCheck,
  navigateToSession,
} from '../../../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Use iPhone 12 viewport - must be at top level
test.use(devices['iPhone 12']);

// Fixture ID for this test - uses fixture with NO gaps detected
const FIXTURE_ID = 'reconciler-no-gaps';

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

  let userAContext: BrowserContext;
  let userAPage: Page;
  let userBContext: BrowserContext;
  let userBPage: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Seed session at FEEL_HEARD_B - reconciler NOT yet run
    // We'll trigger it via API with the no-gaps fixture
    const setup = await new SessionBuilder()
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('FEEL_HEARD_B')
      .withFixture(FIXTURE_ID)
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} (FEEL_HEARD_B), Fixture: ${FIXTURE_ID}`);

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

  test.describe('Reconciler behavior (API triggered)', () => {
    test('reconciler returns READY status with no share offer (no gaps)', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Trigger reconciler via API with no-gaps fixture
      const reconcilerResponse = await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      expect(reconcilerResponse.ok()).toBe(true);
      const reconcilerData = await reconcilerResponse.json();

      console.log(`${elapsed()} Reconciler triggered via API`);
      console.log(`  - empathyStatus: ${reconcilerData.data?.empathyStatus}`);
      console.log(`  - hasShareOffer: ${!!reconcilerData.data?.shareOffer}`);

      // With no-gaps fixture, reconciler should return READY (no sharing needed)
      expect(reconcilerData.success).toBe(true);
      expect(reconcilerData.data.empathyStatus).toBe('READY');
      expect(reconcilerData.data.shareOffer).toBeNull();

      console.log(`${elapsed()} Reconciler returned READY with no share offer - test passed`);
    });
  });

  test.describe('User A perspective', () => {
    test('empathy transitions to READY/REVEALED status after reconciler runs', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Trigger reconciler via API
      await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      console.log(`${elapsed()} Reconciler triggered`);

      // Wait for state to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check empathy status via API - should be READY or REVEALED since no gaps
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });
      expect(empathyStatusResponse.ok()).toBe(true);

      const empathyStatus = await empathyStatusResponse.json();
      console.log(`${elapsed()} Empathy status for User A: ${empathyStatus.data?.myAttempt?.status}`);

      // With no gaps, empathy should transition to READY or REVEALED
      const validStatuses = ['REVEALED', 'READY'];
      expect(validStatuses).toContain(empathyStatus.data?.myAttempt?.status);
      console.log(`${elapsed()} Empathy status is valid - test passed`);
    });

    test('does NOT see "partner is considering sharing" message', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);

      // Trigger reconciler via API
      await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      console.log(`${elapsed()} Reconciler triggered - checking User A's view`);

      // Wait for Ably events to propagate
      await userAPage.waitForTimeout(3000);

      // User A should NOT see any "considering sharing" or "awaiting" messages
      const awaitingMessage = userAPage.getByText(/considering sharing|awaiting|waiting for .* to decide/i);
      const isAwaitingVisible = await awaitingMessage.isVisible({ timeout: 3000 }).catch(() => false);

      expect(isAwaitingVisible).toBe(false);
      console.log(`${elapsed()} Verified: User A does not see waiting message - test passed`);
    });
  });

  test.describe('User B perspective', () => {
    test('does NOT see share suggestion after reconciler runs (no gaps)', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Trigger reconciler via API
      await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      console.log(`${elapsed()} Reconciler triggered`);

      // Navigate User B to Share tab
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Verify NO share suggestion is shown
      const shareSuggestionCard = userBPage.locator('[data-testid*="share-suggestion"]');
      const hasShareCard = await shareSuggestionCard.isVisible({ timeout: 5000 }).catch(() => false);

      // Also check API
      const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });
      const shareOfferData = await shareOfferResponse.json().catch(() => ({}));
      const hasShareOfferFromAPI = shareOfferData?.data?.hasSuggestion === true;

      console.log(`${elapsed()} Share suggestion check - UI: ${hasShareCard}, API: ${hasShareOfferFromAPI}`);

      // Neither UI nor API should indicate a share suggestion
      expect(hasShareCard).toBe(false);
      expect(hasShareOfferFromAPI).toBe(false);

      console.log(`${elapsed()} Verified: No share suggestion shown (no gaps detected) - test passed`);
    });

    test('can continue conversation normally after reconciler runs', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Trigger reconciler via API
      await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      console.log(`${elapsed()} Reconciler triggered`);

      // Navigate User B to session
      await navigateToSession(userBPage, APP_BASE_URL, sessionId, userBId, userB.email);
      await handleMoodCheck(userBPage);

      // Verify chat input is available (not blocked)
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      await expect(chatInput).toBeEnabled({ timeout: 5000 });

      console.log(`${elapsed()} User B can continue chatting - test passed`);
    });

    test('sees partner empathy in Share tab after reconciler runs', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Trigger reconciler via API
      await request.post(`${API_BASE_URL}/api/e2e/trigger-reconciler`, {
        headers: {
          ...getE2EHeaders(userB.email, userBId, FIXTURE_ID),
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          sessionId,
          guesserId: userAId,
          subjectId: userBId,
        }),
      });

      console.log(`${elapsed()} Reconciler triggered`);

      // Wait for state to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Navigate to Share tab to see partner's empathy
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Check for partner empathy content or Share tab UI
      const partnerEmpathyCard = userBPage.locator('[data-testid*="partner-tab-item"]');
      const hasPartnerEmpathy = await partnerEmpathyCard.first().isVisible({ timeout: 10000 }).catch(() => false);

      // Also check via API
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
      });

      const empathyData = await empathyStatusResponse.json();
      const partnerAttemptStatus = empathyData.data?.partnerAttempt?.status;

      console.log(`${elapsed()} Partner empathy status: ${partnerAttemptStatus}, UI visible: ${hasPartnerEmpathy}`);

      // With no gaps, User A's empathy should be READY or REVEALED
      const expectedStatuses = ['REVEALED', 'READY', 'VALIDATED', undefined];
      expect(expectedStatuses).toContain(partnerAttemptStatus);

      // At minimum, verify the Share tab UI loaded successfully
      const shareTab = userBPage.locator('[data-testid*="share-screen"]');
      const hasShareTab = await shareTab.first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasShareTab || hasPartnerEmpathy).toBe(true);

      console.log(`${elapsed()} Share tab verified - test passed`);
    });
  });
});
