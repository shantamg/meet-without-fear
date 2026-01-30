# Playwright E2E Testing Specification

## Overview

End-to-end testing infrastructure for Meet Without Fear using Playwright. Tests simulate two-user flows (inviter/invitee) against the Expo mobile web build with mocked LLM responses. The production app is iOS/Android only; web is used purely for E2E testing convenience.

## Decisions Summary

| Decision | Choice | Notes |
|----------|--------|-------|
| Invitation Flow | Direct API bypass | Skip website, call `POST /invitations/:id/accept` |
| Real-time Updates | Ably client, 10s timeout | Trust Ably, fail if events don't arrive |
| Test Users | Fresh per run + cleanup | Pattern: `*@e2e.test` for easy cleanup |
| Location | `e2e/` workspace at root | Isolated package.json |
| Mock Injection | Code-level override | `MOCK_LLM=true` in `getModelCompletion` |
| Fixture Format | Single YAML per test | Prisma-style seed objects + storyline arrays |
| Auth Bypass | Custom headers | `x-e2e-user-id` + `x-e2e-user-email` |
| Fixture Loading | Env var path | `E2E_FIXTURES_PATH=../e2e/fixtures` |
| App Under Test | Expo web only | Both users use mobile web |
| Server Startup | Manual (assume running) | Faster iteration |
| DB Cleanup | Before each test | Clean slate per test |
| UI Selectors | Visible text queries | `page.getByText('Invitation Sent')` |
| Compact Flow | Configurable bypass | Full UI or `x-e2e-skip-compact` header |
| Viewport | Mobile (375x667) | Two windows positioned side-by-side for two-user tests |
| Error Cases | Happy path only (v1) | Add error cases in later iteration |
| Headless | Yes, screenshots on failure | Add `--headed` option for watching tests |

---

## Scope

### In Scope (MVP)
- Playwright infrastructure setup
- E2E auth bypass in backend
- Mock LLM toggle with fixture-based responses
- YAML fixture format with Prisma-style seed + storyline
- Tests: Homepage, invitation flow (User A), invitation accept (User B), Stage 1→2 transition
- Headless mode with failure screenshots

### Out of Scope (MVP)
- Error/edge case tests
- Network failure simulation
- Multiple viewport testing
- CI/CD integration
- Website invitation flow testing

---

## User Stories

### US-1: Playwright Infrastructure Setup
**As a** developer
**I want** a configured Playwright workspace
**So that** I can write and run E2E tests

**Acceptance Criteria:**
- [ ] `e2e/` workspace exists with `package.json`, `playwright.config.ts`
- [ ] `npm install` in `e2e/` installs Playwright
- [ ] `npm run e2e` executes tests (even if no tests exist yet, exits 0)
- [ ] Viewport defaults to 375x667 (mobile)
- [ ] Screenshots captured only on failure

### US-2: E2E Auth Bypass
**As a** test
**I want** to authenticate without Clerk
**So that** tests don't depend on external auth service

**Acceptance Criteria:**
- [ ] When `E2E_AUTH_BYPASS=true`, backend accepts `x-e2e-user-id` and `x-e2e-user-email` headers
- [ ] Backend upserts user with provided email/id and attaches to `req.user`
- [ ] Normal Clerk flow unchanged when env var is false/absent
- [ ] API returns 401 if headers missing when bypass enabled but no Clerk token

### US-3: Mock LLM Toggle
**As a** test
**I want** deterministic AI responses
**So that** tests can assert on specific outputs

**Acceptance Criteria:**
- [ ] When `MOCK_LLM=true`, `getModelCompletion` skips Bedrock and returns null (triggering mock path)
- [ ] Backend reads fixture from `E2E_FIXTURES_PATH` when session has `e2e_fixture_id`
- [ ] Backend tracks `responseIndex` per user per session
- [ ] Response returned is `fixture.storyline[userId][responseIndex].ai`
- [ ] Index increments after each response

### US-4: Fixture Loader
**As a** test author
**I want** YAML fixtures with seed data and storylines
**So that** tests have predictable starting states and responses

**Acceptance Criteria:**
- [ ] Fixtures are YAML files in `e2e/fixtures/`
- [ ] Fixture format includes `name`, `description`, `seed`, `storyline` sections
- [ ] `seed.users` creates users via Prisma-style objects
- [ ] `seed.session` creates session with specified state
- [ ] `storyline.<userId>` is array of `{user, ai}` exchange pairs
- [ ] Backend loads fixture by ID from `E2E_FIXTURES_PATH`

