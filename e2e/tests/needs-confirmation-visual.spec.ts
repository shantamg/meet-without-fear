/**
 * Needs Confirmation Visual Test
 *
 * Focused test for the needs confirmation UI in the main session screen.
 * This tests the inline needs-summary card that appears during Stage 3.
 */

import { test, devices, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

const userA = { email: 'needs-confirm-test@e2e.test', name: 'Shantam' };
const userB = { email: 'needs-confirm-partner@e2e.test', name: 'Darryl' };

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

test.describe('Needs Confirmation Visual', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let pageA: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Start at EMPATHY_REVEALED - Stage 3 ready
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_REVEALED')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} at EMPATHY_REVEALED stage`);

    const userASetup = await createUserContext(browser, userA.email, userAId);
    userAContext = userASetup.context;
    pageA = userASetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
  });

  test('Needs confirmation in main session screen', async ({ request }) => {
    test.setTimeout(60000);

    const apiA = makeApiRequest(request, userA.email, userAId);

    // Navigate to main session screen (not share screen)
    const userAParams = new URLSearchParams({
      'e2e-user-id': userAId,
      'e2e-user-email': userA.email,
    });

    console.log('Navigating to session screen...');
    await pageA.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`);
    await pageA.waitForLoadState('networkidle');

    // Handle mood check if visible
    const moodCheck = pageA.getByTestId('mood-check-continue-button');
    const moodVisible = await moodCheck.isVisible({ timeout: 3000 }).catch(() => false);
    if (moodVisible) {
      console.log('Mood check visible - clicking continue');
      await moodCheck.click();
      await pageA.waitForTimeout(1000);
    }

    // Screenshot initial state
    await expect(pageA).toHaveScreenshot('needs-confirm-01-initial.png', {
      maxDiffPixels: 100,
      fullPage: true,
    });
    console.log('Screenshot: needs-confirm-01-initial.png');

    // Trigger needs extraction by calling the API
    console.log('Fetching needs (triggers AI extraction)...');
    const needsResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
    const needsData = await needsResponse.json();
    console.log(`Needs response: ${needsData.data?.needs?.length || 0} needs`);

    // Reload to see the needs-summary card
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');

    // Handle mood check again if it reappears
    const moodCheck2 = pageA.getByTestId('mood-check-continue-button');
    const moodVisible2 = await moodCheck2.isVisible({ timeout: 2000 }).catch(() => false);
    if (moodVisible2) {
      await moodCheck2.click();
      await pageA.waitForTimeout(1000);
    }

    // Wait for content to render
    await pageA.waitForTimeout(2000);

    // Screenshot the needs confirmation screen
    await expect(pageA).toHaveScreenshot('needs-confirm-02-with-needs.png', {
      maxDiffPixels: 100,
      fullPage: true,
    });
    console.log('Screenshot: needs-confirm-02-with-needs.png');

    // Check for the needs summary elements
    const needsSummary = pageA.getByText('Your Identified Needs');
    const summaryVisible = await needsSummary.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Needs summary visible: ${summaryVisible}`);

    const confirmButton = pageA.getByText('Confirm my needs');
    const confirmVisible = await confirmButton.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Confirm button visible: ${confirmVisible}`);

    // Final screenshot
    await expect(pageA).toHaveScreenshot('needs-confirm-final.png', {
      maxDiffPixels: 100,
      fullPage: true,
    });
    console.log('Final screenshot: needs-confirm-final.png');
  });
});
