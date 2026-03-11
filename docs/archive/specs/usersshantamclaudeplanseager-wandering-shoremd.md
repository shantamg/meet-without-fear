# E2E Test: Single User Flow with Real Ably

## Summary

Implement a comprehensive E2E test that validates the single user journey from session creation through sending an empathy draft. Uses real Ably for message delivery and mocked LLM responses from a YAML fixture file.

---

## Scope

### In Scope
- Single user flow: create session → sign compact → chat → invitation draft → mark sent → chat → feel-heard check → confirm heard → chat → empathy draft → send empathy
- Real Ably message delivery (not mocked)
- Mocked LLM responses from flat-array YAML fixture
- POST /api/e2e/seed endpoint for explicit user setup
- Cleanup of deprecated E2E tests
- Adding missing testIDs to mobile components

### Out of Scope
- Two-user concurrent tests
- Desktop viewport testing
- Partner joining the session
- Database schema changes (no fixtureId column)
- Complex fixture section navigation (postInvitationSent, postFeelHeard)

---

## User Stories

### US-1: Simplify Fixture Format

**Description:** As a developer, I want the fixture format to be a simple flat array so that I can easily map message indices to AI responses.

**Acceptance Criteria:**
- [ ] `e2e-fixtures.ts` exports `getFixtureResponse(fixtureId: string, index: number): string`
- [ ] Function loads YAML from `E2E_FIXTURES_PATH` directory
- [ ] Returns `responses[index].ai` content from fixture
- [ ] Returns empty string or throws if index out of bounds
- [ ] Unit test in `backend/src/lib/__tests__/e2e-fixtures.test.ts` passes

### US-2: Connect Fixtures to Orchestrator

**Description:** As a developer, I want the AI orchestrator to use fixture responses when E2E_FIXTURE_ID is set so that E2E tests get predictable AI responses with proper tags.

**Acceptance Criteria:**
- [ ] When `MOCK_LLM=true` AND `E2E_FIXTURE_ID` is set, orchestrator calls `getFixtureResponse()`
- [ ] Response index derived from session message count (excluding system messages)
- [ ] Fixture response includes `<thinking>` and `<draft>` tags that trigger UI panels
- [ ] Existing `getMockResponse()` fallback still works when `E2E_FIXTURE_ID` is not set
- [ ] Backend unit tests pass: `npm run test --workspace=backend`

### US-3: Create E2E Seed Endpoint

**Description:** As a test author, I want a POST /api/e2e/seed endpoint so that I can explicitly create test users before running E2E tests.

**Acceptance Criteria:**
- [ ] Endpoint accepts `{ email: string, name?: string }` in request body
- [ ] Endpoint accepts `{ fixtureId: string }` to load user from fixture seed
- [ ] Returns 201 with `{ id, email, name }` on success
- [ ] Returns 400 if email doesn't end in `@e2e.test`
- [ ] Returns 403 if `E2E_AUTH_BYPASS` is not `true`
- [ ] User is created in database with `clerkId: e2e_{id}`

### US-4: Add Missing TestIDs

**Description:** As a test author, I want all interactive elements to have testIDs so that Playwright can reliably select them.

**Acceptance Criteria:**
- [ ] `UnifiedSessionScreen.tsx` line ~1597: invitation container has `testID="invitation-draft-panel"`
- [ ] `FeelHeardConfirmation.tsx` primary button has `testID="feel-heard-yes"`
- [ ] `FeelHeardConfirmation.tsx` secondary button has `testID="feel-heard-not-yet"`
- [ ] TypeScript compiles: `npm run check`

### US-5: Create Fixture YAML

**Description:** As a test author, I want a complete fixture file with AI responses for the full user journey so that the E2E test can run end-to-end.

**Acceptance Criteria:**
- [ ] File created at `e2e/fixtures/user-a-full-journey.yaml`
- [ ] Contains `name`, `description`, and `responses` array
- [ ] Response 0: Initial greeting (no panels)
- [ ] Response 1: Response with `<draft>` tag (triggers invitation panel)
- [ ] Response 2: Post-invitation response
- [ ] Response 3: Response with `FeelHeardCheck: Y` in `<thinking>` tag
- [ ] Response 4: Post-feel-heard response
- [ ] Response 5: Response with `<draft>` tag and `ReadyShare: Y` (triggers empathy panel)
- [ ] YAML is valid: `npx js-yaml e2e/fixtures/user-a-full-journey.yaml`

### US-6: Write the E2E Test

**Description:** As a developer, I want a Playwright test that validates the single user journey so that I can catch regressions in the core user flow.

**Acceptance Criteria:**
- [ ] Test file at `e2e/tests/single-user-journey.spec.ts`
- [ ] `describe('Single User')` with `test('new session to empathy draft')`
- [ ] Uses iPhone 12 viewport
- [ ] Calls POST /api/e2e/cleanup before test
- [ ] Calls POST /api/e2e/seed to create user
- [ ] Navigates to session and signs compact
- [ ] Sends messages and waits for AI response text (5s timeout)
- [ ] Asserts invitation panel appears after response with `<draft>`
- [ ] Clicks share button and continues
- [ ] Asserts feel-heard check appears after response with `FeelHeardCheck: Y`
- [ ] Clicks feel-heard-yes button
- [ ] Asserts empathy panel appears after response with empathy `<draft>`
- [ ] Clicks share-empathy-button
- [ ] Calls GET /sessions/:id/state and verifies empathy was sent
- [ ] Test passes: `cd e2e && npx playwright test single-user-journey.spec.ts`

### US-7: Delete Old E2E Tests

