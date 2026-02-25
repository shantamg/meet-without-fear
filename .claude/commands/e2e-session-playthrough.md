# E2E Session Playthrough

Fully automated end-to-end session playthrough. You control two independent browser windows via two Playwright MCP servers, seed test users via the API, auto-login both browsers, and roleplay as both users interacting with the app. No human intervention needed for setup or login.

## Architecture

```
You (single agent)
  ├── playwright-a MCP → Browser A (User A, left window)
  ├── playwright-b MCP → Browser B (User B, right window)
  └── Bash → 3 background servers (backend, mobile web, website)
```

- Use `mcp__playwright-a__*` tools for **User A's browser** (left window)
- Use `mcp__playwright-b__*` tools for **User B's browser** (right window)
- Both browsers have full first-class support: snapshots, clicks, typing, screenshots, console messages.

## Prerequisites

Two Playwright MCP servers must be configured in `.mcp.json`:
```json
{
  "mcpServers": {
    "playwright-a": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "firefox", "--user-data-dir", "/tmp/mcp-browser-a"] },
    "playwright-b": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "firefox", "--user-data-dir", "/tmp/mcp-browser-b"] }
  }
}
```
Restart Claude Code after updating `.mcp.json` so both Playwright servers initialize.

## Instructions

You MUST use the Playwright MCP tools to perform this workflow. Do NOT skip any phase. Start with Phase 0 to launch all servers.

---

## Phase 0: Start Servers & Pre-flight Checks

This phase starts all three dev servers in the background, verifies they're healthy, and checks the CORS config.

### Step 1: Kill any existing servers on the required ports

```bash
# Kill anything on ports 3000 (backend), 3001 (website), 8081 (expo)
lsof -ti :3000 | xargs kill -9 2>/dev/null; \
lsof -ti :3001 | xargs kill -9 2>/dev/null; \
lsof -ti :8081 | xargs kill -9 2>/dev/null; \
echo "Ports cleared"
```

### Step 2: Verify CORS allows all headers in E2E mode

Before starting servers, check that `backend/src/app.ts` uses a wildcard `allowedHeaders` when `E2E_AUTH_BYPASS=true`. The `react-native-sse` library sends `Cache-Control` and `X-Requested-With` headers via `XMLHttpRequest`, which trigger CORS preflight. If these aren't allowed, the browser silently strips them and all SSE streaming requests fail with "Access to this session denied" (FORBIDDEN).

Look for this pattern in `app.ts`:
```typescript
const corsOptions: cors.CorsOptions = { origin: corsOrigins };
if (process.env.E2E_AUTH_BYPASS === 'true') {
  corsOptions.allowedHeaders = '*';
}
app.use(cors(corsOptions));
```

If it uses a specific list instead of `'*'`, update it to `'*'` and tell the user what you changed.

### Step 3: Verify backend .env has E2E_AUTH_BYPASS=true

Check `backend/.env` for `E2E_AUTH_BYPASS=true`. If missing, add it.

### Step 4: Start all three servers as background processes

Use the Bash tool with `run_in_background: true` for each. Run all three in parallel:

```bash
# Backend API (port 3000) — uses tsx watch, so it hot-reloads
cd /Users/shantam/Software/meet-without-fear && E2E_AUTH_BYPASS=true npm run dev:api 2>&1 | tee /tmp/e2e-backend.log
```

```bash
# Mobile web app (port 8081) — EXPO_PUBLIC_E2E_MODE must be set at bundle time
cd /Users/shantam/Software/meet-without-fear/mobile && EXPO_PUBLIC_E2E_MODE=true npx expo start --web --clear 2>&1 | tee /tmp/e2e-mobile.log
```

```bash
# Website (port 3001) — Next.js dev server
cd /Users/shantam/Software/meet-without-fear && npm run dev:website 2>&1 | tee /tmp/e2e-website.log
```

### Step 5: Wait for servers to be ready

Wait 10-15 seconds, then health-check each server:

