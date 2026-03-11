# E2E Test Failure Diagnostic Report

## Summary

The e2e tests are failing due to **multiple environment and configuration issues**, NOT code issues. The tests work on Mac but fail on Linux likely due to differences in how environment variables are passed through the process hierarchy, server initialization timing, and/or database state.

---

## Critical Issues Found

### 1. **Global Setup is DISABLED** ⚠️ CRITICAL
**File:** `e2e/playwright.config.ts` (lines ~73-75)

```typescript
  // Global setup disabled - run migrations manually before tests if needed
  // globalSetup: require.resolve('./global-setup'),
```

**Impact:** 
- Database is NOT being cleaned/reset between test runs
- Database migrations might not have run
- Leftover data from previous test runs could interfere with new tests
- The global setup script exists (`e2e/global-setup.ts`) but is commented out

**Solution:** 
Enable global setup in playwright.config.ts:
```typescript
globalSetup: require.resolve('./global-setup'),
```

Or ensure database is manually migrated before tests:
```bash
DATABASE_URL=postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear_test npx prisma migrate deploy
```

---

### 2. **Homepage Test Missing E2E Setup** ⚠️ CRITICAL
**File:** `e2e/tests/homepage.spec.ts`

**Problems:**
- ❌ Does NOT seed a test user via `/api/e2e/seed`
- ❌ Does NOT set `e2e-user-id` and `e2e-user-email` URL parameters
- ❌ Does NOT set extra HTTP headers for E2E auth bypass
- ❌ App falls back to default user ID: `e2e-test-user` with email: `e2e-test@e2e.test`

**Why this causes failures:**
1. App initializes with DEFAULT_E2E_USER
2. App tries to fetch `/auth/me` from backend
3. Backend's auth middleware checks for `E2E_AUTH_BYPASS=true` environment variable
4. If backend wasn't started with this variable (or it got lost), auth fails
5. `/auth/me` endpoint fails without proper user context
6. App stays in loading state or shows unexpected screen

**Evidence from code:**
- `mobile/src/providers/E2EAuthProvider.tsx` (lines 30-45): Falls back to DEFAULT_E2E_USER if no URL params
- `mobile/src/providers/E2EAuthProvider.tsx` (lines 77-82): Tries to fetch `/auth/me`
- `e2e/tests/single-user-journey.spec.ts` (lines 48-72): Shows correct pattern with seeding and headers

**Solution:**
Update `e2e/tests/homepage.spec.ts` to properly initialize E2E mode:

```typescript
test.beforeEach(async ({ page, request }) => {
  // Seed a default E2E user
  await request.post('http://localhost:3002/api/e2e/seed', {
    headers: { 'Content-Type': 'application/json' },
    data: { 
      email: 'homepage-test@e2e.test', 
      name: 'Homepage Test User' 
    },
  });
});

test('loads and shows actual app content', async ({ page }) => {
  // Set E2E headers for all requests
  await page.setExtraHTTPHeaders({
    'x-e2e-user-id': 'homepage-test@e2e.test',
    'x-e2e-user-email': 'homepage-test@e2e.test',
  });

  await page.goto('/');
  // ... rest of test
});
```

---

### 3. **Environment Variables Not Passed to Backend Properly** ⚠️ HIGH

**File:** `e2e/playwright.config.ts` (lines 10-20)

**Issue:**
The playwright config passes `E2E_AUTH_BYPASS=true` to the backend via the `env` object, but the backend might not be receiving it in these scenarios:

1. **Server Reuse:** If `reuseExistingServer: !process.env.CI` is true (and CI is not set), Playwright will reuse an already-running backend server without restarting it. The already-running server won't have the E2E_AUTH_BYPASS variable set.

2. **Environment Variable Inheritance:** The spread `...process.env` might not include variables from `e2e/.env.test` if they haven't been loaded in the root process.

**Verification:**
- `CI` environment variable is NOT set on this system (confirmed: `echo CI=$CI` returns empty)
- So `reuseExistingServer: !process.env.CI` evaluates to `true`
- If backend was previously started WITHOUT E2E_AUTH_BYPASS, it will be reused

**Solution:**
Either:
1. Always restart servers in non-CI environments:
```typescript
reuseExistingServer: false,  // Force restart for reliable test isolation
```

2. Or ensure backend is started fresh and check it received the variable:
```typescript
// In backend startup, verify E2E mode:
console.log('[Startup] E2E_AUTH_BYPASS =', process.env.E2E_AUTH_BYPASS);
console.log('[Startup] MOCK_LLM =', process.env.MOCK_LLM);
```

3. Or verify backend is running with correct variables:
```bash
E2E_AUTH_BYPASS=true MOCK_LLM=true npm run dev:api
```

---

### 4. **ERR_CONNECTION_REFUSED on port 8082** ⚠️ HIGH
**Test failure:** "loads within 10 seconds"

**Root cause:**
The Expo server on port 8082 is crashing or not starting properly. This could be due to:

1. **Timing issue:** Playwright navigates to `http://localhost:8082` before Expo server fully starts
2. **Port already in use:** Previous test run left Expo server running
3. **Out of memory/resources:** Common on Linux CI/containers
4. **Expo Metro bundler issues:** Long build times on first start

**Evidence:**
- Config timeout is 120000ms (2 minutes) for Expo startup
- Second test shows connection refused mid-test
- First test shows "loading" state persists