### US-5: Database Cleanup Helper
**As a** test
**I want** clean database state before each test
**So that** tests don't affect each other

**Acceptance Criteria:**
- [ ] Helper function deletes all users where email matches `*@e2e.test`
- [ ] Cascades to related data (sessions, messages, etc.)
- [ ] Can be called from test `beforeEach` hook
- [ ] Executes in < 2 seconds

### US-6: Homepage Test
**As a** test suite
**I want** a basic smoke test
**So that** I can verify the app loads

**Acceptance Criteria:**
- [ ] Test navigates to `http://localhost:8081`
- [ ] Test asserts greeting/welcome text is visible
- [ ] Test passes in < 10 seconds

### US-7: Invitation Flow Test (User A)
**As a** test suite
**I want** to test the full invitation creation flow
**So that** I can verify User A can create and send invitations

**Acceptance Criteria:**
- [ ] User A creates new session
- [ ] User A signs compact (full UI interaction)
- [ ] User A exchanges messages (per fixture storyline)
- [ ] AI response includes `<draft>` with invitation text
- [ ] User A taps "I've sent it"
- [ ] "Invitation Sent" indicator appears in chat timeline
- [ ] AI response after marking sent is appropriate

### US-8: Invitation Accept Test (User B)
**As a** test suite
**I want** to test invitation acceptance
**So that** I can verify User B can join a session

**Acceptance Criteria:**
- [ ] User B accepts invitation via `POST /invitations/:id/accept` API
- [ ] User B signs compact
- [ ] User B sees chat with "Invitation Accepted" indicator
- [ ] User B sees "Compact Signed" indicator
- [ ] User B sees first AI message

### US-9: Stage 1 to Stage 2 Transition Test
**As a** test suite
**I want** to test witnessing completion and stage transition
**So that** I can verify the core therapy flow works

**Acceptance Criteria:**
- [ ] User A exchanges messages through Stage 1 witnessing
- [ ] AI response includes `FeelHeardCheck: Y` flag
- [ ] "I feel heard" button appears
- [ ] User A clicks button
- [ ] Stage 1 marked complete, Stage 2 created
- [ ] Transition message appears (Stage 2)
- [ ] User A can continue in Stage 2

---

## Technical Specification

### Directory Structure

```
e2e/
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── fixtures/
│   ├── homepage.yaml
│   ├── invitation-flow.yaml
│   ├── invitation-accept.yaml
│   └── stage1-to-stage2.yaml
├── helpers/
│   ├── auth.ts          # createAuthHeaders(email)
│   ├── cleanup.ts       # cleanupE2EData()
│   ├── fixtures.ts      # loadFixture(name)
│   ├── seed.ts          # seedFromFixture(fixture)
│   └── ably.ts          # waitForAblyEvent(channel, event, timeout)
└── tests/
    ├── homepage.spec.ts
    ├── invitation-flow.spec.ts
    ├── invitation-accept.spec.ts
    └── stage1-to-stage2.spec.ts
```

### Environment Variables

```bash
# Backend .env.e2e
E2E_AUTH_BYPASS=true
MOCK_LLM=true
E2E_FIXTURES_PATH=../e2e/fixtures
E2E_ALLOW_COMPACT_BYPASS=true  # Optional
```

### Fixture Format (YAML)

```yaml
name: "Invitation Flow - User A Only"
description: "User A creates session, signs compact, chats to invitation draft, marks sent"

seed:
  users:
    - id: "user-a"
      email: "user-a@e2e.test"
      clerkId: "e2e_clerk_user_a"
      name: "Alice Test"

storyline:
  user-a:
    - user: "I want to have a conversation with my partner about our communication issues."
      ai: |
        <thinking>
        Mode: ONBOARDING
        Intensity: 3
        FeelHeardCheck: N
        ReadyShare: N
        Strategy: Gather context about the situation
        </thinking>

        I'm glad you're taking this step. Communication challenges can feel overwhelming. Can you tell me a bit more about what's been happening between you two?

    - user: "We've been arguing a lot lately about small things, but it feels like there's something bigger underneath."
      ai: |
        <thinking>
        Mode: ONBOARDING
        Intensity: 4
        FeelHeardCheck: N
        ReadyShare: N
        Strategy: Validate and prepare invitation draft
        </thinking>

        That awareness shows real insight.

        <draft>
        Hey, I've been thinking about us. I found this app that might help us understand each other better. Would you be open to trying it with me?
        </draft>

        Here's a draft message you could send.

postInvitationSent:
  - user: null
    ai: |
      <thinking>
      Mode: WITNESS
      Intensity: 2
      FeelHeardCheck: N
      Strategy: Prepare for witnessing
      </thinking>

      That took courage. While you wait, what's been weighing on you most?
```

