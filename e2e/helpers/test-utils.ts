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
 * Navigate from the session chat screen to the Share screen via in-app UI.
 * This avoids deep-linking directly to /share, which can mask stale data issues.
 */
export async function navigateToShareFromSession(
  page: Page,
  timeout = 10000
): Promise<void> {
  if (page.url().includes('/share')) {
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    // If session-entry mood check is present, clear it before looking for nav controls.
    await handleMoodCheck(page, 3000);

    const modalViewButton = page.getByTestId('partner-event-modal-view');
    if (await modalViewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modalViewButton.click();
      break;
    }

    const headerShareButton = page.getByTestId('session-chat-header-go-to-share');
    if (await headerShareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await headerShareButton.click();
      break;
    }

    const accessibleShareButton = page.getByRole('button', { name: /share/i });
    if (await accessibleShareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await accessibleShareButton.click();
      break;
    }

    // Fallback: open Share by tapping a chat indicator that routes to Share
    const contextIndicator = page.getByTestId('chat-indicator-context-shared');
    const empathyIndicator = page.getByTestId('chat-indicator-empathy-shared');
    if (await contextIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contextIndicator.click();
      break;
    }
    if (await empathyIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await empathyIndicator.click();
      break;
    }

    if (attempt === 1) {
      throw new Error(`Could not find in-app Share navigation button on session screen (url=${page.url()})`);
    }

    await page.waitForTimeout(1500);
  }

  // Mood check can occasionally re-appear after route/state updates.
  await handleMoodCheck(page, 2000);

  await page.waitForURL(/\/session\/.*\/share/, { timeout });
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
 * Waits for the backend API request to complete to ensure stage transition
 * has propagated before subsequent messages are sent.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait for feel heard buttons (default: 5000)
 */
export async function confirmFeelHeard(page: Page, timeout = 5000): Promise<void> {
  const feelHeardYes = page.getByTestId('feel-heard-yes');
  await expect(feelHeardYes).toBeVisible({ timeout });

  // Wait for the API request to complete (fixes race condition where
  // subsequent messages are sent before backend stage update completes)
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/sessions/') && response.url().includes('/feel-heard'),
    { timeout: 10000 }
  );

  await feelHeardYes.click();
  await responsePromise;

  await expect(feelHeardYes).not.toBeVisible({ timeout });

  // Additional small delay to ensure React state updates from the response
  await page.waitForTimeout(500);
}

/**
 * Wait for any AI response to complete (without matching specific text).
 * Counts AI message elements before and polls until a new one appears,
 * then waits for the typing indicator to disappear (streaming complete).
 * Used for live-AI tests where response text is non-deterministic.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 60000)
 */
export async function waitForAnyAIResponse(page: Page, timeout = 60000): Promise<void> {
  // Count current AI messages
  const initialCount = await page.locator('[data-testid^="ai-message-"]').count();

  // Poll until a new AI message appears
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentCount = await page.locator('[data-testid^="ai-message-"]').count();
    if (currentCount > initialCount) {
      break;
    }
    await page.waitForTimeout(200);
  }

  // Ensure typing indicator is gone (streaming fully complete)
  const typingIndicator = page.getByTestId('typing-indicator');
  await typingIndicator.waitFor({ state: 'hidden', timeout: Math.max(deadline - Date.now(), 5000) }).catch(() => {});

  // Small buffer for React rendering
  await page.waitForTimeout(100);
}

/**
 * Send messages one at a time, checking for a panel after each AI response.
 * Returns the number of messages it took for the panel to appear.
 * Throws if the panel doesn't appear after maxAttempts messages.
 *
 * @param page - Playwright Page instance
 * @param messages - Array of pre-written messages to send
 * @param panelTestId - testID of the panel to wait for
 * @param maxAttempts - Maximum number of messages to try
 * @param responseTimeout - Timeout per AI response (default: 60000)
 * @returns Number of messages sent before panel appeared
 */
export async function sendAndWaitForPanel(
  page: Page,
  messages: string[],
  panelTestId: string,
  maxAttempts: number,
  responseTimeout = 60000
): Promise<number> {
  for (let i = 0; i < Math.min(messages.length, maxAttempts); i++) {
    // Type and send message
    await page.getByTestId('chat-input').fill(messages[i]);
    await page.getByTestId('send-button').click();
    // Wait for AI response
    await waitForAnyAIResponse(page, responseTimeout);
    // Check if panel appeared (metadata arrives via separate SSE event after text,
    // so give it time to process through React state updates)
    const panel = page.getByTestId(panelTestId);
    if (await panel.isVisible({ timeout: 2000 }).catch(() => false)) {
      return i + 1; // turns it took
    }
  }
  throw new Error(`Panel '${panelTestId}' did not appear after ${Math.min(messages.length, maxAttempts)} messages`);
}

/**
 * Wait for the reconciler to complete by polling for the empathy-shared indicator.
 * Returns true if the indicator becomes visible within the timeout, false if timeout expires.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 30000)
 * @returns Promise resolving to true if indicator appears, false if timeout
 */
export async function waitForReconcilerComplete(page: Page, timeout = 30000): Promise<boolean> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const indicator = page.getByTestId('chat-indicator-empathy-shared');
    const isVisible = await indicator.isVisible({ timeout: 1000 }).catch(() => false);

    if (isVisible) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

/**
 * Navigate back to the chat screen from any other screen (e.g., Share).
 * If already on chat, returns immediately.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait for navigation (default: 10000)
 */
export async function navigateBackToChat(page: Page, timeout = 10000): Promise<void> {
  // If already on chat (not on /share), return immediately
  if (!page.url().includes('/share')) {
    return;
  }

  // Try clicking the back button if visible
  const backButton = page.getByTestId('share-header-back-button');
  if (await backButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await backButton.click();
  } else {
    // Fallback: use browser back navigation
    await page.goBack();
  }

  // Wait for URL to match session chat pattern (not /share)
  await page.waitForURL(/\/session\/[^/]+$/, { timeout });
  await page.waitForLoadState('networkidle');
}
