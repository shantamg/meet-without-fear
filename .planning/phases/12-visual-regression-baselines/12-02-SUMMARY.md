---
phase: 12-visual-regression-baselines
plan: 02
subsystem: e2e-testing
tags:
  - visual-regression
  - playwright
  - screenshot-assertions
  - testing
dependency_graph:
  requires:
    - E2E-03 (visual regression requirements)
    - 12-01-PLAN.md (global Playwright config for toHaveScreenshot)
  provides:
    - Stage 3-4 tests with visual regression assertions
    - Baseline update process documentation
  affects:
    - e2e/tests/two-browser-stage-3.spec.ts
    - e2e/tests/two-browser-stage-4.spec.ts
    - e2e/tests/needs-confirmation-visual.spec.ts
    - e2e/tests/needs-tab-visual.spec.ts
tech_stack:
  added: []
  patterns:
    - "Visual regression: toHaveScreenshot() for UI change detection"
    - "Baseline documentation: inline JSDoc for update workflow"
key_files:
  created: []
  modified:
    - path: e2e/tests/two-browser-stage-3.spec.ts
      reason: "Converted 11 screenshots to toHaveScreenshot assertions, added baseline docs"
    - path: e2e/tests/two-browser-stage-4.spec.ts
      reason: "Converted 10 screenshots to toHaveScreenshot assertions, added baseline docs"
    - path: e2e/tests/needs-confirmation-visual.spec.ts
      reason: "Converted 3 screenshots to toHaveScreenshot assertions, fixed missing expect import"
    - path: e2e/tests/needs-tab-visual.spec.ts
      reason: "Converted 4 screenshots to toHaveScreenshot assertions"
decisions:
  - decision: "Use maxDiffPixels: 100 per-screenshot for explicit tolerance"
    rationale: "Provides clear failure threshold at each screenshot point"
    alternatives: "Rely solely on global config"
  - decision: "Add baseline docs to test file JSDoc comments (not separate README)"
    rationale: "Inline documentation keeps workflow visible where tests are maintained"
    alternatives: "Separate docs/visual-regression.md file"
  - decision: "Fixed glob pattern in JSDoc to avoid TypeScript parser confusion"
    rationale: "/** */ blocks are parsed by TypeScript; simplified pattern to [test-name]-snapshots/"
    alternatives: "Use escaped asterisks or move docs outside JSDoc"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_modified: 4
  commits: 2
  screenshots_converted: 28
completed: 2026-02-17
---

# Phase 12 Plan 02: Convert Stage 3-4 Screenshots to Visual Regression Assertions Summary

**One-liner:** Converted all 28 Stage 3-4 E2E test screenshots from documentation-only `page.screenshot()` to automated `toHaveScreenshot()` visual regression assertions with baseline update documentation.

## What Was Done

### Task 1: Convert Stage 3 Test Screenshots (Commit c000245)

Converted 18 screenshots across 3 Stage 3 test files from `page.screenshot({ path: 'test-results/...' })` to `expect(page).toHaveScreenshot('name.png', { maxDiffPixels: 100 })`:

**Files converted:**
- `two-browser-stage-3.spec.ts`: 11 screenshots (initial, needs review, confirmed, common ground, continue, final - 2 users)
- `needs-confirmation-visual.spec.ts`: 3 screenshots (initial, with needs, final)
- `needs-tab-visual.spec.ts`: 4 screenshots (initial, clicked, diagnostic, final)

All screenshots now automatically fail tests when UI changes unexpectedly.

### Task 2: Convert Stage 4 Test and Add Baseline Docs (Commit b362dc2)

**Part A: Stage 4 screenshot conversion (10 screenshots)**
- `two-browser-stage-4.spec.ts`: Converted all 10 screenshots (initial, pool, ranking, overlap, agreement - 2 users)

**Part B: Baseline update documentation**

Added inline JSDoc documentation to `two-browser-stage-3.spec.ts` and `two-browser-stage-4.spec.ts`:

```
* VISUAL REGRESSION BASELINES:
* - Baselines auto-created in .spec.ts-snapshots/ on first run
* - To update after intentional UI changes: npx playwright test [test-name] --update-snapshots
* - Review diff images in test-results/ before committing updated baselines
* - Commit baselines: git add e2e/tests/[test-name]-snapshots/*.png
* - Never update baselines without understanding WHY pixels changed
```

