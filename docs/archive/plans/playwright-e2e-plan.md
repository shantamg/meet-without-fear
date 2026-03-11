# Playwright E2E Plan: Two-User Mobile Web Flow (Mocked LLM + Auth)

## Goal
Stand up a Playwright-driven E2E flow that uses the web build of the Expo mobile app to:
1) create a session/invitation, 2) accept the invitation as a second user, and 3) exchange a few back-and-forth messages with mocked AI, ending with both users in the same active session.

## Current Code Facts (Relevant to the Plan)
- **Backend auth is strictly Clerk-based** (no test bypass) and requires `CLERK_SECRET_KEY`; the middleware verifies Clerk JWTs and upserts users by `clerkId`.【F:backend/src/middleware/auth.ts†L1-L142】
- **Expo mobile app uses Clerk for auth and wires tokens into the API client** via `setTokenProvider`, so API requests expect a valid Clerk JWT in the Authorization header.【F:mobile/app/_layout.tsx†L1-L112】【F:mobile/src/lib/api.ts†L29-L121】
- **Invitation flow relies on backend endpoints**:
  - `POST /sessions` creates a session plus invitation and returns `invitationUrl`.【F:backend/src/controllers/invitations.ts†L240-L410】
  - `createInvitationUrl` uses the website base URL and `/invitation/:id` path.【F:backend/src/utils/urls.ts†L7-L35】
  - `POST /invitations/:id/accept` activates the session, creates progress/vessels, and notifies the inviter.【F:backend/src/controllers/invitations.ts†L480-L626】
- **Website invitation page** signs out existing Clerk sessions, fetches invitation details, then (after sign-in) calls the accept API using a Clerk token.【F:website/app/invitation/[id]/page.tsx†L37-L205】
- **Messaging endpoints** include `/sessions/:id/messages` and `/sessions/:id/messages/initial` for AI responses and history, guarded by auth/session access.【F:backend/src/routes/messages.ts†L9-L61】
- **LLM mocking is implicit today**: `getModelCompletion` returns `null` if Bedrock client isn’t configured; the AI orchestrator then uses `getMockResponse` and sets `usedMock = true`.【F:backend/src/lib/bedrock.ts†L158-L321】【F:backend/src/services/ai-orchestrator.ts†L401-L540】【F:backend/src/services/ai-orchestrator.ts†L607-L637】
- **Retrieval planning has a built-in mock fallback** when planning fails, using `getMockRetrievalPlan`.【F:backend/src/services/ai-orchestrator.ts†L260-L310】【F:backend/src/services/retrieval-planner.ts†L348-L417】

## Proposed Plan (High-Level)
1. **Add Playwright for E2E** in the repo (root or a dedicated `e2e/` workspace). Configure it to run against:
   - **Expo web build** (`expo start --web`) for the mobile UI.
   - **Next.js website** for invitation acceptance (if we keep the browser-based invite flow).
2. **Introduce an explicit “mock LLM” toggle** in the backend that forces mock responses without relying on missing AWS credentials.
3. **Introduce a test-only auth bypass** in the backend (guarded by an env flag) that can mint or accept deterministic test users, so Playwright can log in without Clerk.
4. **Create Playwright scenarios** that use two isolated browser contexts to simulate both inviter and invitee, running through the session creation → invite acceptance → shared conversation flow.

## Detailed Implementation Steps

### 1) Playwright Setup
- Add Playwright as a dev dependency at the repo root (or a new `e2e` package).
- Create a config that:
  - Spins up the **backend** (`npm run dev:api`) and **web app** (`npm run dev:mobile -- --web` if using Expo web, and optionally `website` dev server for invitation acceptance).
  - Uses **two browser contexts** to simulate two distinct users.
  - Sets shared env (`E2E=true`, `MOCK_LLM=true`, `E2E_AUTH_BYPASS=true`) for the backend/clients.
- Add npm scripts like `npm run e2e` to boot servers + run Playwright.

### 2) Mock LLM Toggle (Backend)
**Why:** Today, mocks only happen when Bedrock credentials are absent, which is brittle and non-obvious.