```bash
# Backend health check
curl -sf http://localhost:3000/api/e2e/cleanup -X POST -o /dev/null && echo "Backend: OK" || echo "Backend: NOT READY"

# Mobile web check
curl -sf http://localhost:8081 -o /dev/null && echo "Mobile web: OK" || echo "Mobile web: NOT READY"

# Website check
curl -sf http://localhost:3001 -o /dev/null && echo "Website: OK" || echo "Website: NOT READY"
```

If any server isn't ready, wait another 10 seconds and retry. If still failing, check the log files:
- Backend: `tail -50 /tmp/e2e-backend.log`
- Mobile: `tail -50 /tmp/e2e-mobile.log`
- Website: `tail -50 /tmp/e2e-website.log`

If backend cleanup returns 403, `E2E_AUTH_BYPASS=true` isn't set — check the backend log.

### Log file reference

Throughout the playthrough, if anything goes wrong you can check server logs:
- **Backend**: `/tmp/e2e-backend.log`
- **Mobile web**: `/tmp/e2e-mobile.log`
- **Website**: `/tmp/e2e-website.log`

---

## Phase 1: Seed Test Users

Clean up old E2E data and create two test users via the backend API. Use Bash with curl:

```bash
# Clean up old E2E users
curl -s -X POST http://localhost:3000/api/e2e/cleanup | jq .

# Seed User A
curl -s -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@e2e.test","name":"Alice"}' | jq .

# Seed User B
curl -s -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@e2e.test","name":"Bob"}' | jq .
```

**Save the returned `id` values** — you need them for the login URLs and invitation acceptance.

---

## Phase 1.5: Accept Invitation as User B

After Alice creates the session and confirms the invitation (Phase 3 step 11), you must accept the invitation as Bob via the API. The "I've sent it - Continue" button only marks the invitation as confirmed on Alice's side — Bob's account is NOT linked to the session until the invitation is explicitly accepted.

### Steps

1. **Get the invitation ID** from the database:
```bash
cd backend && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const inv = await prisma.invitation.findFirst({
    where: { sessionId: '{SESSION_ID}' }
  });
  console.log(JSON.stringify(inv, null, 2));
  await prisma.\$disconnect();
}
main();
"
```
(substitute `{SESSION_ID}` with the session ID from the URL after Alice creates the session)

2. **Accept the invitation as Bob**:
```bash
curl -s -X POST "http://localhost:3000/api/invitations/{INVITATION_ID}/accept" \
  -H 'Content-Type: application/json' \
  -H 'x-e2e-user-id: {USER_B_ID}' \
  -H 'x-e2e-user-email: bob@e2e.test' | jq .
```

3. Verify the response shows `"status": "ACTIVE"` with both members listed.

**Why this matters**: Without this step, Bob can navigate to the session URL but will see "Partner" instead of "Alice" in the header, and the backend won't properly track Bob as a participant. Real-time events and the reconciler depend on both users being linked.

**Timing**: Run this step AFTER Alice clicks "I've sent it - Continue" in Phase 3 step 11, but BEFORE navigating Bob to the session in Phase 4.

---

## Phase 2: Launch & Auto-Login Both Browsers

**Important**: The E2E auth provider (`E2EAuthProvider.tsx`) reads `e2e-user-id` and `e2e-user-email` from `window.location.search` (query params). When `EXPO_PUBLIC_E2E_MODE=true`, Clerk is mocked out via metro config aliases and the E2E provider auto-logs in the user.

**Browser A (User A — left window):**

1. `mcp__playwright-a__browser_resize` — width: 390, height: 812
2. `mcp__playwright-a__browser_navigate` — to `http://localhost:8081/?e2e-user-id={USER_A_ID}&e2e-user-email=alice@e2e.test`
   (substitute `{USER_A_ID}` with the `id` from the seed response)

**Browser B (User B — right window):**

1. `mcp__playwright-b__browser_resize` — width: 390, height: 812
2. `mcp__playwright-b__browser_navigate` — to `http://localhost:8081/?e2e-user-id={USER_B_ID}&e2e-user-email=bob@e2e.test`
   (substitute `{USER_B_ID}` with the `id` from the seed response)

3. Wait 3 seconds for the app to render, then take snapshots of both browsers to verify login:
   - `mcp__playwright-a__browser_snapshot` — should show "Hi Alice" or the home screen
   - `mcp__playwright-b__browser_snapshot` — should show "Hi Bob" or the home screen

