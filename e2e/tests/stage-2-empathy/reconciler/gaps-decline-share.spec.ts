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
 * OPTIMIZED: Uses RECONCILER_SHOWN_B stage to skip chat UI setup (~15s → ~2s)
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

// Fixture ID for this test - uses fixture with gaps-detected reconciler response
const FIXTURE_ID = 'user-b-partner-journey';

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

  let userAContext: BrowserContext;
  let userAPage: Page;
  let userBContext: BrowserContext;
  let userBPage: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Seed session at RECONCILER_SHOWN_B - share modal already ready
    const setup = await new SessionBuilder()
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('RECONCILER_SHOWN_B')
      .withFixture(FIXTURE_ID)
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} (RECONCILER_SHOWN_B)`);

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
    test('sees share suggestion after navigating to Share tab', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User B to Share tab
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      console.log(`${elapsed()} User B on Share screen - looking for suggestion`);

      // Verify share suggestion is visible
      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });

      console.log(`${elapsed()} Share suggestion visible - test passed`);
    });

    test('can tap "No thanks" to decline sharing', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate to Share screen
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      console.log(`${elapsed()} User B ready to decline share suggestion`);

      // Find and click decline button
      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });

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

      expect(cardStillVisible).toBe(false);
      console.log(`${elapsed()} Share suggestion card hidden after decline`);
    });

    test('can continue conversation after declining', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });

      // Navigate to Share screen and decline
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      // Wait for decline to process
      await userBPage.waitForTimeout(2000);

      console.log(`${elapsed()} User B declined - navigating back to chat`);

      // Navigate back to chat
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      await handleMoodCheck(userBPage);

      // Verify chat input is available (not blocked)
      const chatInput = userBPage.getByTestId('chat-input');
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      await expect(chatInput).toBeEnabled({ timeout: 5000 });

      console.log(`${elapsed()} User B can continue chatting after declining - test passed`);
    });
  });

  test.describe('User A perspective', () => {
    test('does NOT see shared context when User B declines', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);

      // User B declines the share suggestion
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      console.log(`${elapsed()} User B declined - checking User A's view`);

      // Wait for state to propagate
      await userBPage.waitForTimeout(3000);

      // Reload User A's view
      await userAPage.reload();
      await userAPage.waitForLoadState('networkidle');
      await handleMoodCheck(userAPage);

      // User A should NOT see "Context from Darryl"
      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      const hasSharedContext = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasSharedContext).toBe(false);
      console.log(`${elapsed()} Verified: User A does not see shared context (declined) - test passed`);
    });

    test('empathy transitions to valid status after User B declines', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // User B declines
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      const declineButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-decline"]');
      await expect(declineButton).toBeVisible({ timeout: 10000 });
      await declineButton.click();

      console.log(`${elapsed()} User B declined - checking empathy status`);

      // Wait for state to propagate
      await userBPage.waitForTimeout(3000);

      // Check empathy status via API
      const empathyStatusResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/empathy/status`, {
        headers: getE2EHeaders(userA.email, userAId, FIXTURE_ID),
      });

      expect(empathyStatusResponse.ok()).toBe(true);
      const empathyData = await empathyStatusResponse.json();

      console.log(`${elapsed()} User A empathy status: ${empathyData.data?.myAttempt?.status}`);

      // After declining, empathy should transition to READY or REVEALED (not stuck in AWAITING_SHARING)
      const myStatus = empathyData.data?.myAttempt?.status;
      expect(myStatus).not.toBe('AWAITING_SHARING');
      console.log(`${elapsed()} Verified: Empathy not stuck in AWAITING_SHARING - test passed`);
    });
  });
});
