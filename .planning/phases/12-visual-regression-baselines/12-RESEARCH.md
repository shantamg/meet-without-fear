# Phase 12: Visual Regression Baselines - Research

**Researched:** 2026-02-17
**Domain:** Playwright visual regression testing with toHaveScreenshot()
**Confidence:** HIGH

## Summary

Phase 12 establishes visual regression testing infrastructure for the reconciler and Stage 3-4 flows. The project currently uses `page.screenshot({ path: 'file.png' })` for documentation, which produces one-time artifacts without comparison. This phase converts these to `expect(page).toHaveScreenshot('file.png')` assertions that establish baselines, enable pixel-by-pixel comparison, and fail tests when UI changes unexpectedly.

Playwright's visual regression system is production-ready: baselines are stored in version control, tests run in milliseconds (~50ms for 1280x720), and the tooling handles dynamic content via masking. The project's existing test infrastructure (iPhone 12 viewport, devices config, two-browser harness) already ensures consistent rendering conditions - the primary work is converting existing screenshot calls and establishing baseline tolerance thresholds.

**Primary recommendation:** Convert all reconciler and Stage 3-4 screenshots to toHaveScreenshot() assertions with mask configuration for dynamic timestamps/avatars, establish baselines in CI using Playwright Docker image, and document the baseline update process for intentional UI changes.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RECON-VIS-03 | Playwright screenshots capture validation buttons (post-reconciler) for both users | toHaveScreenshot() with element locator targeting validation buttons; existing no-gaps-screenshot.spec.ts shows button locators |
| RECON-VIS-04 | Playwright screenshots capture empathy reveal state for both users | toHaveScreenshot() captures Share screen state; mask option hides dynamic timestamps |
| E2E-03 | Visual regression baselines established with toHaveScreenshot() assertions | Baseline generation workflow: first run creates baseline, subsequent runs compare; --update-snapshots flag for intentional changes |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.50.0 | Visual regression testing | Built-in toHaveScreenshot() API, pixelmatch comparison, baseline management, no additional dependencies required |

### Configuration Files
| File | Purpose | When to Update |
|------|---------|----------------|
| playwright.config.ts | Global tolerance settings (maxDiffPixels, threshold) | When establishing project-wide visual regression standards |
| e2e/tests/**/*.spec.ts-snapshots/ | Baseline image storage (auto-created) | Never manually - managed by --update-snapshots |

### No Additional Dependencies
Playwright includes all visual regression capabilities in the core package:
- pixelmatch (pixel comparison engine)
- PNG encoding/decoding
- Diff image generation
- Baseline versioning

**Installation:**
No additional packages needed - already installed in e2e/package.json

## Architecture Patterns

### Recommended Project Structure
```
e2e/
├── tests/
│   ├── two-browser-stage-3.spec.ts
│   ├── two-browser-stage-3.spec.ts-snapshots/
│   │   ├── stage-3-needs-review-user-a-iPhone-12.png       # Baseline
│   │   ├── stage-3-common-ground-user-b-iPhone-12.png      # Baseline
│   └── stage-2-empathy/reconciler/
│       ├── no-gaps-screenshot.spec.ts
│       └── no-gaps-screenshot.spec.ts-snapshots/
│           └── empathy-validation-buttons-iPhone-12.png     # Baseline
├── screenshots/                                             # Legacy (to migrate)
└── test-results/                                            # Test runs (gitignored)
```

Playwright auto-creates `-snapshots/` directories next to test files, appending device name to baseline filenames.

### Pattern 1: Converting Documentation Screenshots to Visual Regression
**What:** Replace `page.screenshot({ path: 'test-results/file.png' })` with `expect(page).toHaveScreenshot('file.png')`

**When to use:** All reconciler screenshots (RECON-VIS-03, RECON-VIS-04), all Stage 3-4 screenshots (E2E-03)

**Example:**
```typescript
// BEFORE: Documentation screenshot (no comparison)
await pageA.screenshot({ path: 'test-results/stage-3-02-needs-review-user-a.png' });

// AFTER: Visual regression assertion (baseline + comparison)
await expect(pageA).toHaveScreenshot('stage-3-02-needs-review-user-a.png', {
  maxDiffPixels: 100,  // Tolerate minor anti-aliasing differences
});
```

