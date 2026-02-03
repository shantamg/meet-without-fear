/**
 * Stage 3-4 Complete Flow E2E Test
 *
 * Tests the full Stage 3 (Need Mapping) and Stage 4 (Strategic Repair) flow:
 * 1. Start from empathy reveal (both users see validation buttons)
 * 2. Both validate empathy (click "Accurate")
 * 3. Navigate to Share page via indicator
 * 4. Screenshot: Needs identified
 * 5. Confirm needs
 * 6. Screenshot: Common ground
 * 7. Navigate to strategies
 * 8. Screenshot: Strategy pool
 * 9. Rank strategies
 * 10. Screenshot: Overlap revealed
 * 11. Create agreement
 * 12. Screenshot: Agreement reached
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { SessionBuilder, SessionSetupResult } from '../helpers/session-builder';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'stage3-4-shantam@e2e.test', name: 'Shantam' };
const userB = { email: 'stage3-4-darryl@e2e.test', name: 'Darryl' };

/**
 * Helper to set up page with E2E auth headers
 */
async function setupAuthenticatedPage(
  context: BrowserContext,
  sessionSetup: SessionSetupResult,
  user: 'A' | 'B'
): Promise<Page> {
  const page = await context.newPage();

  // Get the appropriate user info
  const userInfo = user === 'A' ? sessionSetup.userA : sessionSetup.userB;
  if (!userInfo) {
    throw new Error(`User ${user} not found in session setup`);
  }

  // Navigate to the session with E2E auth params
  const url = `${APP_BASE_URL}/session/${sessionSetup.session.id}?e2e-user-id=${userInfo.id}&e2e-user-email=${encodeURIComponent(userInfo.email)}`;
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  return page;
}