**Troubleshooting login failures:**
- If you see the **public landing page** ("Get Started", "Work through conflict together") instead of "Hi Alice"/"Hi Bob", it means `EXPO_PUBLIC_E2E_MODE=true` was NOT set when the Expo bundler started. The env var must be set BEFORE starting expo (it's baked in at bundle time via metro config). Check `/tmp/e2e-mobile.log` and verify Phase 0 started Expo with the env var.
- If you see the **Clerk sign-in page** (Google/Apple buttons), same issue — Clerk wasn't mocked out.
- Do NOT click "Get Started" — it leads to the Clerk auth page which won't work in E2E mode.

---

## Phase 3: User A — Create Session & Chat (Stage 0 → Stage 1)

Work in **Browser A** (`mcp__playwright-a__*` tools). You are roleplaying as Alice.

### Your Character (Alice)
You're frustrated with Bob. They keep making plans with you and canceling last minute — it's happened 4-5 times in the last couple months. You feel disrespected and like your time doesn't matter. You still care about the relationship but you're reaching a breaking point. Be authentic and emotional but not aggressive — you're hurt, not angry.

### Steps

1. Take a snapshot to see the home screen. You should see "Hi Alice" with a "New Session" button.
2. Click the **"Start new session"** button (button with text "New Session").
3. On the New Session screen:
   - There's a "First Name" text field — type "Bob" into it.
   - The "Create Session" button enables once the name is entered.
4. Click **"Create session"** button.
5. Wait for the session screen to load. Take a snapshot. You'll see the **Curiosity Compact** with a checkbox and "Begin" button.
6. Sign the compact:
   - Click the checkbox (testID: `compact-agree-checkbox`) — text says "I agree to proceed with curiosity"
   - Click the **"Begin"** button (testID: `compact-sign-button`) — note: the button text is "Begin", not "Sign"
7. A **mood check** screen appears ("How are you feeling right now?" with a slider). Click **"Continue"** (testID: `mood-check-continue-button`) to proceed with the default mood.
8. The chat screen loads. You should see the AI's first message (e.g., "Hey Alice, what's going on with Bob?") and the chat input (textbox "Type a message...").
   - **Header check:** The header should show "Bob" on the first line and a stage name like "Your Story" on the second line (NOT an online status indicator). There should be a **BookOpen icon** (not ArrowLeftRight) on the right side for the exchange history.
9. **Chat with the AI facilitator**: Send 4-6 messages about the conflict with Bob. After each message:
   - Click the send button (the img icon next to the textbox)
   - Wait 8-10 seconds for the AI response
   - Take a snapshot to read the response
   - Respond naturally to what the AI says
10. After chatting, the app will show panels or buttons. Read them and respond appropriately.
    - **Note:** Copy has been softened throughout the app. Status messages use warmer language like "Your words are held safely until Bob is ready" instead of "Waiting for Bob to finish reflecting."
11. When you see the invitation panel with "Invite Bob" and "I've sent it - Continue":
    - Do NOT click "Invite Bob" — it uses the native share API (`navigator.share`) which fails in Playwright/automated browsers.
    - Instead, click **"I've sent it - Continue"** to confirm the invitation.
    - **Important**: After this, you MUST run Phase 1.5 (accept invitation as Bob via API) before proceeding to Phase 4.
12. Continue chatting until "I feel heard" appears, then click it.
13. After completing Stage 1, tell the user: "User A (Alice) has completed Stage 1 and sent the invitation. Moving to accept invitation and then User B."

**Bug monitoring**: After each major step, check `mcp__playwright-a__browser_console_messages` with level `error`. Note any errors for the final report. If you see SSE or API errors, check `/tmp/e2e-backend.log` for the server-side error.

**Known benign errors**: `[UserSessionUpdates] Subscription error` may appear — this is a non-blocking Ably subscription race and doesn't affect the flow.

---

## Phase 4: User B — Join Session & Chat (Stage 0 → Stage 1)

Work in **Browser B** (`mcp__playwright-b__*` tools). You are now roleplaying as Bob.

**Prerequisites**: Phase 1.5 must be complete (invitation accepted via API). Bob's account must be linked to the session.

### Your Character (Bob)
You've been invited to this session by Alice. You know you've been canceling plans a lot lately. The truth is you've been overwhelmed — work has been brutal, you've been dealing with anxiety, and sometimes when the day arrives you just can't face going out. You feel guilty and didn't realize how much it was affecting Alice. You want to make things right. Be honest and vulnerable.

### Steps

1. Navigate Browser B directly to the session: `http://localhost:8081/session/{SESSION_ID}?e2e-user-id={USER_B_ID}&e2e-user-email=bob@e2e.test`
2. Wait for the session to load. You should see "Alice" (not "Partner") in the header and "Accepted Invitation" indicator — this confirms Phase 1.5 worked.
   - **Header check:** The header should show "Alice" on the first line and a stage name on the second line (e.g., "Getting Started"). A **BookOpen icon** should appear on the right with a small **dot indicator** (not a number badge) if there is new activity.
3. Sign the compact (same flow as User A — checkbox then "Begin" then mood check "Continue").
4. **Chat with the AI facilitator**: Send 4-6 messages about your perspective. After each message:
   - Wait 8-10 seconds for the AI response
   - Take a snapshot to read the response
   - Respond naturally
5. After chatting, the app will show panels or buttons. Read them and respond appropriately.

**Bug monitoring**: After each major step, check `mcp__playwright-b__browser_console_messages` with level `error`.

---

## Phase 5: Stage 2 — Empathy Exchange & Validation

After both users complete Stage 1, they enter Stage 2 (Perspective Stretch). Each user chats with the AI to draft an empathy statement about what their partner might be feeling, then shares it for validation.

### UI changes in Stage 2

- **Chapter markers**: When entering Stage 2, a chapter marker appears in the chat timeline: `——— Walking in Their Shoes ———` (testID: `chat-indicator-stage-chapter`). These are styled differently from regular indicators — larger font, no uppercase, em-dash delimiters.
- **Header stage name**: The header subtitle updates to "Walking in Their Shoes" (testID: `session-chat-header-stage-name`).
- **No more PartnerEventModal**: Partner events (empathy shared, context shared, etc.) now appear as **inline chat indicators** in the timeline, NOT as pop-up modals. You will NOT see modal dialogs blocking the screen for these events.

### Phase 5a: Empathy Drafting & Sharing (Both Users)

For **each user** (alternate between Browser A and Browser B):

1. The AI will guide the user to imagine what the other person might be going through. Chat 3-5 messages exploring the partner's perspective.
2. After sufficient exploration, the AI proposes a draft empathy statement and a **"Review what you'll share"** button appears above the chat input (testID: `empathy-review-button`).
3. Click the review button. A drawer opens showing the draft statement with **"Refine further"** and **"Share"** buttons.
4. Click **"Share"** (testID: `share-empathy-button`) to share the empathy statement with the partner.
5. An **"Empathy shared"** indicator appears in the timeline. The chat input may be hidden while waiting for the partner.
   - You may also see a **"Take a breath while you wait"** link (testID: `waiting-banner-exercise-link`) below the waiting banner. This opens breathing/grounding exercises. Optional — you can skip it for the E2E test.

**Note**: Users can share empathy at any time — the reconciler handles asymmetric timing gracefully. If User A shares before User B has completed Stage 1, the reconciler runs for the A→B direction as soon as B confirms "feel heard", and User A sees a banner like "Bob is thinking about how you might feel." The symmetric reconciler only processes directions not already handled by the asymmetric path.

**Important**: The `partner_considering_share` event has been removed. You will NOT see a "partner is considering whether to share" notification — this was deleted intentionally to reduce anxiety.

### Phase 5b: Reconciler & Share Offers

After both users share empathy, the backend reconciler analyzes gaps between each user's empathy attempt and what the partner actually expressed.

1. Wait ~20 seconds for the reconciler to process.
2. Each user may see an inline **"Sharing opportunity available"** indicator in the chat timeline (testID: `chat-indicator-share-suggestion-received`), along with the share suggestion appearing in the exchange history.
3. To view the share offer, tap the **BookOpen icon** in the header to open the **ActivityDrawer** (testID: `activity-drawer`) — a bottom sheet that slides up from the bottom at ~60% screen height.
   - The drawer header reads **"Between you and [Partner Name]"** (e.g., "Between you and Bob").
   - The drawer has two sections: **"Needs Your Attention"** (pinned at top with action items) and **"History"** (chronological list below).
   - Share offers appear in "Needs Your Attention" with two options:
     - **"Share as-is"** — shares recommended context immediately
     - **"Refine"** — opens the RefinementModalScreen (full-screen coaching chat for refining content)
   - Close the drawer by dragging it down, tapping the dimmed backdrop, or pressing Android back.
4. After sharing context, the partner enters **REFINING** state. They will:
   - See a **"[Partner] shared more context"** indicator in their chat (testID: `chat-indicator-context-shared`)
   - Need to send at least 1 message reflecting on the shared context
   - Then see **"Revisit what you'll share"** button to revise their empathy
5. Click **"Revisit what you'll share"** → drawer shows revised statement → click **"Resubmit"** (testID: `share-empathy-button`)
6. Handle share offers for both users — each may get one.

### Phase 5c: Empathy Validation (Both Users)

Once both users have finalized their empathy statements, each sees the partner's attempt as an **inline interactive card** in the chat timeline and must validate it.

1. An **EmpathyValidationCard** (testID: `empathy-validation-card`) appears directly in the chat FlatList, NOT in a separate modal or drawer. It has a distinct visual treatment:
   - Full-width card with accent-colored left border
   - Header: "[Partner Name]'s understanding" with a heart icon
   - The empathy content reveals with a deliberate animation (card entrance → content fade-in → buttons appear, ~2.5 seconds total)
   - For long statements, only 4 lines show initially with a "Read full statement" toggle
2. The card asks **"Does this feel right?"** with two buttons:
   - **"Yes, mostly"** (testID: `empathy-validation-card-yes-button`) — confirms the understanding. Card transitions to a completed state showing "You confirmed this feels right" with a green check.
   - **"Not quite yet"** (testID: `empathy-validation-card-no-button`) — opens the **ValidationCoachChat** modal for AI-mediated feedback. After completing the feedback conversation, the card transitions to "Feedback shared" state.
3. For this E2E test, click **"Yes, mostly"** for both users to advance.
4. After validation, a green **"[Partner] confirmed your understanding"** indicator appears in the other user's chat (testID: `chat-indicator-empathy-validated`).
5. Once BOTH users validate, the app automatically transitions to Stage 3.
6. Verify: A transition message appears ("You've validated each other's understanding...") and a new chapter marker: `——— What Matters Most ———`.

**Bug monitoring**: Check console errors after validation. Check both browsers to verify real-time sync of validation events via the inline indicators.

---

## Phase 6: Stage 3 — Needs & Common Ground

Stage 3 extracts each user's underlying needs from the conversation, has them confirm/adjust, then finds common ground.

### Phase 6a: Needs Extraction (Automatic)

1. After entering Stage 3, needs extraction begins automatically.
2. The AI analyzes the conversation and identifies each user's needs.
3. **Polling**: The client polls `GET /sessions/:id/needs` every 3 seconds while `extracting: true`. Wait for extraction to complete (usually 5-15 seconds).
4. A real-time event `session.needs_extracted` fires when complete.
5. Take a snapshot — you should see a needs card (testID: `needs-section`) showing AI-extracted needs.

### Phase 6b: Confirm Needs (Both Users)

For **each user**:

1. Review the extracted needs shown in the `needs-section` card.
2. Optionally click **"Adjust"** (testID: `adjust-needs-button`) to modify needs.
3. Click **"Confirm"** (testID: `confirm-needs-button`) to confirm the needs list.
4. The backend publishes `partner.needs_confirmed` to notify the partner.
5. After confirming, a share needs step may appear — click **"Share"** (testID: `share-needs-confirm-button`) to share needs for common ground analysis.

### Phase 6c: Common Ground Analysis (Automatic)

1. Once BOTH users share their needs, the backend analyzes common ground.
2. Wait ~10-15 seconds for the analysis. A loading state may appear.
3. The client calls `GET /sessions/:id/common-ground` to fetch results.
4. Two possible outcomes:
   - **Common ground found**: Cards showing overlapping needs appear (testID: `common-ground-card`)
   - **No overlap**: A "no overlap" message appears

### Phase 6d: Confirm Common Ground (Both Users)

For **each user**:

1. **If common ground exists**: Review the common ground items. Click confirm (testID: `common-ground-confirm-button`) to agree with the overlap.
2. **If no overlap**: Click continue (testID: `no-overlap-continue-button`) to proceed anyway.
3. Once BOTH users confirm, Stage 3 completes and Stage 4 begins automatically.
4. Verify: A transition message appears ("You've found common ground together..." or "Even though your needs don't overlap directly...") and a chapter marker: `——— Moving Forward Together ———`.

---

## Phase 7: Stage 4 — Strategies & Resolution

Stage 4 is the final stage where users propose strategies, rank them, create agreements, and resolve the session.

### Phase 7a: Strategy Proposals

1. After entering Stage 4, both users can propose strategies.
2. The AI may suggest strategies based on the common ground / needs.
3. Each user can type strategy ideas in the chat. The AI will help shape them.
4. Strategies appear in an anonymous pool — neither user knows who proposed what.

### Phase 7b: Ready to Rank

1. Once enough strategies are proposed, a **"Ready to rank"** button appears.
2. Click it for each user. The backend publishes `partner.ready_to_rank`.
3. Once BOTH users are ready, the ranking phase begins.

### Phase 7c: Strategy Ranking

1. A full-screen **StrategyRankingOverlay** appears showing all strategies.
2. Each user drags strategies to rank them by preference (most preferred first).
3. Submit the ranking. The backend publishes `partner.ranking_submitted`.
4. Once BOTH users submit rankings, overlap is revealed:
   - Top-3 strategies that BOTH users ranked highly are highlighted
   - These become agreement candidates

### Phase 7d: Create & Confirm Agreements

1. From the overlap, create an agreement by clicking on a strategy.
2. Fill in agreement details (description, type, duration, measure of success).
3. Submit the agreement. The partner receives an `agreement.proposed` event.
4. The partner reviews and confirms the agreement.
5. Once BOTH users confirm at least one agreement, a **"Resolve"** button appears.

### Phase 7e: Resolve Session

1. Click **"Resolve"** to complete the session.
2. The backend publishes `session.resolved` and updates session status to `RESOLVED`.
3. Both users see a completion/summary screen.
4. **The session is complete!**

---

## Phase 8: Final Report

When the playthrough is complete (session resolved, or you decide to stop), compile a summary for the user:

1. **Progress**: How far each user got (which stage, what was the last action).
2. **Bugs found**: Any console errors, broken UI, or crashes — with severity (CRITICAL / WARNING / INFO). Include relevant server log excerpts from `/tmp/e2e-*.log` if applicable.
3. **UX confusion**: Places where you (the AI) couldn't figure out what the UI wanted. These are real UX issues — if an AI can't parse it, many humans will struggle too.
4. **Real-time sync**: Did changes in one browser show up correctly in the other? Specifically check that inline indicators (empathy-validated, context-shared, stage-chapter) appear in both browsers at the right time.
5. **Performance**: Any noticeably slow responses or loading screens.
6. **New UI verification**: Verify these specific elements worked correctly:
   - BookOpen icon in header (not ArrowLeftRight)
   - Dot badge on header icon (not numeric)
   - Stage names in header subtitle (not online status)
   - Chapter markers at stage transitions
   - Inline EmpathyValidationCard with 2-step buttons
   - ActivityDrawer bottom sheet (not full-screen modal)
   - Unified timeline (not Sent/Received tabs)
   - No PartnerEventModal popups (all events inline)
   - Softened copy in waiting banners and status text
7. **Overall assessment**: Could two real users complete this flow successfully?

---

## Known Issues & Gotchas

1. **CORS blocks SSE requests without wildcard allowedHeaders**: The `react-native-sse` library uses `XMLHttpRequest` which sends `Cache-Control` and `X-Requested-With` headers, triggering CORS preflight. If `allowedHeaders` is a specific list instead of `'*'`, Firefox blocks these headers silently → backend returns FORBIDDEN. Phase 0 Step 2 catches this. The fix is `corsOptions.allowedHeaders = '*'` in E2E mode.

2. **`EXPO_PUBLIC_E2E_MODE` is bundle-time**: This env var is read by `metro.config.js` to alias `@clerk/clerk-expo` with mock modules. It must be set BEFORE starting the Expo dev server. Phase 0 handles this by passing the env var when starting Expo.

3. **Backend hot-reloads with `tsx watch`**: The `dev:api` script uses `tsx watch`, so code changes in `backend/src/` are picked up automatically. However, changes to `.env` require a full restart.

4. **`[UserSessionUpdates] Subscription error`**: This Ably subscription error appears intermittently during session setup. It's non-blocking — the subscription recovers automatically. Do not treat this as a test failure.

5. **Mood check screen**: After signing the compact, a mood slider appears before the chat. You must click "Continue" to proceed — the chat input won't appear until this is dismissed.

6. **Send button**: The send button has `data-testid="send-button"` on the parent container. The inner element is an `img`. Use the testID to click, or use `browser_evaluate` with `document.querySelector('[data-testid="send-button"]').click()`.

7. **Expo web first bundle is slow**: The first page load after `--clear` can take 15-30 seconds as Expo builds the web bundle. Be patient on the health check and browser navigate steps.

8. **"Invite Bob" button fails in Playwright**: The native share API (`navigator.share`) is not available in automated browsers. Always use "I've sent it - Continue" instead, then accept the invitation via API in Phase 1.5.

9. **Invitation must be accepted via API**: The "I've sent it - Continue" button only confirms Alice sent the invitation externally. Bob's account is NOT linked to the session until `POST /api/invitations/:id/accept` is called as Bob. Without this, Bob sees "Partner" instead of "Alice" and the session won't work correctly.

10. **Mood check repeats on page reload**: Every full page reload shows the mood check slider again, even after it was already completed. This is a known UX issue — just click "Continue" again.

11. **Playwright click timeouts on most elements**: Playwright MCP's `browser_click` frequently times out on buttons in this React Native Web app. **Workaround**: Use `browser_evaluate` with `document.querySelector('[data-testid="..."]').click()` or `document.querySelector('button[...]').click()`. This is more reliable than the built-in click.

12. **Use `pressSequentially` for typing, not `fill()`**: React Native Web textareas don't hold values set via Playwright's `fill()` method — the value clears immediately. Use `browser_type` with the `pressSequentially` option (slow typing character by character) or `browser_evaluate` with `page.getByTestId('chat-input').pressSequentially('text', { delay: 30 })` to ensure React state picks up the value.

13. **EmpathyValidationCard has a deliberate reveal delay**: The inline validation card uses a 3-phase stagger animation (~2.5 seconds total before buttons appear). Do NOT click the buttons before they're visible. After the card appears in the chat, wait at least 3 seconds before attempting to click "Yes, mostly" or "Not quite yet". If buttons aren't visible yet, take a snapshot to verify the animation state.

14. **ActivityDrawer is a bottom sheet, not a modal**: The exchange history is now a bottom-sheet drawer (testID: `activity-drawer`) that slides up from the bottom. It does NOT have tabs. It shows a unified chronological timeline. To open it, click the BookOpen icon in the header. To close it, drag it down or tap the dimmed backdrop. The drawer does NOT intercept FlatList scrolling inside it — only the drag handle at the top responds to swipe-down gestures.

15. **First message send can silently fail**: The first attempt to send a message sometimes clears the textarea but doesn't actually post the message. If the message doesn't appear in the chat after sending, try typing and sending again.

16. **Inline indicators replace all PartnerEventModal popups**: Partner events (empathy revealed, empathy validated, context shared, share suggestion) now appear as small inline indicators in the chat timeline, NOT as blocking modal dialogs. If you see a blocking modal for a partner event, that's a regression bug — report it.

17. **Chapter markers appear at stage transitions**: When entering a new stage, a chapter marker like `——— Walking in Their Shoes ———` appears in the chat. These use em-dash delimiters and are visually distinct from regular indicators (larger font, no uppercase). The first chapter marker visible is "Your Story" (Stage 1) — the ONBOARDING stage does NOT produce a marker.

---

## Quick Reference: TestID Changes

These testIDs have changed from the previous version. If you encounter references to old testIDs, use the new ones:

| Old TestID | Status | New TestID |
|------------|--------|------------|
| `activity-menu-modal` | REMOVED | `activity-drawer` |
| `activity-menu-modal-tab-sent` | REMOVED | N/A (no tabs) |
| `activity-menu-modal-tab-received` | REMOVED | N/A (no tabs) |
| `partner-event-modal` | REMOVED | N/A (inline indicators) |
| `accuracy-feedback-trigger` | REMOVED | `empathy-validation-card` |
| `accuracy-accurate-button` | REMOVED | `empathy-validation-card-yes-button` |
| `accuracy-partial-button` | REMOVED | `empathy-validation-card-yes-button` (maps to "Yes, mostly") |
| `accuracy-inaccurate-button` | REMOVED | `empathy-validation-card-no-button` ("Not quite yet") |
| `sent-item-card` | REMOVED | `timeline-item-card` |
| `received-item-card` | REMOVED | `timeline-item-card` |

New testIDs introduced:

| TestID | Component | Description |
|--------|-----------|-------------|
| `empathy-validation-card` | EmpathyValidationCard | Inline validation card in chat FlatList |
| `empathy-validation-card-yes-button` | EmpathyValidationCard | "Yes, mostly" button |
| `empathy-validation-card-no-button` | EmpathyValidationCard | "Not quite yet" button |
| `empathy-validation-card-content` | EmpathyValidationCard | Partner's empathy text |
| `empathy-validation-card-completed` | EmpathyValidationCard | Completed state indicator |
| `empathy-validation-card-superseded` | EmpathyValidationCard | Superseded state indicator |
| `activity-drawer` | ActivityDrawer | Bottom sheet drawer |
| `timeline-item-card` | TimelineItemCard | Unified timeline item in drawer |
| `chat-indicator-empathy-validated` | ChatIndicator | "[Partner] confirmed your understanding" |
| `chat-indicator-context-shared` | ChatIndicator | "[Partner] shared more context" |
| `chat-indicator-share-suggestion-received` | ChatIndicator | "Sharing opportunity available" |
| `chat-indicator-stage-chapter` | ChatIndicator | Stage chapter marker |
| `session-chat-header-activity-dot` | SessionChatHeader | Dot badge on BookOpen icon |
| `session-chat-header-stage-name` | SessionChatHeader | Stage name in header subtitle |
| `waiting-banner-exercise-link` | WaitingBanner | "Take a breath while you wait" link |

---

## Quick Reference: Tool Prefixes

| Action | User A (left) | User B (right) |
|--------|---------------|-----------------|
| Snapshot | `mcp__playwright-a__browser_snapshot` | `mcp__playwright-b__browser_snapshot` |
| Click | `mcp__playwright-a__browser_click` | `mcp__playwright-b__browser_click` |
| Type | `mcp__playwright-a__browser_type` | `mcp__playwright-b__browser_type` |
| Navigate | `mcp__playwright-a__browser_navigate` | `mcp__playwright-b__browser_navigate` |
| Screenshot | `mcp__playwright-a__browser_take_screenshot` | `mcp__playwright-b__browser_take_screenshot` |
| Console | `mcp__playwright-a__browser_console_messages` | `mcp__playwright-b__browser_console_messages` |
| Run code | `mcp__playwright-a__browser_run_code` | `mcp__playwright-b__browser_run_code` |
| Resize | `mcp__playwright-a__browser_resize` | `mcp__playwright-b__browser_resize` |

## Quick Reference: Server Logs

| Server | Log file | Port |
|--------|----------|------|
| Backend API | `/tmp/e2e-backend.log` | 3000 |
| Mobile web (Expo) | `/tmp/e2e-mobile.log` | 8081 |
| Website (Next.js) | `/tmp/e2e-website.log` | 3001 |
