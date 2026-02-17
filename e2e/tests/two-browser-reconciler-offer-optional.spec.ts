/**
 * Two Browser Reconciler OFFER_OPTIONAL Test
 *
 * Tests the full OFFER_OPTIONAL reconciler path where:
 * - Both users complete Stage 0+1 (compact, feel-heard)
 * - Both users draft empathy statements (Stage 2)
 * - User A shares empathy first (guesser)
 * - User B shares empathy second (subject, triggers reconciler)
 * - Reconciler returns OFFER_OPTIONAL (moderate gaps)
 * - Subject sees ShareTopicPanel (blue, soft language)
 * - Subject can decline (with confirmation) or accept
 * - This test covers the DECLINE path
 * - Context-already-shared guard prevents duplicate panels on re-navigation
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0+1+2 prerequisite
 * - Reconciler completes with OFFER_OPTIONAL result
 * - Subject sees ShareTopicPanel (blue styling, "might consider sharing")
 * - Subject can open ShareTopicDrawer
 * - Subject can decline with Alert confirmation
 * - Guesser sees normal reveal (information boundary preserved)
 * - No duplicate panels appear on re-navigation (context-already-shared guard)
 * - All key states captured in screenshots
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

test.describe('Reconciler: OFFER_OPTIONAL Path', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A (guesser) and User B (subject)
    // User A shares first (no reconciler operations)
    // User B shares second (triggers reconciler with OFFER_OPTIONAL fixture)
    harness = new TwoBrowserHarness({
      userA: {
        email: 'offer-optional-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'offer-optional-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-offer-optional',
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

  test('subject sees ShareTopicPanel, declines with confirmation, guesser sees normal reveal, no duplicate panel on re-navigation', async ({
    browser,
    request,
  }) => {
    test.setTimeout(900000); // 15 minutes - Stage 2 requires 13 AI interactions

    // ==========================================
    // STAGE 0 PREREQUISITE
    // ==========================================

    // Set up User B after session is created
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
    // STAGE 1: USER A WITNESSING
    // ==========================================

    // User A sends messages matching user-a-full-journey fixture
    const userAStage1Messages = [
      "Hi, I'm having a conflict with my partner", // Response 0
      'We keep arguing about household chores', // Response 1: invitation panel
      'Thanks, I sent the invitation', // Response 2
      "I feel like I do most of the work and they don't notice or appreciate it", // Response 3: FeelHeardCheck: Y
    ];

    // Send first 2 messages to trigger invitation panel
    for (let i = 0; i < 2; i++) {
      const chatInput = harness.userAPage.getByTestId('chat-input');
      const sendButton = harness.userAPage.getByTestId('send-button');
      await chatInput.fill(userAStage1Messages[i]);
      await sendButton.click();
      await expect(harness.userAPage.getByTestId('typing-indicator')).not.toBeVisible({
        timeout: 60000,
      });
      await harness.userAPage.waitForTimeout(500);
    }

    // Dismiss invitation panel
    const dismissInvitation = harness.userAPage.getByText("I've sent it - Continue");
    if (await dismissInvitation.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dismissInvitation.click();
      await harness.userAPage.waitForTimeout(500);
    }

    // Send remaining messages until feel-heard panel
    const remainingMessagesA = userAStage1Messages.slice(2);
    await sendAndWaitForPanel(
      harness.userAPage,
      remainingMessagesA,
      'feel-heard-yes',
      remainingMessagesA.length
    );

    // User A confirms feel-heard
    await confirmFeelHeard(harness.userAPage);

    // ==========================================
    // STAGE 1: USER B WITNESSING
    // ==========================================

    // User B sends messages matching reconciler-offer-optional fixture
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
    // STAGE 2: BOTH USERS DRAFT EMPATHY
    // ==========================================
    // IMPORTANT: Both users must complete empathy drafting BEFORE either shares

    // --- User A empathy draft ---
    const userAStage2Messages = [
      'Yes, I feel heard now', // Response 4
      'I guess they might be stressed from work too', // Response 5: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);

    // --- User B empathy draft ---
    const userBStage2Messages = [
      'Yes, I feel understood', // Response 4
      'I think they might be feeling frustrated too', // Response 5
      'Maybe they feel like I pull away when stressed and they want to connect', // Response 6: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

    // ==========================================
    // STAGE 2: BOTH USERS SHARE EMPATHY
    // ==========================================

    // --- User A shares (guesser) ---
    const empathyReviewButtonA = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonA).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonA.click();

    const shareEmpathyButtonA = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonA).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonA.click();

    // Wait for Ably propagation
    await harness.userAPage.waitForTimeout(3000);

    // --- User B shares (subject, triggers reconciler) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.click();

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.click();

    // ==========================================
    // WAIT FOR RECONCILER COMPLETION
    // ==========================================

    // Wait for reconciler to complete (60s timeout)
    await harness.userBPage.waitForTimeout(2000);

    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await expect(harness.userAPage).toHaveScreenshot('offer-optional-reconciler-timeout-a.png', {
        maxDiffPixels: 100,
      });
      await expect(harness.userBPage).toHaveScreenshot('offer-optional-reconciler-timeout-b.png', {
        maxDiffPixels: 100,
      });
      throw new Error('Reconciler did not complete within 60s for User B');
    }

    // ==========================================
    // SCREENSHOT CHECKPOINT 1 - After Reconciler
    // ==========================================

    // Wait for Ably propagation
    await harness.userBPage.waitForTimeout(3000);

    // Screenshot User A (guesser): Should show waiting banner or status
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-01-guesser-waiting.png', {
      maxDiffPixels: 100,
    });

    // Screenshot User B (subject): May show "Almost There" modal first
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-01-subject-modal.png', {
      maxDiffPixels: 100,
    });

    // Dismiss "Almost There" modal if it appears (guesser perspective)
    const partnerEventModal = harness.userBPage.getByTestId('partner-event-modal');
    if (await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      const gotItButton = harness.userBPage.getByTestId('partner-event-modal-view');
      await gotItButton.click();
      await harness.userBPage.waitForTimeout(1000);
    }

    // Screenshot after modal dismissed
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-01-subject-panel.png', {
      maxDiffPixels: 100,
    });

    // ==========================================
    // SUBJECT OPENS SHARETOPIC DRAWER
    // ==========================================

    // Wait for typing indicator to disappear (typewriter animation complete)
    const typingIndicator = harness.userBPage.getByTestId('typing-indicator');
    await expect(typingIndicator).not.toBeVisible({ timeout: 60000 });

    // Wait additional time for animations to complete
    await harness.userBPage.waitForTimeout(2000);

    // Now look for ShareTopicPanel
    const shareTopicPanel = harness.userBPage.getByTestId('share-topic-panel');

    // Try to click directly (skip scrollIntoViewIfNeeded which hangs on invisible elements)
    // The panel should be in the above-input area which is visible at the bottom
    await shareTopicPanel.click({ force: true, timeout: 10000 });
    await harness.userBPage.waitForTimeout(1000);

    // Assert ShareTopicDrawer is visible
    const shareTopicDrawer = harness.userBPage.getByTestId('share-topic-drawer');
    await expect(shareTopicDrawer).toBeVisible({ timeout: 5000 });

    // Assert contains OFFER_OPTIONAL language (soft, "might consider")
    await expect(harness.userBPage.getByText(/might consider sharing/i)).toBeVisible({
      timeout: 5000,
    });

    // Screenshot drawer
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-02-subject-drawer.png', {
      maxDiffPixels: 100,
    });

    // ==========================================
    // OFFER_OPTIONAL DECLINE PATH
    // ==========================================

    // Set up dialog handler BEFORE clicking decline button
    harness.userBPage.on('dialog', async (dialog) => {
      // Verify it's a confirmation dialog
      expect(dialog.type()).toBe('alert');
      // Accept the "Continue without sharing" option
      await dialog.accept();
    });

    // Click decline button
    const declineButton = harness.userBPage.getByTestId('share-topic-decline');
    await expect(declineButton).toBeVisible({ timeout: 5000 });
    await declineButton.click();

    // Wait for dialog to be handled and drawer to close
    await harness.userBPage.waitForTimeout(2000);

    // Assert ShareTopicDrawer is no longer visible
    await expect(shareTopicDrawer).not.toBeVisible({ timeout: 5000 });

    // Wait for Ably propagation
    await harness.userBPage.waitForTimeout(3000);

    // Screenshot both users after decline
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-03-subject-after-decline.png', {
      maxDiffPixels: 100,
    });
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-03-guesser-after-decline.png', {
      maxDiffPixels: 100,
    });

    // ==========================================
    // WAIT FOR EMPATHY REVEAL
    // ==========================================

    // Both users should enter reveal phase
    const userARevealed = await waitForReconcilerComplete(harness.userAPage, 60000);
    if (!userARevealed) {
      throw new Error('User A did not see empathy-shared indicator');
    }

    // Screenshot after reveal
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-04-guesser-revealed.png', {
      maxDiffPixels: 100,
    });
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-04-subject-revealed.png', {
      maxDiffPixels: 100,
    });

    // ==========================================
    // NAVIGATE TO SHARE TAB
    // ==========================================

    // Both users navigate to Share screen
    await navigateToShareFromSession(harness.userAPage);
    await navigateToShareFromSession(harness.userBPage);

    // Screenshot Share screens
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-05-guesser-share.png', {
      maxDiffPixels: 100,
    });
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-05-subject-share.png', {
      maxDiffPixels: 100,
    });

    // Navigate back to Chat to verify content persistence
    await navigateBackToChat(harness.userAPage);
    await navigateBackToChat(harness.userBPage);

    // Handle mood check if it appears
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Verify chat input still visible (persistence)
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });

    // ==========================================
    // CONTEXT-ALREADY-SHARED GUARD TEST
    // ==========================================

    // Navigate User B back to Share page
    await navigateToShareFromSession(harness.userBPage);

    // Wait a moment for any panels to appear
    await harness.userBPage.waitForTimeout(2000);

    // Assert no ShareTopicPanel is visible (guard prevents duplicate)
    const duplicatePanel = harness.userBPage.getByTestId('share-topic-panel');
    await expect(duplicatePanel).not.toBeVisible({ timeout: 2000 });

    // Screenshot to document guard behavior
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-06-subject-no-duplicate-panel.png', {
      maxDiffPixels: 100,
    });

    // Navigate back to Chat for final state
    await navigateBackToChat(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // Final screenshots
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-07-guesser-final.png', {
      maxDiffPixels: 100,
    });
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-07-subject-final.png', {
      maxDiffPixels: 100,
    });

    // ==========================================
    // SUCCESS
    // ==========================================
    // - Both users completed Stage 0+1+2
    // - Reconciler returned OFFER_OPTIONAL (moderate gaps)
    // - Subject saw ShareTopicPanel (blue, soft language)
    // - Subject opened ShareTopicDrawer
    // - Subject declined with Alert confirmation
    // - Guesser saw normal reveal (information boundary preserved)
    // - Context-already-shared guard prevented duplicate panel
    // - All key states captured in screenshots
  });
});
