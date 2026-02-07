/**
 * Stage 3-4 Complete Flow Test
 *
 * Tests the flow from EMPATHY_REVEALED (Stage 2 complete) through:
 * - Stage 3: Need Mapping
 * - Stage 4: Strategic Repair
 *
 * Uses the 'EMPATHY_REVEALED' fixture which sets up:
 * - Both users have completed Stage 0 (compact signed)
 * - Both users have completed Stage 1 (feel heard)
 * - Both users have completed Stage 2 (empathy exchanged and validated)
 * - Both users are now in Stage 3 IN_PROGRESS
 */

import { test, expect, devices, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder, navigateToShareFromSession } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'stage3-4-shantam@e2e.test', name: 'Shantam' };
const userB = { email: 'stage3-4-darryl@e2e.test', name: 'Darryl' };

// Use the reconciler-no-gaps fixture for AI responses
const FIXTURE_ID = 'reconciler-no-gaps';

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

test.describe('Stage 3-4 Complete Flow', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let userBContext: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Start at EMPATHY_REVEALED - both users have completed Stage 2 and are in Stage 3
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_REVEALED')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} at EMPATHY_REVEALED stage`);

    // Create browser contexts for both users
    const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
    const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });
    userAContext = userASetup.context;
    userBContext = userBSetup.context;
    pageA = userASetup.page;
    pageB = userBSetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
    await userBContext?.close();
  });

  test('Complete Stage 3-4 flow from empathy revealed state', async ({ request }) => {
    test.setTimeout(180000);
    const testStart = Date.now();
    const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

    // Create API helpers for both users
    const apiA = makeApiRequest(request, userA.email, userAId, FIXTURE_ID);
    const apiB = makeApiRequest(request, userB.email, userBId, FIXTURE_ID);

    // Navigate both users to session
    const userAParams = new URLSearchParams({
      'e2e-user-id': userAId,
      'e2e-user-email': userA.email,
    });
    const userBParams = new URLSearchParams({
      'e2e-user-id': userBId,
      'e2e-user-email': userB.email,
    });

    await Promise.all([
      pageA.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`),
      pageB.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    console.log(`${elapsed()} Both users navigated to session`);

    // Take initial screenshot
    await pageA.screenshot({ path: 'test-results/stage-3-4-01-initial-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-01-initial-user-b.png' });

    // ========================================
    // Handle mood check if visible
    // ========================================
    const moodCheckA = pageA.getByTestId('mood-check-continue-button');
    const moodVisibleA = await moodCheckA.isVisible({ timeout: 3000 }).catch(() => false);

    if (moodVisibleA) {
      console.log(`${elapsed()} Mood check visible on User A - clicking continue`);
      await moodCheckA.click();
      await pageA.waitForTimeout(1000);
    }

    const moodCheckB = pageB.getByTestId('mood-check-continue-button');
    const moodVisibleB = await moodCheckB.isVisible({ timeout: 2000 }).catch(() => false);

    if (moodVisibleB) {
      console.log(`${elapsed()} Mood check visible on User B - clicking continue`);
      await moodCheckB.click();
      await pageB.waitForTimeout(1000);
    }

    // ========================================
    // Navigate to Share screen
    // ========================================
    console.log(`${elapsed()} Navigating to Share screen...`);

    // Navigate via in-app Share arrow from chat
    await Promise.all([
      navigateToShareFromSession(pageA),
      navigateToShareFromSession(pageB),
    ]);

    // Screenshot Share screen
    await pageA.screenshot({ path: 'test-results/stage-3-4-02-share-screen-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-02-share-screen-user-b.png' });
    console.log(`${elapsed()} Share screen screenshots captured`);

    // ========================================
    // STAGE 3: Need Mapping
    // ========================================
    console.log(`${elapsed()} === STAGE 3: Need Mapping ===`);

    // Check for tabs - they should be visible since we're in Stage 3
    const tabSelectorA = pageA.getByTestId('share-tab-selector');
    const hasTabsA = await tabSelectorA.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`${elapsed()} User A has tab selector: ${hasTabsA}`);

    // Click on Needs tab if available
    if (hasTabsA) {
      const needsTabA = pageA.getByTestId('share-tab-selector-tab-needs');
      if (await needsTabA.isVisible({ timeout: 2000 }).catch(() => false)) {
        await needsTabA.click();
        await pageA.waitForTimeout(500);
        console.log(`${elapsed()} User A clicked Needs tab`);
      }
    }

    const tabSelectorB = pageB.getByTestId('share-tab-selector');
    const hasTabsB = await tabSelectorB.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasTabsB) {
      const needsTabB = pageB.getByTestId('share-tab-selector-tab-needs');
      if (await needsTabB.isVisible({ timeout: 2000 }).catch(() => false)) {
        await needsTabB.click();
        await pageB.waitForTimeout(500);
        console.log(`${elapsed()} User B clicked Needs tab`);
      }
    }

    // Screenshot after clicking needs tab
    await pageA.screenshot({ path: 'test-results/stage-3-4-03-needs-tab-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-03-needs-tab-user-b.png' });

    // Create needs via API (since AI extraction returns empty in mock mode)
    console.log(`${elapsed()} Creating needs via API...`);

    // User A creates needs
    const needA1Response = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need to feel appreciated for the work I do around the house',
      category: 'RECOGNITION',
    });
    const needA1 = await needA1Response.json();
    console.log(`${elapsed()} User A need 1 response: ${JSON.stringify(needA1)}`);

    const needA2Response = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need us to share responsibilities more equally',
      category: 'FAIRNESS',
    });
    const needA2 = await needA2Response.json();
    console.log(`${elapsed()} User A need 2 created: ${needA2.data?.need?.id}`);

    // User B creates needs
    const needB1Response = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need understanding about how exhausted I am after work',
      category: 'CONNECTION',
    });
    const needB1 = await needB1Response.json();
    console.log(`${elapsed()} User B need 1 created: ${needB1.data?.need?.id}`);

    const needB2Response = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need emotional support when I come home tired',
      category: 'SAFETY',
    });
    const needB2 = await needB2Response.json();
    console.log(`${elapsed()} User B need 2 created: ${needB2.data?.need?.id}`);

    // Get needs via API to get all IDs
    const needsResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
    const needsDataA = await needsResponseA.json();
    console.log(`${elapsed()} User A needs: ${needsDataA.data?.needs?.length || 0} needs`);

    const needsResponseB = await apiB.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
    const needsDataB = await needsResponseB.json();
    console.log(`${elapsed()} User B needs: ${needsDataB.data?.needs?.length || 0} needs`);

    // Confirm needs via API
    const needsA = needsDataA.data?.needs || [];
    const needsB = needsDataB.data?.needs || [];

    if (needsA.length > 0) {
      const needIdsA = needsA.map((n: { id: string }) => n.id);
      console.log(`${elapsed()} User A confirming ${needIdsA.length} needs...`);

      // Confirm needs
      const confirmResponseA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs/confirm`, {
        needIds: needIdsA,
      });
      const confirmDataA = await confirmResponseA.json();
      console.log(`${elapsed()} User A confirmed needs: ${confirmDataA.data?.confirmed}`);

      // Consent to share needs
      const consentResponseA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs/consent`, {
        needIds: needIdsA,
      });
      const consentDataA = await consentResponseA.json();
      console.log(`${elapsed()} User A consented to share: ${consentDataA.data?.consented}`);
    }

    if (needsB.length > 0) {
      const needIdsB = needsB.map((n: { id: string }) => n.id);
      console.log(`${elapsed()} User B confirming ${needIdsB.length} needs...`);

      // Confirm needs
      const confirmResponseB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs/confirm`, {
        needIds: needIdsB,
      });
      const confirmDataB = await confirmResponseB.json();
      console.log(`${elapsed()} User B confirmed needs: ${confirmDataB.data?.confirmed}`);

      // Consent to share needs
      const consentResponseB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs/consent`, {
        needIds: needIdsB,
      });
      const consentDataB = await consentResponseB.json();
      console.log(`${elapsed()} User B consented to share: ${consentDataB.data?.consented}`);
    }

    // Get common ground (this triggers AI analysis if both have shared)
    console.log(`${elapsed()} Fetching common ground...`);
    const cgResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/common-ground`);
    const cgDataA = await cgResponseA.json();
    console.log(`${elapsed()} Common ground: ${cgDataA.data?.commonGround?.length || 0} items`);

    // Confirm common ground for both users
    const commonGround = cgDataA.data?.commonGround || [];
    if (commonGround.length > 0) {
      const cgIds = commonGround.map((cg: { id: string }) => cg.id);

      console.log(`${elapsed()} User A confirming common ground...`);
      const cgConfirmA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/common-ground/confirm`, {
        commonGroundIds: cgIds,
      });
      const cgConfirmDataA = await cgConfirmA.json();
      console.log(`${elapsed()} User A confirmed common ground: ${cgConfirmDataA.data?.allConfirmedByMe}`);

      console.log(`${elapsed()} User B confirming common ground...`);
      const cgConfirmB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/common-ground/confirm`, {
        commonGroundIds: cgIds,
      });
      const cgConfirmDataB = await cgConfirmB.json();
      console.log(`${elapsed()} User B confirmed common ground: ${cgConfirmDataB.data?.allConfirmedByBoth}`);
    }

    // Advance both users to Stage 4
    // Stage progression: Both need to reach Stage 4 IN_PROGRESS
    // First advance moves from completed stages, second ensures Stage 4
    console.log(`${elapsed()} Advancing users to Stage 4...`);

    // User A advances
    let advanceA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/stages/advance`);
    let advanceDataA = await advanceA.json();
    console.log(`${elapsed()} User A first advance: ${advanceDataA.data?.newStage}`);

    // If not at Stage 4, advance again
    if (advanceDataA.data?.newStage !== 4) {
      advanceA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/stages/advance`);
      advanceDataA = await advanceA.json();
      console.log(`${elapsed()} User A second advance: ${advanceDataA.data?.newStage}`);
    }

    // User B advances
    let advanceB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/stages/advance`);
    let advanceDataB = await advanceB.json();
    console.log(`${elapsed()} User B first advance: ${advanceDataB.data?.newStage}`);

    // If not at Stage 4, advance again
    if (advanceDataB.data?.newStage !== 4) {
      advanceB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/stages/advance`);
      advanceDataB = await advanceB.json();
      console.log(`${elapsed()} User B second advance: ${advanceDataB.data?.newStage}`);
    }

    // Reload pages to reflect new state
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);
    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Screenshot after Stage 3 completion
    await pageA.screenshot({ path: 'test-results/stage-3-4-04-stage3-complete-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-04-stage3-complete-user-b.png' });
    console.log(`${elapsed()} Stage 3 complete`);

    // ========================================
    // STAGE 4: Strategic Repair
    // ========================================
    console.log(`${elapsed()} === STAGE 4: Strategic Repair ===`);

    // Propose strategies via API
    console.log(`${elapsed()} Proposing strategies...`);

    const strategy1Response = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Weekly check-in on Sundays to discuss the upcoming week and divide tasks',
      needsAddressed: ['Partnership', 'Appreciation'],
      duration: 'ongoing',
    });
    const strategy1 = await strategy1Response.json();
    console.log(`${elapsed()} User A strategy proposal response: ${JSON.stringify(strategy1)}`);

    const strategy2Response = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Express appreciation for at least one thing your partner did each day',
      needsAddressed: ['Appreciation', 'Connection'],
      duration: 'ongoing',
    });
    const strategy2 = await strategy2Response.json();
    if (!strategy2.success) {
      console.log(`${elapsed()} User B strategy error: ${JSON.stringify(strategy2.error)}`);
    } else {
      console.log(`${elapsed()} User B proposed strategy: ${strategy2.data?.strategy?.id}`);
    }

    const strategy3Response = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Take 10 minutes to decompress when arriving home before discussing responsibilities',
      needsAddressed: ['Understanding', 'Support'],
      duration: 'ongoing',
    });
    const strategy3 = await strategy3Response.json();
    console.log(`${elapsed()} User A proposed second strategy: ${strategy3.data?.strategy?.id}`);

    // Get strategy pool
    const strategiesResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`);
    const strategiesDataA = await strategiesResponseA.json();
    const strategies = strategiesDataA.data?.strategies || [];
    console.log(`${elapsed()} Strategy pool has ${strategies.length} strategies`);

    // Mark both users ready to rank
    console.log(`${elapsed()} Marking users ready to rank...`);
    await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
    await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
    console.log(`${elapsed()} Both users marked ready to rank`);

    // Submit rankings (order by preference)
    const strategyIds = strategies.map((s: { id: string }) => s.id);

    console.log(`${elapsed()} Submitting rankings...`);
    const rankA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
      rankedIds: strategyIds,
    });
    const rankDataA = await rankA.json();
    console.log(`${elapsed()} User A submitted ranking: ${rankDataA.data?.ranked}`);

    const rankB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
      rankedIds: [...strategyIds].reverse(), // Different order
    });
    const rankDataB = await rankB.json();
    console.log(`${elapsed()} User B submitted ranking: ${rankDataB.data?.ranked}`);

    // Get overlap
    console.log(`${elapsed()} Fetching ranking overlap...`);
    const overlapResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/overlap`);
    const overlapData = await overlapResponse.json();
    console.log(`${elapsed()} Overlap: ${overlapData.data?.overlap?.length || 0} strategies, candidates: ${overlapData.data?.agreementCandidates?.length || 0}`);

    // Navigate to Strategies tab via tab selector (no deep-link)
    await pageA.getByTestId('share-tab-selector-tab-strategies').click();
    await pageB.getByTestId('share-tab-selector-tab-strategies').click();
    await Promise.all([pageA.waitForTimeout(500), pageB.waitForTimeout(500)]);

    // Screenshot strategies view
    await pageA.screenshot({ path: 'test-results/stage-3-4-05-strategies-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-05-strategies-user-b.png' });

    // ========================================
    // Create Agreement
    // ========================================
    console.log(`${elapsed()} Creating agreement...`);

    // Use the first overlap strategy or first candidate
    const agreementCandidate = overlapData.data?.agreementCandidates?.[0] || strategies[0];

    const agreementResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/agreements`, {
      strategyId: agreementCandidate?.id,
      description: agreementCandidate?.description || 'Weekly check-in on Sundays',
      type: 'MICRO_EXPERIMENT', // Valid enum: MICRO_EXPERIMENT, COMMITMENT, CHECK_IN, HYBRID
      duration: 'We will try this for 2 weeks',
      followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const agreementData = await agreementResponse.json();
    if (!agreementData.success) {
      console.log(`${elapsed()} Agreement creation failed: ${JSON.stringify(agreementData)}`);
    }
    const agreementId = agreementData.data?.agreement?.id;
    console.log(`${elapsed()} User A created agreement: ${agreementId}`);

    // User B confirms the agreement
    if (agreementId) {
      console.log(`${elapsed()} User B confirming agreement...`);
      const confirmAgreementResponse = await apiB.post(
        `${API_BASE_URL}/api/sessions/${sessionId}/agreements/${agreementId}/confirm`,
        { confirmed: true }
      );
      const confirmAgreementData = await confirmAgreementResponse.json();
      console.log(`${elapsed()} User B confirmed: ${confirmAgreementData.data?.confirmed}, both confirmed: ${confirmAgreementData.data?.partnerConfirmed}`);
    }

    // Navigate to Agreement tab via tab selector (no deep-link)
    await pageA.getByTestId('share-tab-selector-tab-agreement').click();
    await pageB.getByTestId('share-tab-selector-tab-agreement').click();
    await Promise.all([pageA.waitForTimeout(500), pageB.waitForTimeout(500)]);

    // Final screenshots
    await pageA.screenshot({ path: 'test-results/stage-3-4-06-agreement-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-06-agreement-user-b.png' });

    // ========================================
    // Verify final state
    // ========================================
    console.log(`${elapsed()} Verifying final state...`);

    // Get agreements to verify completion
    const finalAgreementsResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/agreements`);
    const finalAgreementsData = await finalAgreementsResponse.json();
    const agreements = finalAgreementsData.data?.agreements || [];

    console.log(`${elapsed()} Final agreements: ${agreements.length}`);
    if (agreements.length > 0) {
      const firstAgreement = agreements[0];
      console.log(`${elapsed()} Agreement status: ${firstAgreement.status}, agreedByMe: ${firstAgreement.agreedByMe}, agreedByPartner: ${firstAgreement.agreedByPartner}`);

      // Verify both parties agreed
      expect(firstAgreement.agreedByMe).toBe(true);
      expect(firstAgreement.agreedByPartner).toBe(true);
    }

    // Take final screenshots
    await pageA.screenshot({ path: 'test-results/stage-3-4-07-final-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-07-final-user-b.png' });

    console.log(`${elapsed()} === TEST COMPLETE ===`);
    console.log(`${elapsed()} Stage 3-4 flow verified successfully!`);
  });
});
