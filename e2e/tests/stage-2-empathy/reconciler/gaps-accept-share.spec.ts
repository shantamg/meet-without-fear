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
 * OPTIMIZED: Uses RECONCILER_SHOWN_B stage to skip chat UI setup (~15s → ~2s)
 * for tests that only need to verify the share modal interaction.
 *
 * For tests that need to verify reconciler behavior, uses FEEL_HEARD_B + API trigger.
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

  let userAContext: BrowserContext;
  let userAPage: Page;
  let userBContext: BrowserContext;
  let userBPage: Page;

  test.afterEach(async () => {
    await userAContext?.close();
    await userBContext?.close();
  });

  test.describe('Share Modal UI Tests (RECONCILER_SHOWN_B stage)', () => {
    /**
     * These tests use RECONCILER_SHOWN_B stage which includes:
     * - ReconcilerResult with significant gaps already created
     * - ReconcilerShareOffer with status OFFERED
     *
     * This skips all chat UI setup and reconciler execution (~15s faster)
     */

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

      // Create browser contexts for both users
      const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
      userAContext = userASetup.context;
      userAPage = userASetup.page;

      const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });
      userBContext = userBSetup.context;
      userBPage = userBSetup.page;
    });

    test('User B sees share suggestion on Share tab', async () => {
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

      console.log(`${elapsed()} User B navigated to Share tab`);

      // Verify share suggestion card is visible
      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      await expect(shareButton).toBeVisible({ timeout: 10000 });

      console.log(`${elapsed()} Share suggestion visible - test passed`);
    });

    test('User B can accept share suggestion and User A receives it', async ({ request }) => {
      test.setTimeout(120000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session (establishes Ably connection for real-time updates)
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);
      await userAPage.waitForTimeout(2000); // Wait for Ably connection

      console.log(`${elapsed()} User A connected to session`);

      // Navigate User B to Share tab
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
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

      console.log(`${elapsed()} User B accepted share suggestion`);

      // Wait for Ably event to propagate to User A
      await userAPage.waitForTimeout(3000);

      // Check if User A sees "Context from Darryl" indicator (may need reload)
      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      let indicatorVisible = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (!indicatorVisible) {
        console.log(`${elapsed()} Ably update not received - reloading to verify state`);
        await userAPage.reload();
        await userAPage.waitForLoadState('networkidle');
        await handleMoodCheck(userAPage);
      }

      await expect(sharedContextIndicator).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} User A sees shared context indicator - test passed`);
    });

    test('User B can decline share suggestion', async () => {
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

      console.log(`${elapsed()} User B declined share suggestion - test passed`);

      // Verify share suggestion card is no longer visible
      await userBPage.waitForTimeout(2000);
      const shareSuggestionCard = userBPage.locator('[data-testid*="share-suggestion"]');
      const cardStillVisible = await shareSuggestionCard.isVisible({ timeout: 2000 }).catch(() => false);

      expect(cardStillVisible).toBe(false);
    });
  });

  test.describe('Reconciler Trigger Tests (FEEL_HEARD_B + API)', () => {
    /**
     * These tests use FEEL_HEARD_B stage and trigger the reconciler via API.
     * This is needed when testing reconciler behavior, not just UI.
     */

    test.beforeEach(async ({ browser, request }) => {
      await cleanupE2EData().catch(() => {});

      // Seed session at FEEL_HEARD_B - reconciler NOT yet run
      const setup = await new SessionBuilder()
        .userA(userA.email, userA.name)
        .userB(userB.email, userB.name)
        .startingAt('FEEL_HEARD_B')
        .withFixture(FIXTURE_ID)
        .setup(request);

      sessionId = setup.session.id;
      userAId = setup.userA.id;
      userBId = setup.userB!.id;

      console.log(`[Setup] Session: ${sessionId} (FEEL_HEARD_B)`);

      const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
      userAContext = userASetup.context;
      userAPage = userASetup.page;

      const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });
      userBContext = userBSetup.context;
      userBPage = userBSetup.page;
    });

    test('full flow: trigger reconciler, accept share, verify delivery', async ({ request }) => {
      test.setTimeout(120000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session first
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);
      await userAPage.waitForTimeout(2000);

      console.log(`${elapsed()} User A connected`);

      // Trigger reconciler via API
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
      console.log(`${elapsed()} Reconciler triggered`);

      // Navigate User B to Share tab
      const userBParams = new URLSearchParams({
        'e2e-user-id': userBId,
        'e2e-user-email': userB.email,
      });
      await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
      await userBPage.waitForLoadState('networkidle');

      // Accept share suggestion
      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      await expect(shareButton).toBeVisible({ timeout: 10000 });

      const shareResponsePromise = userBPage.waitForResponse(
        (response) => response.url().includes('/reconciler/share-offer/respond') && response.request().method() === 'POST',
        { timeout: 15000 }
      );

      await shareButton.click();
      await shareResponsePromise;

      console.log(`${elapsed()} User B accepted share`);

      // Wait for Ably and verify User A sees shared context
      await userAPage.waitForTimeout(3000);

      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      let indicatorVisible = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (!indicatorVisible) {
        await userAPage.reload();
        await userAPage.waitForLoadState('networkidle');
        await handleMoodCheck(userAPage);
      }

      await expect(sharedContextIndicator).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} Full flow verified - test passed`);
    });
  });
});
