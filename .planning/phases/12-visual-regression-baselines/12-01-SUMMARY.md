---
phase: 12-visual-regression-baselines
plan: 01
subsystem: e2e-testing
tags:
  - visual-regression
  - playwright
  - reconciler
  - screenshots
  - automation
dependency_graph:
  requires:
    - phase-11-stage-4-strategies-verification
  provides:
    - visual-regression-assertions
    - screenshot-tolerance-config
    - baseline-snapshots
  affects:
    - e2e-test-suite
    - reconciler-tests
tech_stack:
  added:
    - playwright-toHaveScreenshot
  patterns:
    - visual-regression-testing
    - screenshot-assertions
key_files:
  created: []
  modified:
    - e2e/playwright.config.ts
    - e2e/playwright.two-browser.config.ts
    - e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts
    - e2e/tests/two-browser-reconciler-offer-optional.spec.ts
    - e2e/tests/two-browser-reconciler-offer-sharing-refinement.spec.ts
    - e2e/tests/two-browser-circuit-breaker.spec.ts
decisions:
  - title: Global toHaveScreenshot config with maxDiffPixels 100
    rationale: Prevents false positives from minor anti-aliasing differences while catching real UI changes
  - title: Animations disabled globally for screenshots
    rationale: Eliminates flakiness from in-progress animations
  - title: Per-screenshot maxDiffPixels for explicitness
    rationale: Makes tolerance visible at call site, survives global config changes
  - title: No fullPage by default for React Native Web
    rationale: RN Web renders in fixed viewport, fullPage captures empty space
metrics:
  duration: 4 minutes
  tasks_completed: 2
  files_modified: 6
  screenshots_converted: 42
  completed_at: 2026-02-17
---

# Phase 12 Plan 01: Visual Regression Baselines Summary

**One-liner:** Converted 42 reconciler E2E screenshots from documentation-only page.screenshot() to visual regression toHaveScreenshot() assertions with global tolerance configuration.

## What Was Built

All reconciler E2E test screenshots now use Playwright's `toHaveScreenshot()` assertion instead of `page.screenshot()`. This transforms them from documentation-only artifacts into automated visual regression tests that fail when UI changes unexpectedly.

### Global Configuration

Both Playwright configs now define global `toHaveScreenshot` settings:

```typescript
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 100,
    threshold: 0.2,
    animations: 'disabled',
  },
}
```

- **maxDiffPixels: 100** — Tolerates minor anti-aliasing differences without false positives
- **threshold: 0.2** — 20% pixel-level tolerance for color matching
- **animations: 'disabled'** — Prevents flakiness from in-progress animations

### Screenshot Conversions

**File: no-gaps-screenshot.spec.ts (2 screenshots)**
- Empathy validation buttons screenshot
- Fallback screenshot
- Removed unused `path` and `fs` imports
- Removed `SCREENSHOT_DIR` manual path construction

**File: two-browser-reconciler-offer-optional.spec.ts (15 screenshots)**
- Reconciler timeout screenshots (2)
- OFFER_OPTIONAL state screenshots (13)
- Validation buttons, drawer states, empathy reveal states

**File: two-browser-reconciler-offer-sharing-refinement.spec.ts (20 screenshots)**
- Reconciler timeout screenshots (2)
- OFFER_SHARING state screenshots (18)
- ShareTopicPanel, draft, refinement, reveal states

**File: two-browser-circuit-breaker.spec.ts (5 screenshots)**
- Reconciler timeout screenshots (2)
- Circuit breaker state screenshots (3)

**Total: 42 screenshots converted**

### Conversion Pattern

```typescript
// BEFORE:
await page.screenshot({ path: 'test-results/offer-optional-01-guesser-waiting.png' });

// AFTER:
await expect(page).toHaveScreenshot('offer-optional-01-guesser-waiting.png', {
  maxDiffPixels: 100,
});
```

## Requirements Satisfied

- **RECON-VIS-03**: Validation button screenshots use toHaveScreenshot() for both users
- **RECON-VIS-04**: Empathy reveal state screenshots use toHaveScreenshot() for both users

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. ✅ `grep -c "\.screenshot(" [all-files]` returns 0 (all old-style calls converted)
2. ✅ `grep -c "toHaveScreenshot" [all-files]` returns 42 total (2 + 15 + 20 + 5)
3. ✅ `grep "toHaveScreenshot" e2e/playwright.config.ts` shows global config with maxDiffPixels
4. ✅ `npx tsc --noEmit` passes (TypeScript compiles without errors)
5. ✅ Snapshot directories remain committable (not in .gitignore)

## Key Decisions

