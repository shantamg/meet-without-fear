/**
 * Full Partner Journey E2E Test
 *
 * Tests the complete two-user partner journey from Stages 0-2 and Stage 3 entry.
 * This is the final verification that both users can reliably complete the full
 * partner session together.
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0 (compact signing)
 * - Both users complete Stage 1 (witnessing + feel-heard)
 * - Both users complete Stage 2 (empathy drafting + sharing + reconciler)
 * - Both users enter Stage 3 (chat continues)
 * - Test passes 3 consecutive runs without flakiness
 *
 * This test composes the proven patterns from two-browser-stage-2.spec.ts into a
 * dedicated full-flow test focused on the "proof" use case for milestone validation.
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness } from '../helpers';
import {
  signCompact,
  handleMoodCheck,
  sendAndWaitForPanel,
  confirmFeelHeard,
  waitForReconcilerComplete,
  navigateToShareFromSession,
  navigateBackToChat,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

test.describe('Full Partner Journey: Stages 0-3', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with asymmetric fixtures:
    // User A: user-a-full-journey (no reconciler ops, shares first)
    // User B: reconciler-no-gaps (reconciler ops, shares second triggers reconciler)
    harness = new TwoBrowserHarness({
      userA: {
        email: 'full-flow-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'full-flow-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-no-gaps',
      },
    });

    // Clean up database
    await harness.cleanup();

    // Set up User A and create session
    await harness.setupUserA(browser, request);
    await harness.createSession();
  });

  test.afterEach(async () => {
    await harness.teardown();
  });

  test('both users complete Stages 0-2 and enter Stage 3', async ({ browser, request }) => {
    test.setTimeout(900000); // 15 minutes - Stage 2 requires 13 AI interactions

    // ==========================================
    // === STAGE 0: COMPACT SIGNING ===
    // ==========================================

    // Set up User B after session is created (sequential, not parallel)
    await harness.setupUserB(browser, request);
    await harness.acceptInvitation();

    // Both users navigate, sign compact, handle mood check
    await harness.navigateUserA();
    await signCompact(harness.userAPage);
    await handleMoodCheck(harness.userAPage);

    await harness.navigateUserB();
    await signCompact(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // Verify both see chat input
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

    // ==========================================
    // === STAGE 1: USER A WITNESSING ===
    // ==========================================

    // User A sends messages matching user-a-full-journey fixture
    // Response 1 triggers invitation panel which we need to dismiss
    const userAStage1Messages = [
      "Hi, I'm having a conflict with my partner", // Response 0: initial greeting
      'We keep arguing about household chores', // Response 1: invitation draft - triggers invitation panel
    ];

    // Send first 2 messages to trigger invitation panel
    for (let i = 0; i < 2; i++) {
      const chatInput = harness.userAPage.getByTestId('chat-input');
      const sendButton = harness.userAPage.getByTestId('send-button');
      await chatInput.fill(userAStage1Messages[i]);
      await sendButton.click();
      // Wait for typing indicator to disappear (streaming complete)
      await expect(harness.userAPage.getByTestId('typing-indicator')).not.toBeVisible({ timeout: 60000 });
      await harness.userAPage.waitForTimeout(500);
    }

    // Dismiss invitation panel by clicking "I've sent it - Continue"
    const dismissInvitation = harness.userAPage.getByText("I've sent it - Continue");
    if (await dismissInvitation.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dismissInvitation.click();
      await harness.userAPage.waitForTimeout(500);
    }

    // Send remaining messages until feel-heard panel appears
    const remainingMessagesA = [
      'Thanks, I sent the invitation', // Response 2: post-invitation
      "I feel like I do most of the work and they don't notice or appreciate it", // Response 3: FeelHeardCheck: Y
    ];
    await sendAndWaitForPanel(harness.userAPage, remainingMessagesA, 'feel-heard-yes', 2);

    // User A confirms feel-heard
    await confirmFeelHeard(harness.userAPage);

    // ==========================================
    // === STAGE 1: USER B WITNESSING ===
    // ==========================================

    // User B sends messages matching reconciler-no-gaps fixture
    const userBStage1Messages = [
      'Things have been tense lately', // Response 0
      "I feel like we've just been miscommunicating", // Response 1
      "I want them to know I still care, even when I'm stressed", // Response 2
      'Exactly. I just want us to be on the same page again', // Response 3: FeelHeardCheck: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage1Messages, 'feel-heard-yes', 4);

    // User B confirms feel-heard
    await confirmFeelHeard(harness.userBPage);

    // ==========================================
    // === STAGE 2: BOTH USERS DRAFT EMPATHY ===
    // ==========================================
    // IMPORTANT: Both users must complete empathy drafting BEFORE either shares.
    // When User A shares empathy, the backend generates a transition message
    // delivered to User B via Ably, which injects an extra AI message into
    // User B's chat and breaks waitForAnyAIResponse's message counting.

    // --- User A empathy draft ---
    // Response 4: Post-feel-heard transition
    // Response 5: ReadyShare: Y with empathy draft
    const userAStage2Messages = [
      'Yes, I feel heard now', // Response 4: post-feel-heard
      'I guess they might be stressed from work too', // Response 5: ReadyShare: Y, empathy draft
    ];

    await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);

    // --- User B empathy draft ---
    // Response 4: Post-feel-heard
    // Response 5: Empathy building
    // Response 6: ReadyShare: Y with empathy draft
    const userBStage2Messages = [
      'Yes, I feel understood', // Response 4: post-feel-heard
      'I think they might be feeling frustrated too', // Response 5: empathy building
      'Maybe they feel like I pull away when stressed and they want to connect', // Response 6: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

    // ==========================================
    // === STAGE 2: BOTH USERS SHARE EMPATHY ===
    // ==========================================
    // User A shares first (has no reconciler operations).
    // User B shares second (triggers reconciler via reconciler-no-gaps fixture).

    // --- User A shares ---
    const empathyReviewButton = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButton).toBeVisible({ timeout: 5000 });
    await empathyReviewButton.click();

    const shareEmpathyButton = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButton).toBeVisible({ timeout: 5000 });
    await shareEmpathyButton.click();

    // Wait for Ably event delivery (User A's share triggers transition message to User B)
    await harness.userAPage.waitForTimeout(2000);

    // --- User B shares (triggers reconciler) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.click();

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.click();

    // ==========================================
    // === RECONCILER COMPLETION ===
    // ==========================================

    // Wait 2s for reconciler trigger, then poll with waitForReconcilerComplete
    await harness.userAPage.waitForTimeout(2000);

    const userAReconcilerComplete = await waitForReconcilerComplete(harness.userAPage, 60000);
    if (!userAReconcilerComplete) {
      // Take diagnostic screenshots if reconciler timeout
      await harness.userAPage.screenshot({ path: 'test-results/full-flow-user-a-reconciler-timeout.png' });
      await harness.userBPage.screenshot({ path: 'test-results/full-flow-user-b-reconciler-timeout.png' });
      throw new Error('Reconciler did not complete within 60s for User A');
    }

    // Also check User B sees empathy-shared indicator
    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await harness.userBPage.screenshot({ path: 'test-results/full-flow-user-b-reconciler-timeout.png' });
      throw new Error('Reconciler did not complete within 60s for User B');
    }

    // ==========================================
    // === STAGE 3: VERIFY SHARE PAGE ===
    // ==========================================

    // Navigate both users to Share tab to verify empathy is displayed
    await navigateToShareFromSession(harness.userAPage);
    await navigateToShareFromSession(harness.userBPage);

    // Both users should see their partner's revealed empathy card
    // TestIDs are dynamic: share-screen-partner-tab-item-partner-empathy-{attemptId}
    // Use .first() since the prefix also matches child elements (-card, -validate-*)
    const userAPartnerEmpathy = harness.userAPage.locator('[data-testid^="share-screen-partner-tab-item-partner-empathy-"]').first();
    const userBPartnerEmpathy = harness.userBPage.locator('[data-testid^="share-screen-partner-tab-item-partner-empathy-"]').first();
    await expect(userAPartnerEmpathy).toBeVisible({ timeout: 10000 });
    await expect(userBPartnerEmpathy).toBeVisible({ timeout: 10000 });

    // Both users should see validation buttons for partner's empathy (Accurate, Partially, Off)
    await expect(harness.userAPage.locator('[data-testid$="-validate-accurate"]')).toBeVisible({ timeout: 5000 });
    await expect(harness.userAPage.locator('[data-testid$="-validate-partial"]')).toBeVisible({ timeout: 5000 });
    await expect(harness.userAPage.locator('[data-testid$="-validate-inaccurate"]')).toBeVisible({ timeout: 5000 });

    await expect(harness.userBPage.locator('[data-testid$="-validate-accurate"]')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.locator('[data-testid$="-validate-partial"]')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.locator('[data-testid$="-validate-inaccurate"]')).toBeVisible({ timeout: 5000 });

    // Take screenshots of Share page with empathy and validation buttons
    await harness.userAPage.screenshot({ path: 'test-results/full-flow-share-a.png' });
    await harness.userBPage.screenshot({ path: 'test-results/full-flow-share-b.png' });

    // ==========================================
    // === STAGE 3: VERIFY CHAT CONTINUES ===
    // ==========================================

    // Navigate both back to chat
    await navigateBackToChat(harness.userAPage);
    await navigateBackToChat(harness.userBPage);

    // Handle mood check that may appear after navigation
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Verify chat input visible for both users (Stage 3 continues conversation)
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });

    // Take final screenshots
    await harness.userAPage.screenshot({ path: 'test-results/full-flow-final-a.png' });
    await harness.userBPage.screenshot({ path: 'test-results/full-flow-final-b.png' });

    // ==========================================
    // SUCCESS: Full partner journey complete
    // ==========================================
    // - Both users completed Stage 0 (compact signing)
    // - Both users completed Stage 1 (witnessing + feel-heard)
    // - Both users completed Stage 2 (empathy drafting + sharing + reconciler)
    // - Both users entered Stage 3 (chat input visible)
  });
});
