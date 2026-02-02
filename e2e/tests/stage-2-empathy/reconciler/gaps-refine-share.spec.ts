/**
 * Reconciler: Gaps Detected - User B Refines Share Before Sending
 *
 * Tests the flow when:
 * 1. User A has shared an empathy guess
 * 2. User B completes Stage 1 (feels heard)
 * 3. Reconciler detects significant gaps in User A's understanding
 * 4. User B receives a share suggestion and EDITS it before sharing
 * 5. User A receives the modified shared context
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

test.describe('Reconciler: Gaps Detected - User B Refines Share', () => {
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

  /**
   * Helper to navigate User B to Share screen.
   */
  async function navigateUserBToShareScreen() {
    const userBParams = new URLSearchParams({
      'e2e-user-id': userBId,
      'e2e-user-email': userB.email,
    });
    await userBPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userBParams.toString()}`);
    await userBPage.waitForLoadState('networkidle');
  }

  test.describe('User B perspective', () => {
    test('can tap "Edit" to enter refinement mode', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await navigateUserBToShareScreen();

      console.log(`${elapsed()} User B on Share screen - looking for Edit button`);

      // Find and click edit button
      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });

      await editButton.click();

      // After clicking Edit, refinement input should appear
      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} Edit mode activated - refinement input visible - test passed`);
    });

    test('sees refinement input with placeholder text', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await navigateUserBToShareScreen();

      // Enter edit mode
      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });
      await editButton.click();

      // Check refinement input is visible with placeholder
      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });

      // The input should have a placeholder asking what to change
      const placeholder = await refineInput.getAttribute('placeholder');
      console.log(`${elapsed()} Refinement input placeholder: "${placeholder}"`);

      // Placeholder should ask about changes
      expect(placeholder?.toLowerCase()).toContain('change');
      console.log(`${elapsed()} Placeholder text verified - test passed`);
    });

    test('can type refinement request and send it', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await navigateUserBToShareScreen();

      // Enter edit mode
      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });
      await editButton.click();

      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });

      // Type a refinement request
      const refinementText = "Please make it shorter and focus on how tired I feel";
      await refineInput.fill(refinementText);

      console.log(`${elapsed()} Typed refinement: "${refinementText}"`);

      // Find and click send refinement button
      const sendRefineButton = userBPage.getByTestId('share-suggestion-card-send-refine');
      await expect(sendRefineButton).toBeVisible({ timeout: 5000 });

      // Set up response listener
      const refineResponsePromise = userBPage.waitForResponse(
        (response) => response.url().includes('/reconciler/share-offer/respond') && response.request().method() === 'POST',
        { timeout: 15000 }
      );

      await sendRefineButton.click();

      const refineResponse = await refineResponsePromise;
      expect(refineResponse.status()).toBeLessThan(300);

      console.log(`${elapsed()} Refinement request sent successfully - test passed`);
    });

    test('can cancel edit mode and return to default view', async () => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await navigateUserBToShareScreen();

      // Enter edit mode
      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });
      await editButton.click();

      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} Edit mode active - now canceling`);

      // Click cancel button (X button)
      const cancelButton = userBPage.getByTestId('share-suggestion-card-cancel-edit');
      await expect(cancelButton).toBeVisible({ timeout: 5000 });
      await cancelButton.click();

      // Verify we're back to default view (edit button visible again, refine input hidden)
      await expect(refineInput).not.toBeVisible({ timeout: 5000 });
      await expect(editButton).toBeVisible({ timeout: 5000 });

      console.log(`${elapsed()} Successfully canceled edit mode - test passed`);
    });

    test('can share after refining content', async ({ request }) => {
      test.setTimeout(60000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      await navigateUserBToShareScreen();

      // Enter edit mode and send refinement
      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });
      await editButton.click();

      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });

      await refineInput.fill("Make it more concise");

      const sendRefineButton = userBPage.getByTestId('share-suggestion-card-send-refine');
      await sendRefineButton.click();

      // Wait for refinement to process
      await userBPage.waitForTimeout(3000);

      console.log(`${elapsed()} Refinement processed - now sharing`);

      // After refinement, we should be able to share
      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');

      if (await shareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        const shareResponsePromise = userBPage.waitForResponse(
          (response) => response.url().includes('/reconciler/share-offer/respond') && response.request().method() === 'POST',
          { timeout: 15000 }
        );

        await shareButton.click();

        const shareResponse = await shareResponsePromise;
        expect(shareResponse.status()).toBeLessThan(300);

        console.log(`${elapsed()} Successfully shared refined content - test passed`);
      } else {
        // Refinement might have auto-shared or changed UI state
        console.log(`${elapsed()} Share button not visible - checking if content was shared`);

        // Verify via API that share happened
        const shareOfferResponse = await request.get(`${API_BASE_URL}/api/sessions/${sessionId}/reconciler/share-offer`, {
          headers: getE2EHeaders(userB.email, userBId, FIXTURE_ID),
        });
        const shareData = await shareOfferResponse.json();

        // Share suggestion should no longer be pending
        expect(shareData.data?.hasSuggestion).toBe(false);
        console.log(`${elapsed()} Content was shared (verified via API) - test passed`);
      }
    });
  });

  test.describe('User A perspective', () => {
    test('receives shared context after User B refines and shares', async () => {
      test.setTimeout(120000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session first
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);
      await userAPage.waitForTimeout(2000);

      console.log(`${elapsed()} User A connected`);

      // User B refines and shares
      await navigateUserBToShareScreen();

      const editButton = userBPage.getByTestId('share-suggestion-card-edit');
      await expect(editButton).toBeVisible({ timeout: 10000 });
      await editButton.click();

      const refineInput = userBPage.getByTestId('share-suggestion-card-refine-input');
      await expect(refineInput).toBeVisible({ timeout: 5000 });
      await refineInput.fill("Make it shorter");

      const sendRefineButton = userBPage.getByTestId('share-suggestion-card-send-refine');
      await sendRefineButton.click();

      // Wait for refinement
      await userBPage.waitForTimeout(3000);

      // Now share the refined content
      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      if (await shareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await shareButton.click();
      }

      console.log(`${elapsed()} User B shared refined content - checking User A's view`);

      // Wait for Ably events to propagate
      await userAPage.waitForTimeout(5000);

      // Check User A's view for shared context indicator
      const sharedContextIndicator = userAPage.getByText('Context from Darryl', { exact: true });
      let hasIndicator = await sharedContextIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasIndicator) {
        await userAPage.reload();
        await userAPage.waitForLoadState('networkidle');
        await handleMoodCheck(userAPage);
        hasIndicator = await sharedContextIndicator.isVisible({ timeout: 10000 }).catch(() => false);
      }

      expect(hasIndicator).toBe(true);
      console.log(`${elapsed()} User A sees "Context from Darryl" indicator - test passed`);
    });

    test('shared context is visible in Share tab', async () => {
      test.setTimeout(120000);
      const testStart = Date.now();
      const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

      // Navigate User A to session
      await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userA.email);
      await handleMoodCheck(userAPage);

      // User B shares (direct share, no editing for simplicity)
      await navigateUserBToShareScreen();

      const shareButton = userBPage.locator('[data-testid*="share-suggestion"][data-testid$="-share"]');
      await expect(shareButton).toBeVisible({ timeout: 10000 });
      await shareButton.click();

      console.log(`${elapsed()} User B shared - navigating User A to Share tab`);

      // Wait for share to process
      await userBPage.waitForTimeout(3000);

      // Navigate User A to Share tab
      const userAParams = new URLSearchParams({
        'e2e-user-id': userAId,
        'e2e-user-email': userA.email,
      });
      await userAPage.goto(`${APP_BASE_URL}/session/${sessionId}/share?${userAParams.toString()}`);
      await userAPage.waitForLoadState('networkidle');

      // Check for sharing timeline or shared context
      const sharingTimeline = userAPage.getByTestId('sharing-timeline');
      const hasTimeline = await sharingTimeline.isVisible({ timeout: 10000 }).catch(() => false);

      // Also check for shared context text
      const sharedContextText = userAPage.getByText(/running on empty|exhausted/i);
      const hasSharedText = await sharedContextText.isVisible({ timeout: 5000 }).catch(() => false);

      console.log(`${elapsed()} Share tab - timeline: ${hasTimeline}, shared text: ${hasSharedText}`);

      // At least one indicator should be present
      expect(hasTimeline || hasSharedText).toBe(true);
      console.log(`${elapsed()} Shared content visible in Share tab - test passed`);
    });
  });
});