Source: Playwright official docs - Visual comparisons

### Pattern 2: Masking Dynamic Content
**What:** Use `mask` option to overlay pink boxes over elements that change between runs (timestamps, avatars, ads)

**When to use:** Any screenshot containing timestamps, user avatars, or personalized content

**Example:**
```typescript
// Source: https://playwright.dev/docs/api/class-pageassertions
await expect(pageB).toHaveScreenshot('empathy-reveal-user-b.png', {
  mask: [
    pageB.locator('[data-testid="message-timestamp"]'),
    pageB.locator('[data-testid="user-avatar"]'),
  ],
  maskColor: '#FF00FF',  // Pink overlay (default)
  maxDiffPixels: 100,
});
```

Dynamic elements masked at capture time - comparisons ignore masked regions.

### Pattern 3: Waiting for Stable State Before Screenshot
**What:** Wait for animations to complete, fonts to load, network to settle before capturing

**When to use:** Every visual regression assertion to avoid flaky comparisons

**Example:**
```typescript
// Source: https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view
await pageA.waitForLoadState('networkidle');
await pageA.waitForTimeout(1000);  // Allow animations to settle

await expect(pageA).toHaveScreenshot('stage-3-needs-review.png', {
  animations: 'disabled',  // Disable CSS/Web animations during capture
  maxDiffPixels: 100,
});
```

Ensures repeatable visual states across test runs.

### Pattern 4: Per-Test Tolerance Configuration
**What:** Override global tolerance settings for specific screenshots with known variability

**When to use:** Screenshots with complex gradients, shadows, or anti-aliasing that need higher tolerance

**Example:**
```typescript
// Global config in playwright.config.ts
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 50,    // Conservative global default
      threshold: 0.2,       // YIQ color difference tolerance
    },
  },
});

// Per-test override for complex UI
await expect(page).toHaveScreenshot('common-ground-visualization.png', {
  maxDiffPixels: 200,  // Higher tolerance for gradient/shadow complexity
  threshold: 0.3,
});
```

Source: Playwright official docs - PageAssertions