**Solutions:**
1. **Kill existing servers before tests:**
```bash
npm run kill:api
npm run kill:mobile
sleep 1  # Brief delay for ports to release
npm run test:e2e
```

2. **Increase Expo startup timeout:**
```typescript
{
  command: 'cd ../mobile && ...',
  url: 'http://localhost:8082',
  timeout: 180000,  // Increase to 3 minutes
}
```

3. **Verify Expo health before continuing:**
```bash
curl --retry 10 --retry-delay 1 --retry-all-errors http://localhost:8082
```

---

### 5. **Content Check Returns All False** ⚠️ HIGH
**Test failure:** "Content check: greeting=false, welcome=false, getStarted=false"

**Root causes (in priority order):**

1. **App stuck in loading state**
   - `/auth/me` endpoint returns error
   - E2E_AUTH_BYPASS not active
   - Database empty (user doesn't exist)
   - App shows "Loading..." indefinitely

2. **Wrong screen rendering**
   - Auth context not initialized
   - User object null
   - Unauthenticated (public) screen not showing "Get Started"
   - App routing broken

3. **DOM not rendered**
   - Page loaded but app JS didn't execute
   - Expo Metro bundler failed
   - React error (console logs would show this)

**What should be visible:**
- **Unauthenticated:** Public landing page with "Meet Without Fear", "Get Started", and tagline
- **Authenticated:** Home screen with "Hi [username]" greeting
- The test expects to see AT LEAST ONE of these

**Diagnostic steps:**
1. Check console logs (test already captures them): `page.on('console')`
2. Look at screenshots: `test-results/homepage-initial.png`, `homepage-stuck-loading.png`, `homepage-loaded.png`
3. Verify Expo build logs for JS errors
4. Verify backend `/auth/me` is responding with user data

---

## Environment Variables Status

### Backend `.env` File
**File:** `backend/.env`

✅ Has DATABASE_URL
✅ Has CLERK configuration (placeholders but valid)
✅ Has ABLY_API_KEY
❌ **MISSING:** E2E_AUTH_BYPASS (not in .env, only passed via playwright config)
❌ **MISSING:** MOCK_LLM (not in .env, only passed via playwright config)

This is OK as long as they're passed via the process.env in playwright config.

### E2E Config
**File:** `e2e/.env.test`

✅ Has DATABASE_URL (pointing to test database)
✅ Has EXPO_PUBLIC_API_URL  
❌ Missing: E2E_AUTH_BYPASS (but loaded dynamically in config)
❌ Missing: MOCK_LLM (but loaded dynamically in config)

### Mobile Config
**File:** `mobile/.env`

✅ Has EXPO_PUBLIC_E2E_MODE=true ← **This is critical and IS set correctly**
✅ Has EXPO_PUBLIC_API_URL=http://localhost:3002

---

## Configuration Checklist

Use this to verify everything is set up correctly:

```bash
# 1. Verify E2E mode is enabled in mobile app
grep "EXPO_PUBLIC_E2E_MODE" mobile/.env  # Should show: EXPO_PUBLIC_E2E_MODE=true

# 2. Verify API URL is correct
grep "EXPO_PUBLIC_API_URL" mobile/.env  # Should show: EXPO_PUBLIC_API_URL=http://localhost:3002

# 3. Verify test database exists
psql -l | grep meet_without_fear_test  # Should show test database

# 4. Clean up any running servers
npm run kill:api 2>/dev/null || true
npm run kill:mobile 2>/dev/null || true

# 5. Reset test database
DATABASE_URL=postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear_test npm run db:reset

# 6. Run specific test file with verbose logging
cd e2e && npx playwright test tests/homepage.spec.ts --debug
```

---

## Recommended Fixes (In Order)

### Immediate (Must Fix)
1. **Enable global setup** in `e2e/playwright.config.ts`
2. **Update homepage.spec.ts** to seed user and set E2E headers
3. **Force server restart** by setting `reuseExistingServer: false` or `!process.env.CI`
4. **Kill any existing servers** before running tests

### Short-term (Should Fix)
5. Verify environment variable passing: Add logging to backend startup
6. Increase Expo timeout from 120s to 180s
7. Add database reset before each test run

### Long-term (Nice to Have)
8. Create a test setup helper that initializes both backend and Expo servers properly
9. Add health checks for both API and Expo servers
10. Consider using Docker containers for isolated, repeatable test environments

---

## Next Steps for User

1. **Apply the immediate fixes above**
2. **Try running tests again:**
   ```bash
   cd /home/ubuntu/.openclaw/workspace/meet-without-fear
   npm run kill:api 2>/dev/null || true
   npm run kill:mobile 2>/dev/null || true
   sleep 1
   cd e2e && npx playwright test tests/homepage.spec.ts --debug
   ```
3. **Capture output** and check:
   - Does backend start with `E2E_AUTH_BYPASS=true`?
   - Does Expo server start successfully on :8082?
   - Are screenshots showing loading or actual content?
   - What console errors appear?

---

## Why It Works on Mac but Not Linux

The most likely reasons:

1. **Process timing:** Linux processes might start slower/faster differently
2. **Port cleanup:** Mac system might clean up ports faster  
3. **Database state:** If global setup was never run, state accumulates
4. **Terminal environment:** Mac terminal might have different env vars in scope
5. **File system:** Docker/VM file systems behave differently than native macOS

The fixes above address all these by:
- Explicitly cleaning database (global setup)
- Ensuring E2E variables are always passed
- Forcing server restarts instead of reusing
- Adding explicit seeding per test