### AI Response Tag System

Mock responses must include proper semantic tags for the backend parser:

```xml
<thinking>
Mode: [WITNESS|PERSPECTIVE|NEEDS|REPAIR|ONBOARDING|DISPATCH]
Intensity: [1-10]
FeelHeardCheck: [Y/N]     ← Stage 1: triggers "I feel heard" button
ReadyShare: [Y/N]         ← Stage 2: triggers "Share empathy" button
Strategy: [brief description]
</thinking>

<draft>
[Optional: invitation or empathy text]
</draft>

[User-facing response text - no tags]
```

**Flag Detection (Backend):**
- `FeelHeardCheck: Y` → `/FeelHeardCheck:\s*Y/i` regex
- `ReadyShare: Y` → `/ReadyShare:\s*Y/i` regex

### Backend Changes Required

#### 1. Auth Middleware (`backend/src/middleware/auth.ts`)
Add E2E bypass path before Clerk verification:
```typescript
if (process.env.E2E_AUTH_BYPASS === 'true') {
  const e2eUserId = req.headers['x-e2e-user-id'];
  const e2eEmail = req.headers['x-e2e-user-email'];
  if (e2eUserId && e2eEmail) {
    const user = await prisma.user.upsert({
      where: { email: e2eEmail },
      create: { id: e2eUserId, email: e2eEmail, clerkId: `e2e_${e2eUserId}` },
      update: {},
    });
    req.user = user;
    return next();
  }
}
```

#### 2. Bedrock Client (`backend/src/lib/bedrock.ts`)
Short-circuit when mock mode enabled:
```typescript
export async function getModelCompletion(...) {
  if (process.env.MOCK_LLM === 'true') {
    return null; // Forces getMockResponse path in orchestrator
  }
  // ... existing Bedrock logic
}
```

#### 3. AI Orchestrator (`backend/src/services/ai-orchestrator.ts`)
Modify `getMockResponse` to load from fixture:
```typescript
function getMockResponse(context: OrchestratorContext): string {
  if (process.env.MOCK_LLM === 'true' && context.sessionFixtureId) {
    const fixture = loadFixture(context.sessionFixtureId);
    const userStoryline = fixture.storyline[context.userId];
    const response = userStoryline[context.responseIndex];
    // Increment index in session metadata
    return response.ai;
  }
  // ... existing mock logic
}
```

### Playwright Configuration

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000, // 10s for Ably events
  },
  use: {
    baseURL: 'http://localhost:8081',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 375, height: 667 },
  },
});
```

---

## Implementation Phases

### Phase 1: Infrastructure
**Deliverables:**
- `e2e/` workspace with Playwright configured
- E2E auth bypass in backend
- Mock LLM toggle in backend
- Fixture loader (reads YAML from env path)
- Cleanup helper

**Verification:** `npm run e2e` runs without errors (empty test suite OK)

### Phase 2: First Tests
**Deliverables:**
- `homepage.yaml` fixture (minimal)
- `homepage.spec.ts` test
- `invitation-flow.yaml` fixture with full storyline
- `invitation-flow.spec.ts` test

**Verification:** `npm run e2e` passes with homepage and invitation flow tests

### Phase 3: Two-User Flow
**Deliverables:**
- `invitation-accept.yaml` fixture
- `invitation-accept.spec.ts` test (User B)
- `stage1-to-stage2.yaml` fixture with witnessing storyline
- `stage1-to-stage2.spec.ts` test

**Verification:** `npm run e2e` passes all tests including two-user scenarios

---

## Verification Commands

```bash
# Run all E2E tests (headless)
cd e2e && npm run e2e

# Run specific test file
cd e2e && npx playwright test tests/invitation-flow.spec.ts

# Run with headed browser (for debugging)
cd e2e && npx playwright test --headed

# View test report
cd e2e && npx playwright show-report
```

---

## Dependencies

**Backend must be running:**
```bash
cd backend && npm run dev
```

**Expo web must be running:**
```bash
cd mobile && npm run web
```

**Database must be accessible** with E2E env vars loaded.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Ably events timeout in CI | 10s timeout should be sufficient; add retry logic if needed |
| Fixture format evolves | Version fixtures, validate schema on load |
| Test data leaks to prod DB | Strict `*@e2e.test` pattern, cleanup before each test |
| Expo web differs from native | Accept minor differences; this is for flow testing, not pixel-perfect |