### Anti-Patterns to Avoid
- **Using fullPage: true for RN Web**: React Native Web renders in fixed viewport - fullPage captures empty space beyond viewport height. Use viewport-only captures (default behavior).
- **Hardcoded paths in test-results/**: Baselines must live in auto-created `-snapshots/` directories for Playwright comparison to work.
- **Skipping animations: 'disabled'**: Without this, in-progress animations cause pixel differences. Always disable for visual regression.
- **No masking of timestamps**: Every test run has different timestamps - mask or tests will always fail.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Baseline management | Custom file comparison logic | Playwright's built-in --update-snapshots | Handles filename generation, device suffixes, directory structure, git integration |
| Dynamic content filtering | Custom screenshot cropping scripts | toHaveScreenshot({ mask: [...] }) | Playwright overlays masks at capture time, comparison engine ignores masked regions |
| Pixel comparison | Custom image diff libraries | Playwright's pixelmatch integration | Optimized for performance (~50ms/screenshot), generates visual diffs, configurable thresholds |
| CI consistency | Custom Docker setup | Playwright Docker images (mcr.microsoft.com/playwright) | Pre-configured fonts, rendering engines, system libraries for deterministic screenshots |

**Key insight:** Playwright's visual regression system is deeply integrated with test infrastructure - custom solutions lose retry logic, parallel execution support, reporter integration, and baseline versioning. The API surface is small (toHaveScreenshot), but the implementation handles dozens of edge cases (font loading, sub-pixel rendering, color space conversions).

## Common Pitfalls

### Pitfall 1: Generating Baselines Locally Instead of CI
**What goes wrong:** Screenshots look identical on developer's machine but fail in CI due to font rendering differences, GPU acceleration, OS-level anti-aliasing

**Why it happens:** macOS/Windows/Linux render fonts differently. Local development machines use GPU-accelerated rendering while CI uses headless software rendering.

**How to avoid:**
1. Generate baselines in CI using Playwright Docker image
2. Use --update-snapshots in CI after visual changes are approved
3. Commit baselines from CI, not local machine

**Warning signs:** Tests pass locally, fail in CI with "pixel mismatch" errors on text/borders

Source: https://bug0.com/knowledge-base/playwright-visual-regression-testing - "Generate baselines in CI, not locally"

### Pitfall 2: Not Masking Dynamic Timestamps/Avatars
**What goes wrong:** Every test run fails because timestamps changed (e.g., "2 minutes ago" → "3 minutes ago")

**Why it happens:** Screenshots capture exact pixels - any dynamic content causes pixel differences

**How to avoid:**
```typescript
await expect(page).toHaveScreenshot('chat-timeline.png', {
  mask: [
    page.locator('[data-testid$="-timestamp"]'),  // Mask all timestamp elements
    page.locator('img[alt*="avatar"]'),            // Mask avatar images
  ],
});
```

**Warning signs:** Tests fail consistently with changes only in timestamp/date areas of screenshots

Source: https://medium.com/@thananjayan1988/playwright-mask-the-dynamic-web-content-in-webpage-2e5583a204bf

### Pitfall 3: Forgetting animations: 'disabled'
**What goes wrong:** Flaky test failures - screenshot captured mid-animation shows different pixel states

**Why it happens:** CSS transitions/animations run asynchronously. Screenshot timing varies, capturing different animation frames.

**How to avoid:**
```typescript
await expect(page).toHaveScreenshot('modal-open.png', {
  animations: 'disabled',  // Critical - freezes all CSS/Web animations
  maxDiffPixels: 50,
});
```

**Warning signs:** Tests pass 80% of the time, fail 20% with differences in elements that animate (modals, panels, transitions)

Source: Playwright official docs - toHaveScreenshot animations option

### Pitfall 4: Using Overly Tight Thresholds
**What goes wrong:** Tests fail after browser updates due to minor sub-pixel rendering changes in anti-aliasing

**Why it happens:** Browser rendering engines evolve - Chrome 120 → 121 may change font hinting, anti-aliasing algorithms

**How to avoid:**
- Start with maxDiffPixels: 100-200 for complex UIs
- Use threshold: 0.2-0.3 for color-sensitive comparisons
- Monitor failure patterns after browser updates
- Acceptable to update baselines after browser version changes if differences are cosmetic

**Warning signs:** All tests fail after Playwright version update with tiny pixel differences at text edges

Source: https://www.linkedin.com/pulse/dont-mask-dynamic-elements-playwright-before-you-read-eugene-truuts

### Pitfall 5: Not Waiting for Fonts to Load
**What goes wrong:** First few test runs use fallback fonts (Arial), later runs use custom fonts (Inter) - pixel mismatch

**Why it happens:** Web fonts load asynchronously. Playwright may capture before font finishes loading.

**How to avoid:**
```typescript
await page.waitForLoadState('networkidle');  // Wait for network requests
await page.waitForTimeout(1000);             // Additional buffer for font paint
await expect(page).toHaveScreenshot('landing.png');
```

**Warning signs:** Baseline images show different fonts than subsequent runs, text width/kerning differs

Source: https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view - "Wait for fonts to load"

## Code Examples

Verified patterns from official sources and existing project tests:

### Converting Existing Screenshot to Visual Regression
```typescript
// Current pattern in e2e/tests/two-browser-stage-3.spec.ts (lines 232-233)
await pageA.screenshot({ path: 'test-results/stage-3-02-needs-review-user-a.png' });
await pageB.screenshot({ path: 'test-results/stage-3-02-needs-review-user-b.png' });

// Convert to visual regression assertions
await expect(pageA).toHaveScreenshot('stage-3-02-needs-review-user-a.png', {
  animations: 'disabled',
  maxDiffPixels: 100,
});
await expect(pageB).toHaveScreenshot('stage-3-02-needs-review-user-b.png', {
  animations: 'disabled',
  maxDiffPixels: 100,
});
```

Baselines auto-created in `e2e/tests/two-browser-stage-3.spec.ts-snapshots/`

### Masking Dynamic Content (Reconciler Validation Buttons)
```typescript
// Source: e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts (lines 264-282)
// Current: Documentation screenshot
const screenshotPath = path.join(SCREENSHOT_DIR, 'empathy-validation-buttons.png');
await userBPage.screenshot({ path: screenshotPath, fullPage: false });

// Convert to visual regression with masking
await expect(userBPage).toHaveScreenshot('empathy-validation-buttons.png', {
  mask: [
    userBPage.locator('[data-testid="message-timestamp"]'),
    userBPage.locator('[data-testid="user-avatar"]'),
  ],
  animations: 'disabled',
  maxDiffPixels: 100,
  fullPage: false,  // Match existing behavior
});
```

### Global Tolerance Configuration
```typescript
// Source: Playwright official docs - PageAssertions
// e2e/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      maxDiffPixels: 100,       // Allow 100 pixel difference (anti-aliasing)
      threshold: 0.2,           // YIQ color difference tolerance
      animations: 'disabled',   // Disable animations globally
    },
  },
  use: {
    viewport: { width: 375, height: 667 },  // iPhone 12 - consistent for all tests
  },
});
```

Per-test overrides: `expect(page).toHaveScreenshot('name.png', { maxDiffPixels: 200 })`

### Baseline Update Workflow
```bash
# Source: Playwright official docs - Visual comparisons

# 1. Initial run - generates baselines
cd e2e && npx playwright test two-browser-stage-3

# 2. Baselines created in -snapshots/ directories
# e2e/tests/two-browser-stage-3.spec.ts-snapshots/
#   stage-3-02-needs-review-user-a-iPhone-12.png
#   stage-3-02-needs-review-user-b-iPhone-12.png

# 3. Subsequent runs - compare against baselines
npx playwright test two-browser-stage-3

# 4. After intentional UI changes - update baselines
npx playwright test two-browser-stage-3 --update-snapshots

# 5. Review diff images in test-results/ before updating
# test-results/two-browser-stage-3/stage-3-02-needs-review-user-a-diff.png

# 6. Commit updated baselines
git add e2e/tests/**/*-snapshots/*.png
git commit -m "test: update visual regression baselines for needs panel redesign"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| page.screenshot({ path: '...' }) | expect(page).toHaveScreenshot() | Playwright 1.23+ (2022) | Screenshots become assertions - tests fail on unexpected visual changes |
| Percy, Applitools (3rd party) | Built-in Playwright visual testing | Playwright 1.23+ (2022) | No external services, faster feedback, baselines in git |
| Manual visual review | Automated pixel comparison | Playwright 1.23+ (2022) | Regressions caught in CI, not production |
| fullPage: true for all screenshots | Viewport-only for RN Web | Project standard (2026) | Avoids capturing empty space beyond fixed RN Web viewport |

**Deprecated/outdated:**
- **toMatchSnapshot() for images**: Use toHaveScreenshot() instead - optimized for image comparison with visual diff generation
- **percy snapshot commands**: Playwright's built-in system eliminates external service dependency
- **Custom pixelmatch integration**: Playwright includes pixelmatch internally with optimized configuration

## Baseline Update Process Documentation

### When to Update Baselines
1. **Intentional UI changes** (button color, spacing, layout) - update baselines after design approval
2. **Browser version updates** (Chromium 120 → 121) - acceptable to update if changes are cosmetic (font hinting, anti-aliasing)
3. **Dependency updates** (React Native Web, Expo) - update if rendering changes are expected
4. **Never update** to "make tests pass" without understanding WHY pixels changed

### Update Workflow
```bash
# Step 1: Run tests to see failures
npx playwright test two-browser-stage-3

# Step 2: Review diff images in test-results/ directory
open test-results/two-browser-stage-3-*/stage-3-*-diff.png

