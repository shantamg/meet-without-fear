# Domain Pitfalls: Playwright Visual Testing & Reconciler State Machine Testing

**Domain:** E2E Test Infrastructure - Visual Regression & State Transition Testing
**Researched:** 2026-02-15

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Baseline Corruption from Unreviewed Updates
**What goes wrong:** Developer runs `--update-snapshots` without reviewing diffs, commits wrong baselines, future regressions pass as "expected"

**Why it happens:**
- Playwright makes it easy to update all baselines with one command
- Developers assume failures are false positives without investigation
- PR reviews miss baseline changes in screenshot diffs

**Consequences:**
- Visual regressions become "accepted" baselines
- Trust in visual testing erodes
- Must revert to older baselines, rebuild trust

**Prevention:**
1. **PR Review Rule:** All baseline updates require manual review in PR comments
2. **Naming Convention:** Baseline filenames should be descriptive (`empathy-validation-buttons.png` not `screenshot-1.png`)
3. **Update Process:**
   ```bash
   # Step 1: Run test to see failure
   npx playwright test no-gaps-screenshot.spec.ts

   # Step 2: Review diff in HTML report
   npx playwright show-report

   # Step 3: Only update if UI change is intentional
   npx playwright test no-gaps-screenshot.spec.ts --update-snapshots

   # Step 4: Commit baseline with descriptive message
   git add e2e/tests/.../no-gaps-screenshot.spec.ts-snapshots/
   git commit -m "test: update empathy validation baseline after button style change"
   ```

**Detection:** Baseline files changing in git without corresponding UI code changes

---

### Pitfall 2: Flaky Tests from Dynamic Content
**What goes wrong:** Timestamps, typing indicators, animations cause screenshots to differ between runs, tests fail randomly

**Why it happens:**
- Forgetting to mask dynamic elements (`.timestamp`, `.typing-indicator`)
- Animations still running when screenshot is captured
- Ably realtime presence indicators showing different states

**Consequences:**
- Tests fail on CI but pass locally (or vice versa)
- Developers lose trust, skip visual tests
- Actual regressions hidden in noise

**Prevention:**
1. **Always mask dynamic content:**
   ```typescript
   await expect(page).toHaveScreenshot('panel.png', {
     mask: [
       page.locator('[data-testid^="timestamp-"]'),
       page.locator('.typing-indicator'),
       page.locator('.ably-presence'),
     ],
     animations: 'disabled', // Default, but be explicit
   });
   ```

2. **Wait for animations to complete** before screenshot:
   ```typescript
   // Wait for panel to animate in
   await expect(panelLocator).toBeVisible();
   await page.waitForTimeout(500); // Allow animation to settle
   await expect(panelLocator).toHaveScreenshot('panel.png');
   ```

3. **Use data attributes for masking** (add to components):
   ```tsx
   <Text data-dynamic="timestamp">{formattedTime}</Text>
   ```
   Then mask: `page.locator('[data-dynamic="timestamp"]')`

**Detection:** Screenshot tests fail intermittently with minor pixel differences in timestamps/animations visible in diff images

---

### Pitfall 3: Full-Page Screenshots Causing Baseline Explosion
**What goes wrong:** Every UI change anywhere on page causes visual test to fail, baselines become unmaintainable

**Why it happens:**
- Using `page.screenshot()` instead of `locator.screenshot()`
- Testing entire page when only specific component matters
- Not understanding element-level screenshot capabilities

**Consequences:**
- Baselines break on unrelated changes (header update breaks reconciler test)
- Developers stop updating baselines, disable tests
- Visual regression coverage becomes worthless

**Prevention:**
1. **Use element-level screenshots:**
   ```typescript
   // ❌ BAD: Full page (brittle)
   await expect(page).toHaveScreenshot('full-page.png');

   // ✅ GOOD: Specific component (stable)
   const validationSection = page.getByTestId('empathy-validation-section');
   await expect(validationSection).toHaveScreenshot('validation-buttons.png');
   ```

2. **Clip regions for partial pages:**
   ```typescript
   await expect(page).toHaveScreenshot('bottom-sheet.png', {
     clip: { x: 0, y: 400, width: 375, height: 267 }, // Bottom third of iPhone 12
   });
   ```

3. **Test UI components, not layouts:**
   - Focus on interactive elements (buttons, modals, panels)
   - Skip header/footer unless specifically testing navigation

**Detection:** Baselines changing in unrelated tests after UI changes, git log shows frequent baseline updates

---

### Pitfall 4: React Native Web Rendering Differences Across Platforms
**What goes wrong:** Baselines generated on macOS fail on Linux CI, tests are unreliable across developer machines

