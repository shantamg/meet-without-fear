/**
 * Needs Tab Visual Test
 *
 * Focused test for iterating on the Needs tab UI.
 * Starts at EMPATHY_REVEALED stage and navigates directly to the Needs tab.
 */

import { test, expect, devices, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder, navigateToShareFromSession } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test user
const userA = { email: 'needs-visual-test@e2e.test', name: 'Shantam' };
const userB = { email: 'needs-visual-partner@e2e.test', name: 'Darryl' };

async function createUserContext(
  browser: import('@playwright/test').Browser,
  userEmail: string,
  userId: string,
  fixtureId?: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
  });
  const page = await context.newPage();
  return { context, page };
}

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

test.describe('Needs Tab Visual', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let pageA: Page;

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

    // Create browser context for User A
    const userASetup = await createUserContext(browser, userA.email, userAId);
    userAContext = userASetup.context;
    pageA = userASetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
  });

  test('Needs tab displays needs with proper styling', async ({ request }) => {
    test.setTimeout(60000);

    const apiA = makeApiRequest(request, userA.email, userAId);
    const apiB = makeApiRequest(request, userB.email, userBId);

    // Create needs via API for User A
    // Note: The `need` field is what gets displayed as the description
    // The `category` field is the enum that gets displayed as the header
    console.log('Creating needs for User A...');
    await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need to feel appreciated for the work I do around the house',
      category: 'RECOGNITION',
    });

    await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need us to share responsibilities more equally',
      category: 'FAIRNESS',
    });

    await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need us to talk about our schedules before making plans',
      category: 'CONNECTION',
    });

    // Create needs via API for User B
    console.log('Creating needs for User B...');
    await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need you to understand how exhausted I am after work',
      category: 'CONNECTION',
    });

    await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, {
      need: 'I need emotional support when I come home tired',
      category: 'SAFETY',
    });

    // Navigate to session first, then open Share via the in-app arrow
    const userAParams = new URLSearchParams({
      'e2e-user-id': userAId,
      'e2e-user-email': userA.email,
    });
    await pageA.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
    await pageA.waitForLoadState('networkidle');

    console.log('Navigating to Share via in-app arrow...');
    await navigateToShareFromSession(pageA);

    // Wait a moment for React Query to fetch needs
    await pageA.waitForTimeout(2000);

    // Take screenshot
    await expect(pageA).toHaveScreenshot('needs-tab-01-initial.png', {
      maxDiffPixels: 100,
      fullPage: true,
    });
    console.log('Screenshot saved: needs-tab-01-initial.png');

    // Click on the Needs tab explicitly if tabs are visible
    const needsTab = pageA.getByTestId('share-tab-selector-tab-needs');
    const tabVisible = await needsTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (tabVisible) {
      await needsTab.click();
      await pageA.waitForTimeout(1000);

      // Take screenshot after clicking needs tab
      await expect(pageA).toHaveScreenshot('needs-tab-02-clicked.png', {
        maxDiffPixels: 100,
        fullPage: true,
      });
      console.log('Screenshot saved: needs-tab-02-clicked.png');
    } else {
      console.log('Needs tab not visible - tabs may not be available at this stage');
    }

    // Verify needs are displayed
    const needsSection = pageA.getByTestId('share-needs-section');
    const sectionVisible = await needsSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (sectionVisible) {
      console.log('Needs section is visible');
    } else {
      console.log('Needs section not visible - may need to check stage requirements');

      // Take a diagnostic screenshot
      await expect(pageA).toHaveScreenshot('needs-tab-03-diagnostic.png', {
        maxDiffPixels: 100,
        fullPage: true,
      });
    }

    // Final screenshot
    await expect(pageA).toHaveScreenshot('needs-tab-final.png', {
      maxDiffPixels: 100,
      fullPage: true,
    });
    console.log('Final screenshot saved: needs-tab-final.png');
  });
});
