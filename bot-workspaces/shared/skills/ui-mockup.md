# UI Mockup Skill

Generate screenshots of UI mockups using static HTML + Playwright, then upload to Slack.

## When to Use

- Visualizing a proposed design change before implementation
- Showing color/layout options for team discussion
- Creating before/after comparisons of UI changes

## Prerequisites

- Playwright is installed at `<repo>/node_modules/playwright`
- `SLACK_BOT_TOKEN` env var is set

## Workflow

### 1. Create HTML Mockup

Write a static HTML file to `/tmp/mockup-<name>.html` that replicates the app's chat UI.

**MWF Chat UI Reference CSS:**

```css
/* Base */
body { font-family: 'Inter', -apple-system, sans-serif; background: #f6f3ec; color: #1a1815; width: 375px; }

/* Header */
.header { background: #f6f3ec; border-bottom: 1px solid rgba(28,25,20,0.08); padding: 12px 18px; }

/* User bubble */
.bubble-user { background: rgba(28,25,20,0.05); border: 1px solid rgba(28,25,20,0.08); padding: 12px 14px; border-radius: 14px; }

/* AI bubble */
.bubble-ai { background: transparent; padding: 6px 0; }

/* System bubble */
.bubble-system { background: #ffffff; padding: 12px 18px; border-radius: 12px; font-size: 13px; color: #6c6961; text-align: center; }

/* Empathy card */
.bubble-empathy { background: #ffffff; border-radius: 12px; border-left: 3px solid #b7742f; padding: 20px; }

/* Stage accent colors */
Stage 0 (Onboarding):         #8B9DC3  (slate blue)
Stage 1 (The Witness):        #D4A574  (warm amber)
Stage 2 (Perspective Stretch): #7BC47F  (sage green)
Stage 3 (What Matters):       #C084C0  (soft violet)
Stage 4 (Strategic Repair):   #E8A87C  (warm coral)
```

Use `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital@1&display=swap');` for fonts.

### 2. Take Screenshots with Playwright

```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('<repo>/node_modules/playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },  // iPhone-sized
    deviceScaleFactor: 2,                     // Retina quality
  });
  const page = await context.newPage();

  await page.goto('file:///tmp/mockup-<name>.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Viewport screenshot (what user sees)
  await page.screenshot({ path: '/tmp/slack-images/mockup-viewport.png', fullPage: false });

  // Full page screenshot (entire scrollable content)
  await page.screenshot({ path: '/tmp/slack-images/mockup-full.png', fullPage: true });

  // Scroll to specific position for transition views
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/slack-images/mockup-scrolled.png', fullPage: false });

  await browser.close();
}
main().catch(console.error);
```

Save as `/tmp/screenshot-mockup.mjs` and run with `node /tmp/screenshot-mockup.mjs`.

### 3. Review Before Sending

Always read the screenshots with the `Read` tool before uploading. Check:
- Does the mockup actually show what you're trying to demonstrate?
- Are fonts rendering correctly?
- Is the viewport width correct (375px for mobile)?

### 4. Upload to Slack

Use the v2 file upload API (v1 `files.upload` is deprecated):

```bash
# Step 1: Get upload URL
RESP=$(curl -s -X POST https://slack.com/api/files.getUploadURLExternal \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -F "filename=mockup.png" \
  -F "length=$(stat -c%s /tmp/slack-images/mockup.png)")

UPLOAD_URL=$(echo "$RESP" | jq -r '.upload_url')
FILE_ID=$(echo "$RESP" | jq -r '.file_id')

# Step 2: Upload file content
curl -s -X POST "$UPLOAD_URL" -F "file=@/tmp/slack-images/mockup.png"

# Step 3: Complete upload with channel and comment
curl -s -X POST https://slack.com/api/files.completeUploadExternal \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"id": "'$FILE_ID'", "title": "mockup.png"}],
    "channel_id": "CHANNEL_ID",
    "thread_ts": "THREAD_TS",
    "initial_comment": "Description of what this mockup shows"
  }'
```

## Tips

- For multiple design options, create separate HTML files and screenshot them in one script
- Include scroll positions that show transitions or key UI moments
- Keep mockup content realistic — use actual stage names, real-looking message text
- The `/tmp/slack-images/` directory persists across tool calls within a session