**Why it happens:**
- Font rendering differs (subpixel hinting)
- React Native web uses platform-specific CSS
- Chromium builds differ slightly between macOS/Linux

**Consequences:**
- CI failures don't reproduce locally
- Developers can't trust test results
- CI becomes unreliable, eventually disabled

**Prevention:**
1. **Use platform-specific baselines** (Playwright does this automatically):
   ```
   no-gaps-screenshot.spec.ts-snapshots/
   ├── validation-buttons-chromium-darwin.png   # macOS
   └── validation-buttons-chromium-linux.png    # Linux (CI)
   ```

2. **Set appropriate tolerance for platform differences:**
   ```typescript
   // playwright.config.ts
   expect: {
     toHaveScreenshot: {
       maxDiffPixels: 100,   // Allow platform rendering variance
       threshold: 0.2,       // YIQ color tolerance
     },
   },
   ```

3. **Run baseline generation on both platforms:**
   ```bash
   # macOS
   npx playwright test --update-snapshots

   # Linux (Docker)
   docker run -it --rm -v $(pwd):/work mcr.microsoft.com/playwright:latest \
     bash -c "cd /work/e2e && npx playwright test --update-snapshots"
   ```

**Detection:** Tests pass locally but fail on CI with "platform" in error message, diff images show minor font rendering differences

---

### Pitfall 5: Stale Cache Causing Reconciler State Mismatches
**What goes wrong:** Test verifies reconciler state via API (REFINING), but UI shows old state (HELD) because cache wasn't invalidated

**Why it happens:**
- Ably event subscription missing `queryClient.invalidateQueries`
- Race condition between API call and cache update
- Optimistic update not rolled back on error

**Consequences:**
- Visual screenshots show wrong UI state
- Tests pass with incorrect UI rendering
- Production bugs not caught in E2E tests

**Prevention:**
1. **Always invalidate cache on Ably events:**
   ```typescript
   channel.subscribe('empathy.status_updated', (message) => {
     queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
     // Wait for refetch before screenshot
     await page.waitForTimeout(1000);
   });
   ```

2. **Verify cache and API agree before screenshot:**
   ```typescript
   // Step 1: Trigger action (User B shares context)
   await userBPage.getByTestId('share-context-button').click();

   // Step 2: Verify backend state
   const response = await request.get(`/api/sessions/${sessionId}/empathy-status`);
   const apiData = await response.json();
   expect(apiData.aUnderstandingB.status).toBe('REFINING');

   // Step 3: Verify UI reflects state (wait for cache invalidation)
   await expect(userAPage.getByTestId('refinement-prompt')).toBeVisible({ timeout: 5000 });

   // Step 4: Screenshot now matches verified state
   await expect(userAPage).toHaveScreenshot('refinement-state.png');
   ```

3. **Use two-phase verification pattern** (API + UI):
   - Phase 1: API assertion (backend state correct)
   - Phase 2: UI assertion (cache synced, UI updated)
   - Phase 3: Screenshot (visual verification)

**Detection:** Screenshot shows outdated UI state, API assertions pass but UI assertions fail

---

## Moderate Pitfalls

### Pitfall 6: Infinite Reconciler Loop Without Circuit Breaker
**What goes wrong:** User A refines empathy, reconciler still finds gaps, suggests sharing again, User B shares again, loop repeats indefinitely

**Why it happens:** No limit on refinement attempts in reconciler logic

**Prevention:**
- Add backend counter for refinement attempts
- After 3 attempts, force READY status or escalate to mediation

**Backend Implementation:**
```typescript
// In runReconcilerForDirection
const previousAttempts = await prisma.empathyAttempt.count({
  where: {
    sessionId,
    authorUserId: guesserId,
    aboutUserId: subjectId,
    status: 'REFINING',
  },
});

if (previousAttempts >= 3) {
  // Circuit breaker: force READY
  await markEmpathyReady(sessionId, guesserId, subjectName);
  return;
}
```

---

### Pitfall 7: Concurrent Refinement Causing Status Conflicts
**What goes wrong:** User A and User B both refinement attempts simultaneously, status updates conflict

**Why it happens:** Asymmetric reconciler runs two directions independently, no transaction lock

**Prevention:**
- Add database-level optimistic locking (`@@unique([sessionId, authorUserId, aboutUserId])`)
- Retry on conflict with exponential backoff

---

### Pitfall 8: Screenshot Storage Bloat in CI
**What goes wrong:** CI artifacts grow unbounded, storage costs increase, artifact downloads slow

**Why it happens:** Storing all screenshots (not just failures), no cleanup policy

