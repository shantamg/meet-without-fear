/**
 * Full Partner Journey E2E Test
 *
 * Tests the complete two-user partner journey from Stages 0-4 (complete session).
 * This is the final verification that both users can reliably complete the full
 * partner session together.
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0 (compact signing)
 * - Both users complete Stage 1 (witnessing + feel-heard)
 * - Both users complete Stage 2 (empathy drafting + sharing + reconciler)
 * - Both users complete Stage 3 (needs extraction + common ground)
 * - Both users complete Stage 4 (strategies + ranking + agreement)
 * - Session marked complete after agreement confirmation
 * - Test passes 3 consecutive runs without flakiness
 *
 * This test composes the proven patterns from two-browser-stage-2.spec.ts,
 * two-browser-stage-3.spec.ts, and two-browser-stage-4.spec.ts into a
 * dedicated full-flow test focused on the "proof" use case for milestone validation.
 */

import { test, expect, devices, APIRequestContext } from '@playwright/test';
import { TwoBrowserHarness, getE2EHeaders } from '../helpers';
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

// API base URL for Stage 3-4 operations
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Helper to make authenticated API requests for a specific user
 */
function makeApiRequest(
  request: APIRequestContext,
  userEmail: string,
  userId: string,
  fixtureId?: string
) {
  const headers = getE2EHeaders(userEmail, userId, fixtureId);

  return {
    get: (url: string) => request.get(url, { headers }),
    post: (url: string, data?: object) => request.post(url, { headers, data }),
  };
}