# Step 3: If changes are expected, update baselines
npx playwright test two-browser-stage-3 --update-snapshots

# Step 4: Re-run to verify baselines are correct
npx playwright test two-browser-stage-3

# Step 5: Commit updated baselines with descriptive message
git add e2e/tests/**/*-snapshots/*.png
git commit -m "test(visual): update Stage 3 baselines for new card design"
```

### CI Integration
```bash
# Generate baselines in CI (not locally) for consistency
# Add to CI pipeline after UI changes:
npx playwright test --update-snapshots
git config user.name "CI Bot"
git config user.email "ci@meetwithoutfear.com"
git add e2e/tests/**/*-snapshots/*.png
git commit -m "chore(ci): update visual regression baselines"
git push
```

Source: https://bug0.com/knowledge-base/playwright-visual-regression-testing

## Migration Plan for Existing Screenshots

Current state (from git status and file inspection):
- `e2e/test-results/*.png` - Gitignored test artifacts (not baselines)
- `e2e/screenshots/` - Legacy documentation screenshots (empathy-validation-buttons.png)
- Existing tests use `page.screenshot({ path: 'test-results/...' })` - no assertions

### Migration Steps
1. **Identify all screenshot calls** in reconciler and Stage 3-4 tests
2. **Replace with toHaveScreenshot()** assertions with appropriate masking
3. **Generate baselines** on first run (creates -snapshots/ directories)
4. **Verify baselines** are correct (manual review of generated PNGs)
5. **Remove legacy screenshot paths** from test-results/ and screenshots/
6. **Document tolerance thresholds** in playwright.config.ts
7. **Update .gitignore** to include -snapshots/ directories (baselines must be committed)

### Files to Modify
Based on grep results, these files use `.screenshot()`:
- `e2e/tests/two-browser-stage-3.spec.ts` (8 screenshots)
- `e2e/tests/two-browser-stage-4.spec.ts` (10 screenshots)
- `e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts` (1 screenshot)
- `e2e/tests/needs-confirmation-visual.spec.ts` (3 screenshots)
- `e2e/tests/needs-tab-visual.spec.ts` (4 screenshots)
- Additional reconciler tests (offer-optional, offer-sharing-refinement, etc.)

All should convert to toHaveScreenshot() for RECON-VIS-03, RECON-VIS-04, E2E-03 requirements.

## Open Questions

1. **Should baselines be device-specific?**
   - What we know: Playwright appends device name to baseline filenames (`-iPhone-12.png`)
   - What's unclear: Should tests verify consistency across devices or only iPhone 12?
   - Recommendation: Start with iPhone 12 only (matches existing test configuration). Add iPad/Android baselines in v2 if cross-device testing becomes priority.

2. **How strict should maxDiffPixels be?**
   - What we know: Anti-aliasing, font hinting cause small pixel differences across runs
   - What's unclear: Optimal threshold for React Native Web rendering
   - Recommendation: Start with 100 pixels (0.02% of 375x667 viewport), increase to 200 if flaky. Monitor failure patterns over 10 test runs to calibrate.

3. **Should all screenshots become visual regression assertions?**
   - What we know: Requirements specify reconciler (RECON-VIS-03, RECON-VIS-04) and Stage 3-4 (E2E-03)
   - What's unclear: Should Stage 0-1 screenshots also convert?
   - Recommendation: Convert only reconciler + Stage 3-4 per requirements. Stage 0-1 can remain documentation screenshots until requirements expand.

## Sources

### Primary (HIGH confidence)
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots) - Official toHaveScreenshot() API, configuration options
- [Playwright PageAssertions API](https://playwright.dev/docs/api/class-pageassertions) - Complete option signatures (mask, animations, maxDiffPixels, threshold)
- Project codebase - `/Users/shantam/Software/meet-without-fear/e2e/tests/*.spec.ts` - Existing screenshot patterns, viewport configuration

### Secondary (MEDIUM confidence)
- [Bug0: Playwright Visual Regression Testing 2026](https://bug0.com/knowledge-base/playwright-visual-regression-testing) - CI best practices, baseline generation workflow
- [OneUpTime: Playwright Visual Testing (Jan 2026)](https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view) - Font loading, stabilization techniques
- [Medium: Masking Dynamic Content](https://medium.com/@thananjayan1988/playwright-mask-the-dynamic-web-content-in-webpage-2e5583a204bf) - Mask option examples

### Tertiary (LOW confidence)
- [LinkedIn: Don't Mask Before Reading](https://www.linkedin.com/pulse/dont-mask-dynamic-elements-playwright-before-you-read-eugene-truuts) - Threshold calibration guidance (single source, not verified with official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - toHaveScreenshot() is official Playwright API, already using @playwright/test 1.50.0
- Architecture: HIGH - Official docs, project codebase inspection, verified device configuration
- Pitfalls: MEDIUM-HIGH - Multiple 2026 sources agree on font loading, masking, CI practices; threshold calibration needs project-specific tuning

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days - Playwright is stable, visual regression API unlikely to change)
