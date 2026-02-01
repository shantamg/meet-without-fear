# E2E Testing Architecture

This document describes the end-to-end testing approach used in Meet Without Fear.

## Overview

The E2E tests run against a **real backend** with a **real database**, mocking only the LLM (AI responses) and authentication (Clerk). This provides high confidence that the full stack works correctly while maintaining deterministic, reproducible tests.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Playwright Test                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  E2E Headers: x-e2e-user-id, x-e2e-fixture-id, etc.      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Mobile App (Expo Web)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  E2EAuthProvider: Bypasses Clerk, injects E2E headers    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Express)                           │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Auth Bypass    │  │ Real Routes    │  │ Real Database    │  │
│  │ (E2E headers)  │  │ & Business     │  │ (test DB)        │  │
│  └────────────────┘  │ Logic          │  └──────────────────┘  │
│                      └────────────────┘                         │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ LLM Mock: Returns fixture responses instead of Bedrock    ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Real Ably (if configured)                  │
│  Real-time messaging works when ABLY_API_KEY is set             │
│  Falls back to mock tokens if not configured                    │
└─────────────────────────────────────────────────────────────────┘
```

## What's Real vs. Mocked

| Component | Real/Mocked | Notes |
|-----------|-------------|-------|
| Backend Routes | Real | Full Express server runs |
| Database | Real | PostgreSQL test database |
| Business Logic | Real | All services execute |
| Prisma/ORM | Real | Real queries, real transactions |
| Authentication | Mocked | Header bypass replaces Clerk JWT |
| LLM (Bedrock) | Mocked | Fixture responses returned |
| Ably | Real (optional) | Uses mock tokens if no API key |

## LLM Mocking

### Toggle Mechanism

The `MOCK_LLM=true` environment variable controls LLM behavior:

```typescript
// backend/src/lib/bedrock.ts
export async function getModelCompletion(messages, options) {
  if (process.env.MOCK_LLM === 'true') {
    return null; // Triggers fixture fallback in AI Orchestrator
  }
  // ... real Bedrock call
}
```

### Fixture-Based Responses

When `MOCK_LLM=true`, the AI Orchestrator loads responses from TypeScript fixture files:

```typescript
// backend/src/fixtures/user-a-full-journey.ts
import { E2EFixture } from './types';

export const userAFullJourney: E2EFixture = {
  name: 'User A Full Journey',
  description: 'Complete single user journey...',

  seed: {
    users: [
      {
        id: 'user-a',
        email: 'user-a@e2e.test',
        clerkId: 'e2e_clerk_user_a',
        name: 'Alice Test',
      },
    ],
  },

  responses: [
    {
      user: "Hi, I'm having a conflict with my partner",
      ai: `<thinking>
Mode: ONBOARDING
Intensity: 3
FeelHeardCheck: N
</thinking>

Hi there. I'm glad you reached out...`,
    },
    {
      user: "They never listen to me",
      ai: `<thinking>
Mode: EMPATHY
Intensity: 5
FeelHeardCheck: N
</thinking>

That sounds really frustrating...`,
    },
  ],

  operations: {
    'reconciler-analysis': {
      response: { /* reconciler result */ },
    },
    'reconciler-share-suggestion': {
      response: { suggestedContent: '...', reason: '...' },
    },
  },
};
```

### Response Selection

Responses are selected by **turn index**:
- Turn 1 → `responses[0]`
- Turn 2 → `responses[1]`
- etc.

This ensures deterministic, reproducible tests.

### Per-Request Fixture Selection

The fixture ID flows through request context:

1. Test sets `x-e2e-fixture-id` header
2. Backend middleware captures it into AsyncLocalStorage
3. AI Orchestrator calls `getE2EFixtureId()` to retrieve it
4. Fixture loaded and response selected by turn index

This allows different tests to use different fixtures without restarting the server.

## Authentication Bypass

### How It Works

When `E2E_AUTH_BYPASS=true`:

1. **Test creates headers:**
   ```typescript
   const headers = getE2EHeaders('alice@e2e.test', 'user-a', 'user-a-journey');
   // Returns: { 'x-e2e-user-id': 'user-a', 'x-e2e-user-email': 'alice@e2e.test', ... }
   ```

2. **Mobile app injects headers:**
   `E2EAuthProvider` replaces Clerk and configures axios to add E2E headers to all requests

3. **Backend middleware handles bypass:**
   ```typescript
   // If E2E headers present, upsert user and skip Clerk JWT verification
   const user = await handleE2EAuthBypass(req);
   ```

### Mobile E2E Auth Provider

```typescript
// mobile/src/providers/E2EAuthProvider.tsx
export function E2EAuthProvider({ children }) {
  // Reads e2e-user-id, e2e-user-email from URL params
  // Configures API client to inject these as headers
  // Provides mock auth context to the app
}
```

## Test Fixtures

### Structure

Fixtures are TypeScript files in `backend/src/fixtures/` that define:

- **seed**: Users and initial data to create
- **responses**: Array of user/AI exchange pairs (indexed by turn)
- **operations**: Non-streaming AI responses (reconciler, share suggestions)

All fixtures are registered in `backend/src/fixtures/index.ts`:

```typescript
export const fixtureRegistry: Record<string, E2EFixture> = {
  'user-a-full-journey': userAFullJourney,
  'user-b-partner-journey': userBPartnerJourney,
  'reconciler-no-gaps': reconcilerNoGaps,
  homepage,
};
```

### Fixture Loading

```typescript
// backend/src/lib/e2e-fixtures.ts
export function getFixtureResponseByIndex(fixtureId: string, index: number): string
export function getFixtureOperationResponse(fixtureId: string, operation: string): string
```

Fixtures are compiled TypeScript modules, providing type safety and IDE support.

## State Factory

To avoid navigating through the entire UI flow, tests can create sessions at specific stages:

```typescript
// In test
await new SessionBuilder(request)
  .withUserA('alice@e2e.test', 'Alice')
  .withUserB('bob@e2e.test', 'Bob')
  .atStage('FEEL_HEARD_B')
  .build();
