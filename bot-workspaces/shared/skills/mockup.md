# UI Mockup Skill

Generate high-fidelity mobile UI mockup screenshots and share them in Slack.

## When to Use

When the team asks you to visualize a UI idea, create a wireframe, or mock up a design variation for the MWF chat interface.

## Workflow

### 1. Create HTML Mockup

Create a static HTML file in `/tmp/` that mimics the MWF mobile chat UI.

**Base template:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375, initial-scale=1.0">
<title>MWF Mockup</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital@1&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #f6f3ec;
    color: #1a1815;
    width: 375px;
    margin: 0 auto;
  }
</style>
</head>
<body>
  <!-- Mockup content here -->
</body>
</html>
```

**MWF design tokens:**

| Token | Value |
|-------|-------|
| Background | `#f6f3ec` |
| Text | `#1a1815` |
| Text muted | `#6c6961` |
| Border | `rgba(28, 25, 20, 0.08)` |
| User bubble bg | `rgba(28, 25, 20, 0.05)` |
| AI bubble bg | transparent |
| System bubble bg | `#ffffff` |
| Accent | `#b7742f` |
| Success | `#3a8b63` |
| Serif font | `'Lora', serif` |
| Mono font | `'JetBrains Mono', monospace` |
| Stage 0 color | `#8B9DC3` (slate blue) |
| Stage 1 color | `#D4A574` (warm amber) |
| Stage 2 color | `#7BC47F` (sage green) |
| Stage 3 color | `#C084C0` (soft violet) |
| Stage 4 color | `#E8A87C` (warm coral) |

### 2. Take Screenshots with Playwright

```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/ubuntu/projects/meet-without-fear/node_modules/playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,  // retina quality
  });
  const page = await context.newPage();

  await page.goto('file:///tmp/mockup-name.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Viewport screenshot
  await page.screenshot({ path: '/tmp/slack-images/mockup-viewport.png', fullPage: false });

  // Full page screenshot
  await page.screenshot({ path: '/tmp/slack-images/mockup-full.png', fullPage: true });

  // Scroll to specific position for transition shots
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/slack-images/mockup-scrolled.png', fullPage: false });

  await browser.close();
}
main().catch(console.error);
```

Save as `/tmp/screenshot-mockup.mjs` and run with `node /tmp/screenshot-mockup.mjs`.

### 3. Review Screenshots

Always read the screenshots with the Read tool before sending to verify they show what you intend.

### 4. Upload to Slack

Use the Slack v2 file upload API (v1 `files.upload` is deprecated):

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

# Step 3: Complete upload with comment
curl -s -X POST https://slack.com/api/files.completeUploadExternal \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"files":[{"id":"'"$FILE_ID"'"}],"channel_id":"CHANNEL_ID","thread_ts":"THREAD_TS","initial_comment":"Description of this mockup"}'
```

## Tips

- Use `fullPage: true` for overview shots, `fullPage: false` for viewport-specific views
- Scroll to transition points to show how elements look during scrolling
- Create multiple HTML files for A/B comparisons
- Include a brief description with each uploaded image explaining what it shows
- mkdir -p `/tmp/slack-images/` before saving screenshots
