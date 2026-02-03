import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'stage3-4-shantam@e2e.test', name: 'Shantam' };
const userB = { email: 'stage3-4-darryl@e2e.test', name: 'Darryl' };

// This fixture returns PROCEED (no gaps) from the reconciler
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

test.describe('Stage 3-4 Complete Flow', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    const setup = await new SessionBuilder(API_BASE_URL)
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_SHARED_A')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId}`);
  });

  test('Complete Stage 3-4 flow after empathy reveal', async ({ browser }) => {
    // Create browser contexts for both users
    const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
    const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });

    const pageA = userASetup.page;
    const pageB = userBSetup.page;

    // Navigate both users to session
    await pageA.goto(`${APP_BASE_URL}/session/${sessionId}?e2e-user-id=${userAId}&e2e-user-email=${encodeURIComponent(userA.email)}`);
    await pageB.goto(`${APP_BASE_URL}/session/${sessionId}?e2e-user-id=${userBId}&e2e-user-email=${encodeURIComponent(userB.email)}`);
    await pageA.waitForLoadState('networkidle');
    await pageB.waitForLoadState('networkidle');

    // ========================================
    // Phase 1: User B completes Stage 1 (like reconciler test)
    // ========================================
    
    // User B signs compact if needed
    const agreeCheckbox = pageB.getByTestId('compact-agree-checkbox');
    if (await agreeCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await agreeCheckbox.click();
      await pageB.getByTestId('compact-sign-button').click();
    }

    // User B completes witnessing chat
    const chatInput = pageB.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill('Things have been tense lately');
    await pageB.getByTestId('send-button').click();
    await pageB.waitForTimeout(2000);

    await chatInput.fill("I feel like we've just been miscommunicating");
    await pageB.getByTestId('send-button').click();
    await pageB.waitForTimeout(2000);

    await chatInput.fill("I want them to know I still care");
    await pageB.getByTestId('send-button').click();
    await pageB.waitForTimeout(2000);

    await chatInput.fill("I just want us to be on the same page");
    await pageB.getByTestId('send-button').click();
    await pageB.waitForTimeout(2000);

    // User B confirms feel heard
    const feelHeardYes = pageB.getByTestId('feel-heard-yes');
    await expect(feelHeardYes).toBeVisible({ timeout: 10000 });
    await feelHeardYes.click();
    await pageB.waitForTimeout(3000);

    // ========================================
    // Phase 2: Both validate empathy
    // ========================================
    
    // Screenshot before validation
    await pageA.screenshot({ path: 'test-results/stage-3-4-before-validation.png' });

    // User A validates
    const accurateButtonA = pageA.getByRole('button', { name: /accurate/i });
    await expect(accurateButtonA).toBeVisible({ timeout: 10000 });
    await accurateButtonA.click();
    await pageA.waitForTimeout(2000);

    // User B validates
    const accurateButtonB = pageB.getByRole('button', { name: /accurate/i });
    await expect(accurateButtonB).toBeVisible({ timeout: 10000 });
    await accurateButtonB.click();
    await pageB.waitForTimeout(2000);

    // Screenshot after validation
    await pageA.screenshot({ path: 'test-results/stage-3-4-after-validation.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-4-user-b-after-validation.png' });

    // ========================================
    // Phase 3: Navigate to Share page
    // ========================================

    // Look for share indicator and click
    const shareIndicator = pageA.locator('[data-testid*="share"], [data-testid*="empathy-shared"]').first();
    if (await shareIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareIndicator.click();
    } else {
      // Navigate directly
      await pageA.goto(`${APP_BASE_URL}/session/${sessionId}/share?e2e-user-id=${userAId}&e2e-user-email=${encodeURIComponent(userA.email)}`);
    }
    await pageA.waitForLoadState('networkidle');

    // Screenshot Share page
    await pageA.screenshot({ path: 'test-results/stage-3-4-share-page.png' });

    // ========================================
    // Phase 4: Needs Section
    // ========================================

    // Look for needs tab/section
    const needsTab = pageA.getByRole('button', { name: /needs|stage 3/i }).or(pageA.locator('[data-testid*="needs"]')).first();
    if (await needsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await needsTab.click();
      await pageA.waitForTimeout(1000);
    }

    // Screenshot needs
    await pageA.screenshot({ path: 'test-results/stage-3-4-needs-section.png' });

    console.log('[Test] Stage 3-4 screenshots captured successfully');

    // Close contexts
    await userASetup.context.close();
    await userBSetup.context.close();
  });
});