**Prevention:**
```typescript
// playwright.config.ts
use: {
  screenshot: 'only-on-failure', // Don't save on success
  video: 'retain-on-failure',    // Keep videos only when needed
},
```

**CI Configuration:**
```yaml
# Only upload artifacts on failure
- uses: actions/upload-artifact@v3
  if: failure()
  with:
    name: test-results
    path: e2e/test-results/
    retention-days: 7  # Auto-delete after 7 days
```

---

## Minor Pitfalls

### Pitfall 9: Hardcoded Viewport Sizes Breaking on Different Devices
**What goes wrong:** Screenshots only work for iPhone 12 (375x667), fail on iPad or Android

**Prevention:** Use responsive testIDs, don't rely on pixel positions

### Pitfall 10: Missing `.gitignore` for `test-results/`
**What goes wrong:** Actual/diff images committed to git, repository bloat

**Prevention:** Ensure `.gitignore` includes `e2e/test-results/`

### Pitfall 11: Screenshot Before Ably Event Arrives
**What goes wrong:** Screenshot taken before realtime update, shows outdated state

**Prevention:**
```typescript
// Wait for Ably event to propagate
await page.waitForTimeout(1000);
// OR use polling assertion
await expect(locator).toHaveText(/New context/, { timeout: 5000 });
```

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Baseline Generation** | Generating on feature branch, missing cross-platform variants | Generate baselines on main branch, use Docker for Linux variants |
| **Tolerance Tuning** | Setting threshold too strict (false positives) or too loose (missing regressions) | Start with defaults (threshold: 0.2, maxDiffPixels: 100), tune based on failure patterns |
| **Reconciler State Tests** | Testing happy path only, missing edge cases (timeout, concurrent, loop) | Write backend unit tests for edge cases, E2E for happy paths |
| **Stage 3-4 Integration** | Skipping Ably event subscriptions, relying only on polling | Always invalidate cache on partner events, don't rely solely on polling |

---

## Pre-Flight Checklist (Before Merging Visual Tests)

- [ ] Baselines reviewed manually in HTML report (`npx playwright show-report`)
- [ ] Dynamic content masked (timestamps, animations, typing indicators)
- [ ] Tolerance configured (maxDiffPixels: 100, threshold: 0.2 minimum)
- [ ] Element-level screenshots used (not full-page)
- [ ] Cross-platform baselines generated (macOS + Linux)
- [ ] `.gitignore` includes `test-results/` (not baselines)
- [ ] Screenshots only capture deterministic UI (no real-time indicators)
- [ ] Cache invalidation after Ably events verified
- [ ] Backend state verified via API before screenshot
- [ ] Test passes 10 consecutive times without flakiness

---

## Recovery Strategies

### Baseline Corruption Recovery
```bash
# Step 1: Revert baselines to last known good state
git log -- e2e/tests/**/*-snapshots/
git checkout <commit-hash> -- e2e/tests/**/*-snapshots/

# Step 2: Re-run tests to verify revert
npx playwright test

# Step 3: Regenerate baselines correctly
npx playwright test --update-snapshots

# Step 4: Review diffs, commit only if intentional
npx playwright show-report
```

### Flaky Test Debugging
```bash
# Step 1: Run test 50 times to identify flakiness
for i in {1..50}; do npx playwright test no-gaps-screenshot.spec.ts; done

# Step 2: Examine diff images in test-results/
ls -la e2e/test-results/no-gaps-screenshot-chromium/

# Step 3: Identify pattern (timestamps? animations? async state?)
# Look for changing content in diff highlights

# Step 4: Add masking or wait conditions
```

### CI Failure Investigation
```bash
# Step 1: Download CI artifacts
gh run download <run-id>

# Step 2: Compare CI diff with local baseline
diff test-results/screenshot-expected.png \
     e2e/tests/.../screenshot-chromium-linux.png

# Step 3: If platform difference, generate Linux baseline
docker run -it --rm -v $(pwd):/work mcr.microsoft.com/playwright:latest \
  bash -c "cd /work/e2e && npx playwright test --update-snapshots"
```

---

## Sources

- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Visual Regression Testing with Playwright Snapshots](https://nareshit.com/blogs/visual-regression-testing-with-playwright-snapshots)
- [How to Implement Playwright Visual Testing](https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view)
- [Snapshot Testing with Playwright in 2026](https://www.browserstack.com/guide/playwright-snapshot-testing)
- Project memory: `.claude/projects/.../memory/MEMORY.md` - React Query cache key patterns, panel display pattern, stage transition cache updates
- Existing codebase: `e2e/tests/two-browser-full-flow.spec.ts` for screenshot capture examples