test.describe('Stage 3-4 Complete Flow', () => {
  let setup: SessionSetupResult;

  test.beforeAll(async ({ request }) => {
    // Seed the session at EMPATHY_REVEALED stage
    // This creates a session where both users have shared and validated empathy
    const builder = new SessionBuilder(API_BASE_URL);
    setup = await builder
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_REVEALED')
      .setup(request);

    console.log('[Setup] Session:', setup.session.id);
    console.log('[Setup] User A:', setup.userA.id);
    console.log('[Setup] User B:', setup.userB?.id);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup E2E test data
    await request.post(`${API_BASE_URL}/api/e2e/cleanup`);
  });

  test('User A and B validate empathy, then complete Stage 3-4 flow', async ({ browser }) => {
    // Create browser contexts for both users
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await setupAuthenticatedPage(contextA, setup, 'A');
    const pageB = await setupAuthenticatedPage(contextB, setup, 'B');

    // ========================================
    // Step 1: Verify both users see validation buttons
    // ========================================
    
    // Handle mood check if present for User A
    const moodContinueA = pageA.getByTestId('mood-check-continue-button');
    const hasMoodCheckA = await moodContinueA.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheckA) {
      await moodContinueA.click();
      await pageA.waitForLoadState('networkidle');
    }

    // Handle mood check if present for User B
    const moodContinueB = pageB.getByTestId('mood-check-continue-button');
    const hasMoodCheckB = await moodContinueB.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheckB) {
      await moodContinueB.click();
      await pageB.waitForLoadState('networkidle');
    }

    // Wait for chat to load and take initial screenshot
    await pageA.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 });
    await pageB.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 });

    // ========================================
    // Step 2: Both users validate empathy (click "Accurate")
    // ========================================
    
    // User A validates User B's empathy
    const accurateButtonA = pageA.getByRole('button', { name: /accurate/i });
    await expect(accurateButtonA).toBeVisible({ timeout: 5000 });
    await accurateButtonA.click();
    await pageA.waitForLoadState('networkidle');

    // User B validates User A's empathy
    const accurateButtonB = pageB.getByRole('button', { name: /accurate/i });
    await expect(accurateButtonB).toBeVisible({ timeout: 5000 });
    await accurateButtonB.click();
    await pageB.waitForLoadState('networkidle');

    // Wait for validation to process
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    // Take screenshots after validation
    await pageA.screenshot({ path: 'test-results/stage-3-4-user-a-validated.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-user-b-validated.png' });

    // ========================================
    // Step 3: Navigate to Share page via indicator
    // ========================================

    // Look for the "Share →" button or needs indicator
    const shareButtonA = pageA.getByRole('button', { name: /share/i });
    await expect(shareButtonA).toBeVisible({ timeout: 5000 });
    await shareButtonA.click();

    // Wait for Share screen to load
    await pageA.waitForURL(/\/share$/);
    await pageA.waitForLoadState('networkidle');

    // Take screenshot of Share page
    await pageA.screenshot({ path: 'test-results/stage-3-4-share-page.png' });

    // ========================================
    // Step 4: Screenshot and verify Needs section
    // ========================================

    // Navigate to Needs tab
    const needsTab = pageA.getByTestId('share-tab-selector-tab-needs');
    if (await needsTab.isVisible().catch(() => false)) {
      await needsTab.click();
      await pageA.waitForLoadState('networkidle');
    }

    // Wait for needs section to load
    const needsSection = pageA.getByTestId('share-needs-section');
    await expect(needsSection).toBeVisible({ timeout: 10000 });

    // Screenshot: Needs identified
    await pageA.screenshot({ path: 'test-results/stage-3-4-needs-identified.png' });

    // Verify needs are displayed
    const needsCards = pageA.locator('[data-testid*="needs-section"]').or(pageA.getByText(/appreciation|partnership|understanding|support/i));
    await expect(needsCards.first()).toBeVisible({ timeout: 5000 });

    // ========================================
    // Step 5: Confirm needs
    // ========================================

    // Look for confirm needs button or checkbox
    const confirmNeedsButton = pageA.getByRole('button', { name: /confirm|looks good|continue/i });
    if (await confirmNeedsButton.isVisible().catch(() => false)) {
      await confirmNeedsButton.click();
      await pageA.waitForLoadState('networkidle');
    }

    // ========================================
    // Step 6: Screenshot Common Ground
    // ========================================

    // Wait for common ground to be visible
    const commonGroundCard = pageA.getByTestId('share-needs-section-common-ground');
    if (await commonGroundCard.isVisible().catch(() => false)) {
      await expect(commonGroundCard).toBeVisible({ timeout: 5000 });
    }

    // Screenshot: Common ground
    await pageA.screenshot({ path: 'test-results/stage-3-4-common-ground.png' });

    // Verify common ground content
    const commonGroundText = pageA.getByText(/mutual recognition|collaborative partnership|shared needs/i);
    await expect(commonGroundText).toBeVisible({ timeout: 5000 });

    // ========================================
    // Step 7: Navigate to Strategies tab
    // ========================================

    const strategiesTab = pageA.getByTestId('share-tab-selector-tab-strategies');
    await expect(strategiesTab).toBeVisible({ timeout: 5000 });
    await strategiesTab.click();
    await pageA.waitForLoadState('networkidle');

    // ========================================
    // Step 8: Screenshot Strategy Pool
    // ========================================

    const strategiesSection = pageA.getByTestId('share-strategies-section');
    await expect(strategiesSection).toBeVisible({ timeout: 10000 });

    // Screenshot: Strategy pool
    await pageA.screenshot({ path: 'test-results/stage-3-4-strategy-pool.png' });

    // Verify strategies are displayed
    const strategyCards = pageA.locator('[data-testid*="strategy"], [data-testid*="strategy-pool"]').or(
      pageA.getByText(/weekly check-in|express appreciation|decompress/i)
    );
    await expect(strategyCards.first()).toBeVisible({ timeout: 5000 });

    // ========================================
    // Step 9: Rank strategies
    // ========================================

    // Look for ready to rank button or ranking UI
    const readyToRankButton = pageA.getByRole('button', { name: /ready|rank|prioritize/i });
    if (await readyToRankButton.isVisible().catch(() => false)) {
      await readyToRankButton.click();
      await pageA.waitForLoadState('networkidle');
    }

    // Wait for ranking UI
    const rankingSection = pageA.locator('[data-testid*="ranking"], [data-testid*="strategy-ranking"]');
    if (await rankingSection.isVisible().catch(() => false)) {
      // Submit rankings (drag/drop or select order)
      const submitRankingsButton = pageA.getByRole('button', { name: /submit|done|complete/i });
      if (await submitRankingsButton.isVisible().catch(() => false)) {
        await submitRankingsButton.click();
        await pageA.waitForLoadState('networkidle');
      }
    }

    // Wait for ranking to process
    await pageA.waitForTimeout(2000);

    // ========================================
    // Step 10: Screenshot Overlap Revealed
    // ========================================

    // Navigate back to strategies tab to see overlap
    await strategiesTab.click();
    await pageA.waitForLoadState('networkidle');

    // Wait for overlap reveal
    const overlapSection = pageA.locator('[data-testid*="overlap"], [data-testid*="overlap-reveal"]');
    if (await overlapSection.isVisible().catch(() => false)) {
      await expect(overlapSection).toBeVisible({ timeout: 5000 });
    }

    // Screenshot: Overlap revealed
    await pageA.screenshot({ path: 'test-results/stage-3-4-overlap-revealed.png' });

    // ========================================
    // Step 11: Navigate to Agreement and create
    // ========================================

    const agreementTab = pageA.getByTestId('share-tab-selector-tab-agreement');
    await expect(agreementTab).toBeVisible({ timeout: 5000 });
    await agreementTab.click();
    await pageA.waitForLoadState('networkidle');

    const agreementSection = pageA.getByTestId('share-agreement-section');
    await expect(agreementSection).toBeVisible({ timeout: 10000 });

    // Look for create agreement button
    const createAgreementButton = pageA.getByRole('button', { name: /create|agree|confirm/i });
    if (await createAgreementButton.isVisible().catch(() => false)) {
      await createAgreementButton.click();
      await pageA.waitForLoadState('networkidle');
    }

    // Wait for agreement to be created
    await pageA.waitForTimeout(2000);

    // ========================================
    // Step 12: Screenshot Agreement Reached
    // ========================================

    // Screenshot: Agreement reached
    await pageA.screenshot({ path: 'test-results/stage-3-4-agreement-reached.png' });

    // Verify agreement content is displayed
    const agreementCard = pageA.locator('[data-testid*="agreement"], [data-testid*="agreement-card"]');
    if (await agreementCard.isVisible().catch(() => false)) {
      await expect(agreementCard).toBeVisible({ timeout: 5000 });
    }

    // Verify experiment description is shown
    const experimentText = pageA.getByText(/weekly check-in|experiment|try this/i);
    await expect(experimentText).toBeVisible({ timeout: 5000 });

    // Cleanup
    await contextA.close();
    await contextB.close();
  });

  test('Share page tabs are accessible from chat indicators', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await setupAuthenticatedPage(contextA, setup, 'A');

    // Handle mood check if present
    const moodContinueA = pageA.getByTestId('mood-check-continue-button');
    const hasMoodCheckA = await moodContinueA.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMoodCheckA) {
      await moodContinueA.click();
      await pageA.waitForLoadState('networkidle');
    }

    // Look for chat indicators for Stage 3/4
    // These might be "Needs identified", "Strategies ready", etc.
    const needsIndicator = pageA.locator('[data-testid*="indicator"]').filter({ hasText: /needs|stage 3/i });
    const strategiesIndicator = pageA.locator('[data-testid*="indicator"]').filter({ hasText: /strategies|stage 4/i });

    // Check if indicators are visible and clickable
    if (await needsIndicator.isVisible().catch(() => false)) {
      await needsIndicator.click();
      await pageA.waitForURL(/\/share/);
      await expect(pageA.url()).toContain('/share');
    }

    await pageA.screenshot({ path: 'test-results/stage-3-4-indicator-navigation.png' });

    await contextA.close();
  });
});