**Plan:**
- Add an explicit env toggle like `MOCK_LLM=true` or `E2E_MOCK_LLM=true`.
- When enabled, `getModelCompletion` and other Bedrock helpers should short-circuit and return `null` (or a deterministic stub) so the AI orchestrator falls back to `getMockResponse`.【F:backend/src/lib/bedrock.ts†L158-L321】【F:backend/src/services/ai-orchestrator.ts†L401-L540】
- Ensure retrieval planning uses `getMockRetrievalPlan` as it already does on failure; for deterministic tests, consider skipping external calls and forcing the mock path.【F:backend/src/services/retrieval-planner.ts†L348-L417】

### 3) Test Auth Bypass (Backend + Client)
**Why:** `requireAuth` currently only accepts Clerk JWTs and will 401 without valid tokens.【F:backend/src/middleware/auth.ts†L1-L142】

**Plan:**
- Add an E2E-only auth path guarded by `E2E_AUTH_BYPASS=true`:
  - Accept a header (e.g., `x-e2e-user-id` + `x-e2e-user-email`) or a signed local JWT.
  - Upsert a user in Prisma and attach `req.user` similarly to the Clerk path.
- On the **Expo web** side, add a lightweight test sign-in page or hook that injects those headers/tokens for requests.
- Keep Clerk flow unchanged for production; the bypass should be gated behind env flags and only compiled in non-production.

### 4) E2E Flow Scenario (Two-User)
**Scenario: “Create session, invite partner, exchange mocked messages”**

1. **User A (Inviter) Context**
   - Launch Expo web app, authenticate via the test bypass.
   - Start a new session (UI path). This triggers `POST /sessions` and returns an invitation URL.【F:backend/src/controllers/invitations.ts†L240-L410】
   - Capture the invitation URL from the UI or call the API directly to seed test state (still validating UI).【F:backend/src/utils/urls.ts†L7-L35】

2. **User B (Invitee) Context**
   - Either:
     - **Option A:** Use the website `/invitation/:id` flow (Next.js). This page expects Clerk auth and then calls `acceptInvitation` with a Clerk token.【F:website/app/invitation/[id]/page.tsx†L37-L205】
     - **Option B (Simpler for E2E):** Call `POST /invitations/:id/accept` from the mobile web app after logging in via test bypass, skipping the website entirely.【F:backend/src/controllers/invitations.ts†L480-L626】
   - Ensure the invitation is accepted and the session becomes active (status ACTIVE, stage progress created).【F:backend/src/controllers/invitations.ts†L480-L626】

3. **Shared Session Conversation**
   - Both users open the session screen in their own contexts.
   - User A sends a few messages via `/sessions/:id/messages` and sees mocked AI responses (from `getMockResponse`).【F:backend/src/routes/messages.ts†L9-L61】【F:backend/src/services/ai-orchestrator.ts†L607-L637】
   - User B joins and sends responses; validate both see updates and can progress.

### 5) Deterministic Test Data + Cleanup
- Add a small DB helper for creating/cleaning sessions/users (CLI or Playwright hooks) to avoid data leakage between runs.
- Clean up by deleting users/sessions created during the test run (Prisma script).

## Open Decisions / Options
- **Invitation acceptance:** Using the website is closer to production but requires Clerk; bypassing it via backend + mobile web test auth may be more stable for E2E.
- **Mock LLM path:** Use deterministic stub responses for assertions (recommended), rather than relying on “missing AWS credentials” behavior.
- **Real-time updates:** Decide whether to rely on Ably in tests or to poll session state. Ably usage is implied by backend notifications in invite acceptance, so test runners may need to wait for either UI update or API polling.【F:backend/src/controllers/invitations.ts†L611-L626】

## Next Steps (Concrete)
1. Add Playwright scaffolding and a “two browser contexts” test template.
2. Implement `MOCK_LLM` env toggle in Bedrock helpers + orchestrator.
3. Implement `E2E_AUTH_BYPASS` in auth middleware with clear guard rails.
4. Add a first E2E spec that:
   - Creates session as User A → accepts as User B → verifies mock AI back-and-forth.
5. Decide whether to keep the website invite flow in the E2E suite or to rely on direct accept calls.