**Description:** As a developer, I want deprecated E2E tests removed so that the test suite is clean and maintainable.

**Acceptance Criteria:**
- [ ] Deleted: `e2e/tests/invitation-accept.spec.ts`
- [ ] Deleted: `e2e/tests/invitation-flow.spec.ts`
- [ ] Deleted: `e2e/tests/stage1-to-stage2.spec.ts`
- [ ] Deleted: `e2e/fixtures/invitation-accept.yaml`
- [ ] Deleted: `e2e/fixtures/invitation-flow.yaml`
- [ ] Deleted: `e2e/fixtures/stage1-to-stage2.yaml`
- [ ] Kept: `e2e/tests/homepage.spec.ts` and `e2e/fixtures/homepage.yaml`
- [ ] No broken imports: `npm run check`

---

## Functional Requirements

### FR-1: Fixture Loading
The system shall load YAML fixtures from the path specified in `E2E_FIXTURES_PATH` environment variable.

### FR-2: Index-Based Response Selection
The system shall return the AI response at index N where N equals the count of user messages sent in the session.

### FR-3: E2E User Seeding
The system shall provide an API endpoint to create test users with emails ending in `@e2e.test`.

### FR-4: Cascade Cleanup
The system shall delete all data associated with `@e2e.test` users via cascade deletes when POST /api/e2e/cleanup is called.

### FR-5: Real Ably Integration
E2E tests shall use real Ably for message delivery, not mocked Ably.

---

## Non-Functional Requirements

### NFR-1: Test Timeout
Each wait for AI response shall timeout after 5 seconds maximum.

### NFR-2: Mobile Viewport
E2E tests shall run on iPhone 12 viewport dimensions.

### NFR-3: Test Isolation
Each test run shall start with a clean database state (no leftover @e2e.test users).

### NFR-4: CI Compatibility
Tests shall pass consistently in CI environment with same configuration as local.

---

## Implementation Phases

### Phase 1: Foundation (US-1, US-3)
**Tasks:**
- Update `e2e-fixtures.ts` to support flat array format
- Add POST /api/e2e/seed endpoint

**Verification:**
```bash
npm run test --workspace=backend
```

### Phase 2: Orchestrator Integration (US-2)
**Tasks:**
- Modify `ai-orchestrator.ts` to use fixture responses when E2E_FIXTURE_ID is set
- Add message count logic for index selection

**Verification:**
```bash
npm run test --workspace=backend
npm run check
```

### Phase 3: Mobile TestIDs (US-4)
**Tasks:**
- Add testIDs to UnifiedSessionScreen.tsx
- Add testIDs to FeelHeardConfirmation.tsx

**Verification:**
```bash
npm run check
```

### Phase 4: E2E Test (US-5, US-6, US-7)
**Tasks:**
- Create `user-a-full-journey.yaml` fixture
- Write `single-user-journey.spec.ts` test
- Delete old E2E test files and fixtures

**Verification:**
```bash
cd e2e && npx playwright test single-user-journey.spec.ts
npm run check
```

---

## Definition of Done

- [ ] All user stories have passing acceptance criteria
- [ ] `npm run check` passes (no type errors)
- [ ] `npm run test` passes (unit tests)
- [ ] `cd e2e && npx playwright test single-user-journey.spec.ts` passes
- [ ] Old E2E tests deleted
- [ ] No console errors during E2E test run

---

## Technical Reference

### Environment Variables
| Variable | Value | Purpose |
|----------|-------|---------|
| E2E_AUTH_BYPASS | true | Enable E2E auth headers |
| MOCK_LLM | true | Use fixture responses |
| E2E_FIXTURE_ID | user-a-full-journey | Which fixture to use |
| E2E_FIXTURES_PATH | ./e2e/fixtures | Path to fixtures |
| ABLY_API_KEY | (from .env) | Real Ably connection |

### Existing TestIDs (no changes needed)
- `chat-input`, `send-button`
- `curiosity-compact-modal`, `agree-checkbox`, `sign-compact-button`
- `view-empathy-statement-drawer`, `share-empathy-button`
- `invitation-share-button`, `invitation-continue-button`

### TestIDs to Add
- `invitation-draft-panel`
- `feel-heard-yes`
- `feel-heard-not-yet`

---

## Ralph Loop Command

```bash
claude --print "
You are implementing the E2E test specification at docs/specs/usersshantamclaudeplanseager-wandering-shoremd.md

PHASES:
1. Foundation: Update e2e-fixtures.ts for flat array format, add POST /api/e2e/seed endpoint
   Verify: npm run test --workspace=backend

2. Orchestrator: Modify ai-orchestrator.ts to use fixtures when E2E_FIXTURE_ID set
   Verify: npm run test --workspace=backend && npm run check

3. Mobile TestIDs: Add testIDs to UnifiedSessionScreen.tsx and FeelHeardConfirmation.tsx
   Verify: npm run check

4. E2E Test: Create fixture YAML, write test, delete old tests
   Verify: cd e2e && npx playwright test single-user-journey.spec.ts

VERIFICATION after each phase:
- npm run check (type checking)
- npm run test --workspace=backend (unit tests)
- Final: cd e2e && npx playwright test single-user-journey.spec.ts

ESCAPE HATCH:
After 20 iterations without progress:
1. Document what's blocking in the spec file under 'Implementation Notes'
2. List approaches attempted
3. Stop and ask for human guidance

Work through each phase sequentially. Mark user stories complete as you finish them.
" --max-iterations 30 --completion-promise "COMPLETE"
```

---

## Implementation Notes

(This section will be updated during implementation if blockers are encountered)