**Bug fix:** Added missing `expect` import to `needs-confirmation-visual.spec.ts` (TypeScript error without it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript parser confusion with glob pattern in JSDoc**
- **Found during:** Task 2 TypeScript check
- **Issue:** JSDoc comment line `* - Commit baselines: git add e2e/tests/**/*-snapshots/*.png` triggered TS1109 error (Expression expected) because TypeScript parser interpreted `**/` as code syntax within JSDoc block
- **Fix:** Simplified pattern to `git add e2e/tests/[test-name]-snapshots/*.png` (placeholder pattern avoids parser confusion)
- **Files modified:** `two-browser-stage-3.spec.ts`, `two-browser-stage-4.spec.ts`
- **Commit:** b362dc2

**2. [Rule 1 - Bug] Added missing expect import**
- **Found during:** Task 2 TypeScript check
- **Issue:** `needs-confirmation-visual.spec.ts` used `expect().toHaveScreenshot()` but didn't import `expect` from `@playwright/test`, causing TS2339 error (Property 'toHaveScreenshot' does not exist)
- **Fix:** Added `expect` to import statement
- **Files modified:** `needs-confirmation-visual.spec.ts`
- **Commit:** b362dc2

## Verification Results

All success criteria met:

1. **No old-style screenshots remain:** `grep -r "\.screenshot(" [files]` returns 0 matches ✓
2. **Stage 3 toHaveScreenshot count:** 11 (two-browser-stage-3.spec.ts) ✓
3. **Stage 4 toHaveScreenshot count:** 10 (two-browser-stage-4.spec.ts) ✓
4. **Baseline docs exist:** Both Stage 3 and Stage 4 files contain "update-snapshots" text ✓
5. **TypeScript compiles:** `npm run check` passes ✓

## Impact

**Visual Regression Coverage:**
- **Before:** 28 screenshots taken for documentation only (no automation benefit)
- **After:** 28 visual regression assertions that fail tests when UI changes unexpectedly
- **Benefit:** UI regressions in Stage 3-4 flows now caught automatically in CI

**Developer Workflow:**
- Baseline update process documented inline where developers read tests
- Clear workflow: run test → review diff → update baseline → commit
- Warning against blind baseline updates (must understand WHY pixels changed)

## Testing

No new tests added (converted existing screenshot calls to assertions). Tests will fail on first run until baselines are generated:

```bash
# Generate baselines (first run)
cd e2e && npx playwright test two-browser-stage-3
cd e2e && npx playwright test two-browser-stage-4

# Update baselines after UI changes
cd e2e && npx playwright test two-browser-stage-3 --update-snapshots
```

## Next Steps

Plan 12-02 complete. Phase 12 execution pending if additional plans exist. Visual regression baselines now protect Stage 3-4 UI integrity.

## Self-Check: PASSED

**Files exist:**
```bash
# All 4 modified test files exist and contain toHaveScreenshot assertions
FOUND: e2e/tests/two-browser-stage-3.spec.ts (11 toHaveScreenshot calls)
FOUND: e2e/tests/two-browser-stage-4.spec.ts (10 toHaveScreenshot calls)
FOUND: e2e/tests/needs-confirmation-visual.spec.ts (3 toHaveScreenshot calls)
FOUND: e2e/tests/needs-tab-visual.spec.ts (4 toHaveScreenshot calls)
```

**Commits exist:**
```bash
FOUND: c000245 (Task 1: Stage 3 screenshots converted)
FOUND: b362dc2 (Task 2: Stage 4 screenshots converted + baseline docs)
```

**Verification commands passed:**
```bash
# No old-style screenshots
grep "\.screenshot(" [files] → 0 matches

# toHaveScreenshot assertions present
grep -c "toHaveScreenshot" two-browser-stage-3.spec.ts → 11
grep -c "toHaveScreenshot" two-browser-stage-4.spec.ts → 10

# Baseline docs exist
grep "update-snapshots" [files] → 2 matches

# TypeScript compiles
npm run check → exit 0
```

All success criteria verified. Plan execution complete.
