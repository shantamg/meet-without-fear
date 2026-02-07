# E2E Test Fixes - Quick Reference

## Problem Summary
Two test failures in `e2e/tests/homepage.spec.ts`:
1. **"loads and shows actual app content"** - All content checks return false (greeting=false, welcome=false, getStarted=false)
2. **"loads within 10 seconds"** - net::ERR_CONNECTION_REFUSED on localhost:8082

**Root cause:** Configuration and initialization issues, NOT code bugs

---

## Fix #1: Enable Global Database Setup (CRITICAL)

**File:** `e2e/playwright.config.ts`

**Line 73-75 - UNCOMMENT:**
```typescript
  // Global setup disabled - run migrations manually before tests if needed
  // globalSetup: require.resolve('./global-setup'),  // ← UNCOMMENT THIS LINE
```

**To:**
```typescript
  globalSetup: require.resolve('./global-setup'),
```

**Why:** Database needs to be cleaned and migrated before each test run. Without this, stale data from previous runs interferes.

---

## Fix #2: Force Server Restart (CRITICAL)

**File:** `e2e/playwright.config.ts`

**Lines 13 & 18 - CHANGE:**
```typescript
    reuseExistingServer: !process.env.CI,  // ← This allows reusing old servers
```

**To:**
```typescript
    reuseExistingServer: false,  // Force fresh start each test run
```

**Why:** When CI is not set, tests reuse old servers without the E2E_AUTH_BYPASS environment variable. Forcing restart ensures clean environment.

---

## Fix #3: Initialize Homepage Test with E2E Setup (CRITICAL)

**File:** `e2e/tests/homepage.spec.ts`

**REPLACE THE ENTIRE FILE WITH:**

```typescript
/**
 * Homepage Smoke Test
 *
 * Verifies that the app loads correctly and shows actual content.
 */

import { test, expect } from '@playwright/test';
import { getE2EHeaders } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.describe('Homepage', () => {
  const testUser = {
    email: 'homepage-test@e2e.test',
    name: 'Homepage Test User',
  };

  let userId: string;

  // Seed a test user before each test
  test.beforeEach(async ({ request }) => {
    const seedResponse = await request.post(`${API_BASE_URL}/api/e2e/seed`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: testUser.email, name: testUser.name },
    });

    if (seedResponse.ok()) {
      const seedData = await seedResponse.json();
      userId = seedData.id;
    }
  });

  test('loads and shows actual app content (not just loading)', async ({ page }) => {
    // Set E2E auth headers for this test
    await page.setExtraHTTPHeaders(
      getE2EHeaders(testUser.email, userId)
    );

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
    // Set E2E auth headers for this test
    await page.setExtraHTTPHeaders(
      getE2EHeaders(testUser.email, userId)
    );

    const startTime = Date.now();

    await page.goto('/');

    // Wait for actual content (not just DOM loaded)
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
  });
});
```

**What changed:**
- ✅ Added import for `getE2EHeaders` helper
- ✅ Added `test.beforeEach()` to seed test user via `/api/e2e/seed`
- ✅ Added `page.setExtraHTTPHeaders()` with E2E headers for both tests
- ✅ Each test now has proper E2E authentication setup

---

## Fix #4: Increase Expo Startup Timeout (RECOMMENDED)

**File:** `e2e/playwright.config.ts`

**Line 23 - CHANGE:**
```typescript
    timeout: 120000,  // 2 minutes
```

**To:**
```typescript
    timeout: 180000,  // 3 minutes - more reliable on slower systems
```

**Why:** Expo Metro bundler can take time, especially on first run. 3 minutes is safer.

---

## Manual Testing Checklist

Before running e2e tests, verify setup:

```bash
#!/bin/bash
set -e

cd /home/ubuntu/.openclaw/workspace/meet-without-fear

# 1. Kill any running servers
echo "🛑 Killing existing servers..."
npm run kill:api 2>/dev/null || true
npm run kill:mobile 2>/dev/null || true
sleep 1

# 2. Reset test database
echo "🗑️  Resetting test database..."
DATABASE_URL="postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear_test" \
  npm run db:reset -- --force

# 3. Verify environment
echo "✅ Verifying environment..."
grep "EXPO_PUBLIC_E2E_MODE" mobile/.env || echo "❌ Missing EXPO_PUBLIC_E2E_MODE"
grep "EXPO_PUBLIC_API_URL" mobile/.env || echo "❌ Missing EXPO_PUBLIC_API_URL"

# 4. Run the homepage test with verbose output
echo "🧪 Running homepage test..."
cd e2e
npx playwright test tests/homepage.spec.ts -v

echo "✅ Done!"
```

---

## Verification Checklist

After applying fixes, verify:

✅ `e2e/playwright.config.ts` line ~73 uncommented: `globalSetup: require.resolve('./global-setup'),`

✅ `e2e/playwright.config.ts` lines 13 & 18 changed to: `reuseExistingServer: false,`

✅ `e2e/playwright.config.ts` line 23 changed to: `timeout: 180000,`

✅ `e2e/tests/homepage.spec.ts` imports `getE2EHeaders` from helpers

✅ `e2e/tests/homepage.spec.ts` has `test.beforeEach()` that seeds a user

✅ Both tests in `homepage.spec.ts` call `page.setExtraHTTPHeaders()` with E2E headers

✅ `mobile/.env` contains:
```
EXPO_PUBLIC_E2E_MODE=true
EXPO_PUBLIC_API_URL=http://localhost:3002
```

---

## Expected Results After Fixes

**Test 1: "loads and shows actual app content"**
- ✅ Page loads successfully
- ✅ App initializes with E2E user
- ✅ Content check shows at least one element visible (greeting, welcome, or getStarted)
- ✅ Screenshot shows actual UI (not loading screen)

**Test 2: "loads within 10 seconds"**
- ✅ No ERR_CONNECTION_REFUSED
- ✅ Page navigates successfully
- ✅ Load time < 10 seconds
- ✅ DOM content loaded event fires

---

## Still Failing? Debug Steps

If tests still fail after applying fixes:

1. **Check backend is receiving E2E variables:**
   ```bash
   grep "E2E_AUTH_BYPASS" backend/.env
   # Should be empty (variables passed via playwright config)
   
   # Check backend startup logs for:
   # "[Startup] E2E_AUTH_BYPASS = true"
   ```

2. **Verify Expo server started:**
   ```bash
   curl http://localhost:8082 -v
   # Should respond with HTML (not connection refused)
   ```

3. **Check test database:**
   ```bash
   psql -U mwf_user -d meet_without_fear_test -c "SELECT COUNT(*) FROM \"User\""
   # Should show user count, not error
   ```

4. **Review test output:**
   - Open `test-results/index.html` after test run
   - Look at screenshots (initial, stuck-loading, loaded)
   - Check browser console logs captured by test
   - Review Playwright trace if enabled

5. **Run with debug mode:**
   ```bash
   cd e2e && npx playwright test tests/homepage.spec.ts --debug
   ```

---

## Summary

| Issue | Fix |
|-------|-----|
| Database not cleaned between tests | Uncomment globalSetup |
| E2E_AUTH_BYPASS not passed to backend | Set reuseExistingServer: false |
| Homepage test missing E2E initialization | Add test.beforeEach() and setExtraHTTPHeaders() |
| Expo startup timeout too short | Increase from 120s to 180s |
| Connection refused on 8082 | Killed existing servers, enabled fresh startup |
| Content checks all false | User seeding + proper auth headers |

All of these are **configuration changes**, not code changes. The app code itself is fine—it just needs proper E2E setup.
