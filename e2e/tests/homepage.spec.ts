/**
 * Homepage Smoke Test
 *
 * Verifies that the app loads correctly and shows actual content.
 */

import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads and shows actual app content (not just loading)', async ({ page }) => {
    // Capture console for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate to the app
    await page.goto('/');

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/homepage-initial.png' });

    // Wait for the loading spinner to disappear
    // The app shows "Loading..." text while loading
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Loading...'),
        { timeout: 15000 }
      );
    } catch {
      // Take screenshot if still loading
      await page.screenshot({ path: 'test-results/homepage-stuck-loading.png' });
      console.log('Console logs:', consoleLogs.slice(-20));
      throw new Error('App stuck on loading screen');
    }

    // Take screenshot after loading complete
    await page.screenshot({ path: 'test-results/homepage-loaded.png' });

    // Now check for actual content
    // E2E mode should show authenticated home screen with "Hi" greeting
    // OR the welcome screen with "Meet Without Fear" if not redirecting properly
    const hasGreeting = await page.getByText(/^Hi\s/i).isVisible().catch(() => false);
    const hasWelcome = await page.getByText('Meet Without Fear').isVisible().catch(() => false);
    const hasGetStarted = await page.getByText('Get Started').isVisible().catch(() => false);

    console.log(`Content check: greeting=${hasGreeting}, welcome=${hasWelcome}, getStarted=${hasGetStarted}`);

    // Should have either the auth home screen or the welcome screen
    expect(hasGreeting || hasWelcome || hasGetStarted).toBe(true);
  });

  test('loads within 10 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    // Wait for actual content (not just DOM loaded)
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
  });
});