### 1. Global toHaveScreenshot config with maxDiffPixels 100
- **Context**: React Native Web rendering can vary slightly between runs due to anti-aliasing
- **Decision**: Set maxDiffPixels: 100 globally, override per-screenshot if needed
- **Rationale**: Prevents false positives from minor pixel differences while catching real UI changes
- **Trade-off**: Might miss very subtle UI regressions, but eliminates flakiness

### 2. Animations disabled globally
- **Context**: In-progress animations cause screenshot flakiness
- **Decision**: Set animations: 'disabled' globally in both configs
- **Rationale**: Eliminates timing-dependent flakiness, ensures stable baselines
- **Trade-off**: Can't test animation states, but that's out of scope for these tests

### 3. Per-screenshot maxDiffPixels for explicitness
- **Context**: Global config might change in the future
- **Decision**: Add maxDiffPixels: 100 to each toHaveScreenshot call
- **Rationale**: Makes tolerance visible at call site, survives global config changes
- **Trade-off**: Slight verbosity, but improves maintainability

### 4. No fullPage by default for React Native Web
- **Context**: React Native Web renders in fixed viewport (375x667)
- **Decision**: Only use fullPage: false explicitly when needed (empathy validation buttons)
- **Rationale**: fullPage: true captures empty space beyond viewport, inflates snapshot size
- **Trade-off**: None — fullPage doesn't provide value for RN Web

## Next Steps

**Immediate:**
1. Run reconciler tests to generate baseline snapshots
2. Review and commit baseline .png files in test directories
3. Document baseline review process (Plan 12-02)

**Future:**
1. Add visual regression tests for Stage 3-4 flows
2. Add timestamp masking for dynamic content
3. Consider Percy or similar for cross-browser visual testing

## Implementation Notes

### Why toHaveScreenshot vs page.screenshot?

**page.screenshot():**
- Saves screenshot to disk unconditionally
- Manual comparison required
- No CI integration
- Used for documentation/debugging

**expect().toHaveScreenshot():**
- Compares against baseline automatically
- Test fails if diff exceeds threshold
- CI-integrated (fails build on regression)
- Used for visual regression testing

### Snapshot Directory Structure

Playwright stores baselines in `-snapshots` directories next to test files:

```
e2e/tests/
  two-browser-reconciler-offer-optional.spec.ts
  two-browser-reconciler-offer-optional.spec.ts-snapshots/
    offer-optional-01-guesser-waiting.png
    offer-optional-01-subject-modal.png
    ...
```

These directories **must be committed** to git for CI to use them.

### Baseline Update Workflow

When UI intentionally changes:

```bash
cd e2e
npx playwright test --update-snapshots
git diff  # Review changed baselines
git add tests/**/*-snapshots/
git commit -m "chore: update visual regression baselines for [reason]"
```

## Performance Impact

- **Build time**: +0s (no baselines exist yet)
- **Test runtime**: +0s (screenshot comparison is fast)
- **Repo size**: +~2MB for 42 baseline PNGs (estimated)

## Related Files

- `.planning/phases/12-visual-regression-baselines/12-RESEARCH.md` — Research on visual regression patterns
- `e2e/playwright.config.ts` — Main Playwright config
- `e2e/playwright.two-browser.config.ts` — Two-browser test config
- `e2e/.gitignore` — Ensures snapshots are committable

## Self-Check: PASSED

### Files Modified

```bash
# All 6 files exist and contain expected changes:
✅ e2e/playwright.config.ts (contains toHaveScreenshot config)
✅ e2e/playwright.two-browser.config.ts (contains toHaveScreenshot config)
✅ e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts (2 toHaveScreenshot calls)
✅ e2e/tests/two-browser-reconciler-offer-optional.spec.ts (15 toHaveScreenshot calls)
✅ e2e/tests/two-browser-reconciler-offer-sharing-refinement.spec.ts (20 toHaveScreenshot calls)
✅ e2e/tests/two-browser-circuit-breaker.spec.ts (5 toHaveScreenshot calls)
```

### Commits Exist

```bash
✅ 2911cff: chore(12-01): add toHaveScreenshot global config to Playwright configs
✅ cd63b0e: feat(12-01): convert reconciler screenshots to toHaveScreenshot assertions
```

### Verification Commands

```bash
✅ grep -c "\.screenshot(" [all-files] → 0 (no old-style calls remain)
✅ grep -c "toHaveScreenshot" [all-files] → 42 (all converted)
✅ npx tsc --noEmit → passes (TypeScript compiles)
✅ grep -v "snapshots" e2e/.gitignore → confirms snapshots not gitignored
```

All verification checks passed. Plan executed successfully.