```

### Available Stages

| Stage | Description |
|-------|-------------|
| `CREATED` | Session created, compact not signed |
| `EMPATHY_SHARED_A` | User A completed Stage 1 |
| `FEEL_HEARD_B` | User B felt heard, reconciler ready |
| `CONTEXT_SHARED_B` | Both users active, context shared |

### Implementation

The State Factory (`backend/src/testing/state-factory.ts`) uses Prisma transactions to atomically create all required data for a given stage.

## Ably (Real-Time Messaging)

### When Configured

If `ABLY_API_KEY` is set, tests use **real Ably**:
- Real-time events are published and received
- Tests can verify actual real-time behavior

### When Not Configured

The backend returns mock tokens that allow the client to initialize:

```typescript
// Returns mock token with full capability
{
  keyName: 'mock-key-name',
  capability: JSON.stringify({ '*': ['subscribe', 'publish'] }),
  clientId: user.id,
  // ...
}
```

### Backend Mocking (Unit Tests)

For unit tests (not E2E), there's a Jest mock:

```typescript
// backend/src/services/__mocks__/realtime.ts
export const publishSessionEvent = jest.fn().mockResolvedValue(undefined);
```

## Test Infrastructure

### Playwright Configuration

```typescript
// e2e/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  workers: 1,  // Sequential to avoid DB conflicts
  use: {
    viewport: { width: 375, height: 667 }, // iPhone 12
  },
  webServer: [
    {
      command: 'npm run dev:api',
      port: 3002,
      env: {
        E2E_AUTH_BYPASS: 'true',
        MOCK_LLM: 'true',
      },
    },
    {
      command: 'npm run start:e2e',
      port: 8082,
      env: {
        EXPO_PUBLIC_E2E_MODE: 'true',
      },
    },
  ],
});
```

### Global Setup

Before tests run, `global-setup.ts`:
1. Truncates all test tables (with CASCADE)
2. Runs pending migrations

### Test Structure

```typescript
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../helpers';

test.beforeEach(async ({ request }) => {
  await cleanupE2EData(request);
});

test('user journey', async ({ page, request }) => {
  // Set fixture for this test
  await page.setExtraHTTPHeaders(getE2EHeaders(email, userId, 'user-a-journey'));

  // Create session at specific stage
  const session = await new SessionBuilder(request)
    .withUserA(email, 'Alice')
    .atStage('CREATED')
    .build();

  // Navigate and interact
  await page.goto(`/session/${session.id}?e2e-user-id=${userId}&e2e-user-email=${email}`);

  // Assertions...
});
```

## E2E Helper Routes

Enabled only when `E2E_AUTH_BYPASS=true`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/e2e/cleanup` | Delete all `@e2e.test` users and related data |
| `POST /api/e2e/seed` | Create a test user |
| `POST /api/e2e/seed-session` | Create session at specific stage |

## Key Design Decisions

### Why Real Backend + Mocked LLM?

- **High confidence**: Tests exercise real routes, real database, real business logic
- **Deterministic**: Fixture responses ensure consistent behavior
- **Fast**: No LLM latency (responses return immediately)
- **No credentials needed**: Tests work without AWS/Bedrock access

### Why Per-Request Fixture Selection?

- Different tests can use different fixtures
- No server restart between tests
- Parallel test runs possible (with separate fixtures)

### Why State Factory?

- Avoids lengthy UI navigation to reach specific states
- Tests can focus on the behavior being tested
- Faster test execution

### Why Sequential Test Execution?

- Avoids database conflicts between tests
- Simpler cleanup/setup patterns
- More reliable than parallel with shared DB

## File Locations

| File | Purpose |
|------|---------|
| `e2e/playwright.config.ts` | Playwright configuration |
| `e2e/global-setup.ts` | Pre-test database cleanup |
| `e2e/helpers/` | Test utilities (SessionBuilder, headers) |
| `backend/src/fixtures/` | TypeScript fixture definitions |
| `backend/src/fixtures/index.ts` | Fixture registry |
| `backend/src/fixtures/types.ts` | Fixture type definitions |
| `backend/src/lib/e2e-fixtures.ts` | Fixture loading logic |
| `backend/src/lib/bedrock.ts` | LLM mock toggle |
| `backend/src/routes/e2e.ts` | E2E helper endpoints |
| `backend/src/testing/state-factory.ts` | Session stage creation |
| `mobile/src/providers/E2EAuthProvider.tsx` | Mobile auth bypass |
