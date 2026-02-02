/**
 * E2E Test Utilities
 *
 * Shared helper functions extracted from test files to eliminate duplication.
 */

import { Page, Browser, BrowserContext, devices, expect } from '@playwright/test';
import { getE2EHeaders } from './auth';

/**
 * Wait for AI response to complete streaming.
 * Checks for text pattern visibility and waits for typing indicator to disappear.
 *
 * @param page - Playwright Page instance
 * @param textPattern - RegExp pattern to match in AI response
 * @param timeout - Maximum time to wait in milliseconds (default: 15000)
 */
export async function waitForAIResponse(
  page: Page,
  textPattern: RegExp,
  timeout = 15000
): Promise<void> {
  await expect(page.getByText(textPattern)).toBeVisible({ timeout });

  const typingIndicator = page.getByTestId('typing-indicator');
  await expect(typingIndicator).not.toBeVisible({ timeout: 5000 }).catch(() => {});

  // Brief pause to ensure response is fully rendered
  await page.waitForTimeout(100);
}

/**
 * Create a new browser context with E2E headers for a specific user.
 * Configures the context with iPhone 12 device emulation and optional window positioning.
 *
 * @param browser - Playwright Browser instance
 * @param userEmail - User email for E2E auth headers
 * @param userId - User ID for E2E auth headers
 * @param fixtureId - Optional fixture ID for mock AI responses
 * @param position - Optional window position for side-by-side testing
 * @returns Object containing the context and page
 */
export async function createUserContext(
  browser: Browser,
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
 * Handle mood check modal if it appears.
 * Clicks the continue button if visible, otherwise does nothing.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait for mood check (default: 5000)
 */
export async function handleMoodCheck(page: Page, timeout = 5000): Promise<void> {
  const moodContinue = page.getByTestId('mood-check-continue-button');
  if (await moodContinue.isVisible({ timeout }).catch(() => false)) {
    await moodContinue.click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Navigate a user to a session page with E2E query parameters.
 *
 * @param page - Playwright Page instance
 * @param appBaseUrl - Base URL of the application
 * @param sessionId - Session ID to navigate to
 * @param userId - User ID for query params
 * @param userEmail - User email for query params
 */
export async function navigateToSession(
  page: Page,
  appBaseUrl: string,
  sessionId: string,
  userId: string,
  userEmail: string
): Promise<void> {
  const params = new URLSearchParams({
    'e2e-user-id': userId,
    'e2e-user-email': userEmail,
  });
  await page.goto(`${appBaseUrl}/session/${sessionId}?${params.toString()}`);
  await page.waitForLoadState('networkidle');
}

/**
 * Sign the compact agreement for a user.
 * Checks the agree checkbox and clicks the sign button.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait for compact UI (default: 10000)
 */
export async function signCompact(page: Page, timeout = 10000): Promise<void> {
  const agreeCheckbox = page.getByTestId('compact-agree-checkbox');
  await expect(agreeCheckbox).toBeVisible({ timeout });
  await agreeCheckbox.click();
  await page.getByTestId('compact-sign-button').click();
}

/**
 * Complete the "feel heard" confirmation by clicking the Yes button.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait for feel heard buttons (default: 5000)
 */
export async function confirmFeelHeard(page: Page, timeout = 5000): Promise<void> {
  const feelHeardYes = page.getByTestId('feel-heard-yes');
  await expect(feelHeardYes).toBeVisible({ timeout });
  await feelHeardYes.click();
  await expect(feelHeardYes).not.toBeVisible({ timeout });
}