test.describe('Full Partner Journey: Stages 0-4', () => {
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

  test('both users complete full session: Stages 0-4', async ({ browser, request }) => {
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
    // Use JS click to bypass pointer-events: none from typewriter animation wrapper
    await empathyReviewButton.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButton = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButton).toBeVisible({ timeout: 5000 });
    await shareEmpathyButton.evaluate((el: HTMLElement) => el.click());

    // Wait for Ably event delivery (User A's share triggers transition message to User B)
    await harness.userAPage.waitForTimeout(2000);

    // --- User B shares (triggers reconciler) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.evaluate((el: HTMLElement) => el.click());

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

    // Create API helpers for both users (needed for empathy validation and Stage 3-4 ops)
    const apiA = makeApiRequest(
      request,
      harness.config.userA.email,
      harness.userAId,
      harness.config.userA.fixtureId
    );
    const apiB = makeApiRequest(
      request,
      harness.config.userB.email,
      harness.userBId,
      harness.config.userB.fixtureId
    );

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

    // ==========================================
    // === STAGE 2 → STAGE 3 TRANSITION ===
    // ==========================================
    // CRITICAL: Both users must validate each other's empathy to trigger the
    // Stage 3 (Need Mapping) transition. Without this, Stage 3 never begins
    // and the needs extraction API returns empty data.

    await Promise.all([
      apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/empathy/validate`, {
        validated: true,
      }),
      apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/empathy/validate`, {
        validated: true,
      }),
    ]);

    // Allow time for stage transition processing (backend creates Stage 3 progress records)
    await harness.userAPage.waitForTimeout(2000);

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

    // Take screenshots after Stage 2 completion
    await expect(harness.userAPage).toHaveScreenshot('full-flow-01-stage2-complete-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-02-stage2-complete-user-b.png', {
      maxDiffPixels: 500,
    });

    // ==========================================
    // === STAGE 3: NEEDS EXTRACTION ===
    // ==========================================

    // Trigger needs extraction for both users
    await Promise.all([
      apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs`),
      apiB.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs`),
    ]);

    // Wait for extraction to complete
    await harness.userAPage.waitForTimeout(2000);

    // Reload both pages to show needs review UI
    await Promise.all([
      harness.userAPage.reload(),
      harness.userBPage.reload(),
    ]);

    await Promise.all([
      harness.userAPage.waitForLoadState('networkidle'),
      harness.userBPage.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Wait for "Confirm my needs" text to be visible
    await expect(harness.userAPage.getByText('Confirm my needs')).toBeVisible({ timeout: 30000 });
    await expect(harness.userBPage.getByText('Confirm my needs')).toBeVisible({ timeout: 30000 });

    // Screenshot needs review state
    // Note: maxDiffPixels 500 to allow for sub-pixel rendering variance between
    // runs (observed 104px diff at needs-review, 314px diff at common-ground with 100px limit)
    await expect(harness.userAPage).toHaveScreenshot('full-flow-03-needs-review-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-04-needs-review-user-b.png', {
      maxDiffPixels: 500,
    });

    // Get needs for both users
    const needsResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs`);
    const needsDataA = await needsResponseA.json();
    const needsA = needsDataA.data?.needs || [];

    const needsResponseB = await apiB.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs`);
    const needsDataB = await needsResponseB.json();
    const needsB = needsDataB.data?.needs || [];

    // Confirm needs for both users
    if (needsA.length > 0) {
      const needIdsA = needsA.map((n: { id: string }) => n.id);
      await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs/confirm`, {
        needIds: needIdsA,
      });
    }

    if (needsB.length > 0) {
      const needIdsB = needsB.map((n: { id: string }) => n.id);
      await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs/confirm`, {
        needIds: needIdsB,
      });
    }

    // Consent to share needs for both users
    if (needsA.length > 0) {
      await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs/consent`, {
        needIds: needsA.map((n: { id: string }) => n.id),
      });
    }

    if (needsB.length > 0) {
      await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/needs/consent`, {
        needIds: needsB.map((n: { id: string }) => n.id),
      });
    }

    // Poll common ground endpoint until commonGround.length > 0
    let commonGroundComplete = false;
    const cgDeadline = Date.now() + 30000; // 30s timeout
    let cgAttempts = 0;

    while (Date.now() < cgDeadline && !commonGroundComplete) {
      cgAttempts++;
      const cgResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/common-ground`);
      const cgData = await cgResponse.json();

      if (cgData.data?.commonGround && cgData.data.commonGround.length > 0) {
        commonGroundComplete = true;
      } else {
        await harness.userAPage.waitForTimeout(2000);
      }
    }

    if (!commonGroundComplete) {
      throw new Error('Common ground analysis did not complete within 30s');
    }

    // Reload both pages to show common ground UI
    await Promise.all([
      harness.userAPage.reload(),
      harness.userBPage.reload(),
    ]);

    await Promise.all([
      harness.userAPage.waitForLoadState('networkidle'),
      harness.userBPage.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Verify "Shared Needs Discovered" text visible
    await expect(harness.userAPage.getByText(/Shared Needs Discovered/i)).toBeVisible({ timeout: 10000 });
    await expect(harness.userBPage.getByText(/Shared Needs Discovered/i)).toBeVisible({ timeout: 10000 });

    // Screenshot common ground state
    await expect(harness.userAPage).toHaveScreenshot('full-flow-05-common-ground-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-06-common-ground-user-b.png', {
      maxDiffPixels: 500,
    });

    // ==========================================
    // === STAGE 3 → STAGE 4 TRANSITION ===
    // ==========================================
    // CRITICAL: Both users must confirm all common ground items AND call stages/advance
    // to advance from Stage 3 to Stage 4. Without this, proposeStrategy returns 400
    // "Cannot propose strategy: you are in stage 3, but stage 4 is required".

    // Get common ground IDs for both users (use apiA since it's a shared vessel)
    const finalCgResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/common-ground`);
    const finalCgData = await finalCgResponse.json();
    const commonGroundItems = finalCgData.data?.commonGround || [];
    const commonGroundIds = commonGroundItems.map((cg: { id: string }) => cg.id);

    if (commonGroundIds.length > 0) {
      // Both users confirm all common ground items
      await Promise.all([
        apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/common-ground/confirm`, {
          commonGroundIds,
        }),
        apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/common-ground/confirm`, {
          commonGroundIds,
        }),
      ]);
    }

    // Allow stage confirmation to process
    await harness.userAPage.waitForTimeout(1000);

    // Both users advance from Stage 3 to Stage 4
    const advanceResponseA = await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/stages/advance`);
    const advanceDataA = await advanceResponseA.json();

    // If User A is blocked (partner not ready), advance User B first
    if (!advanceDataA.data?.advanced && advanceDataA.data?.blockedReason === 'PARTNER_NOT_READY') {
      await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/stages/advance`);
      await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/stages/advance`);
    } else {
      await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/stages/advance`);
    }

    // Allow stage advancement to propagate
    await harness.userAPage.waitForTimeout(1000);

    // ==========================================
    // === STAGE 4: STRATEGIES & AGREEMENT ===
    // ==========================================

    // Propose strategies via API - User A proposes 2, User B proposes 1 (3 total)
    await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies`, {
      description: 'Have a 10-minute phone-free conversation at dinner each day',
      needsAddressed: ['Connection', 'Recognition'],
    });

    await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies`, {
      description: 'Use a pause signal when conversations get heated',
      needsAddressed: ['Safety', 'Connection'],
    });

    await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies`, {
      description: 'Say one specific thing I appreciate each morning',
      needsAddressed: ['Recognition'],
    });

    // Verify 3 strategies via GET endpoint
    const strategiesResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies`);
    const strategiesData = await strategiesResponse.json();
    const strategies = strategiesData.data?.strategies || [];
    expect(strategies.length).toBe(3);

    // Reload pages to show strategy pool
    await Promise.all([
      harness.userAPage.reload(),
      harness.userBPage.reload(),
    ]);

    await Promise.all([
      harness.userAPage.waitForLoadState('networkidle'),
      harness.userBPage.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Screenshot strategy pool
    await expect(harness.userAPage).toHaveScreenshot('full-flow-07-strategy-pool-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-08-strategy-pool-user-b.png', {
      maxDiffPixels: 500,
    });

    // Mark both users ready via POST /strategies/ready
    await Promise.all([
      apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies/ready`),
      apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies/ready`),
    ]);

    // Get strategy IDs from GET endpoint
    const strategy1 = strategies[0];
    const strategy2 = strategies[1];
    const strategy3 = strategies[2];

    // Submit rankings for both users - both rank strategy1 first for guaranteed overlap
    await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies/rank`, {
      rankedIds: [strategy1.id, strategy2.id, strategy3.id],
    });

    const rankBResponse = await apiB.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies/rank`, {
      rankedIds: [strategy1.id, strategy3.id, strategy2.id],
    });
    const rankBData = await rankBResponse.json();

    // Verify canReveal: true from User B's ranking response
    expect(rankBData.data?.canReveal).toBe(true);

    // Get overlap via GET /strategies/overlap
    const overlapResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${harness.sessionId}/strategies/overlap`);
    const overlapData = await overlapResponse.json();
    const overlapStrategies = overlapData.data?.overlap || [];

    // Verify at least 1 overlap strategy
    expect(overlapStrategies.length).toBeGreaterThanOrEqual(1);

    // Reload pages to show overlap
    await Promise.all([
      harness.userAPage.reload(),
      harness.userBPage.reload(),
    ]);

    await Promise.all([
      harness.userAPage.waitForLoadState('networkidle'),
      harness.userBPage.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Screenshot overlap reveal
    await expect(harness.userAPage).toHaveScreenshot('full-flow-09-overlap-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-10-overlap-user-b.png', {
      maxDiffPixels: 500,
    });

    // Create agreement via POST /agreements using first overlap strategy
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 7); // 7 days from now

    const agreementResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${harness.sessionId}/agreements`, {
      strategyId: overlapStrategies[0].id,
      description: overlapStrategies[0].description,
      type: 'MICRO_EXPERIMENT',
      followUpDate: followUpDate.toISOString(),
    });
    const agreementData = await agreementResponse.json();
    const agreementId = agreementData.data?.agreement?.id;

    // Confirm agreement via POST /agreements/{agreementId}/confirm as User B
    const confirmResponse = await apiB.post(
      `${API_BASE_URL}/api/sessions/${harness.sessionId}/agreements/${agreementId}/confirm`,
      { confirmed: true }
    );
    const confirmData = await confirmResponse.json();

    // Verify sessionComplete: true
    expect(confirmData.data?.sessionComplete).toBe(true);

    // Reload pages to show final agreement state
    await Promise.all([
      harness.userAPage.reload(),
      harness.userBPage.reload(),
    ]);

    await Promise.all([
      harness.userAPage.waitForLoadState('networkidle'),
      harness.userBPage.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(harness.userAPage);
    await handleMoodCheck(harness.userBPage);

    // Screenshot final agreement state
    await expect(harness.userAPage).toHaveScreenshot('full-flow-11-agreement-user-a.png', {
      maxDiffPixels: 500,
    });
    await expect(harness.userBPage).toHaveScreenshot('full-flow-12-agreement-user-b.png', {
      maxDiffPixels: 500,
    });

    // ==========================================
    // SUCCESS: Full partner journey complete
    // ==========================================
    // - Both users completed Stage 0 (compact signing)
    // - Both users completed Stage 1 (witnessing + feel-heard)
    // - Both users completed Stage 2 (empathy drafting + sharing + reconciler)
    // - Both users completed Stage 3 (needs extraction + common ground)
    // - Both users completed Stage 4 (strategies + ranking + agreement)
    // - Session marked complete (sessionComplete: true)
  });
});
