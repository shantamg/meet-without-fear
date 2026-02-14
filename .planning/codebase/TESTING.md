# Testing Patterns

**Analysis Date:** 2026-02-14

## Test Framework

**Backend:**
- Runner: Jest 29.7.0
- Preset: `ts-jest` with ESM support
- Config: `backend/jest.config.js`
- Assertion: Jest built-in matchers

**Mobile:**
- Runner: Jest 29.7.0
- Preset: `jest-expo` 54.0.16
- Config: `mobile/jest.config.js` with module name mapping
- Assertion: Jest + `@testing-library/react-native` 13.3.3

**E2E:**
- Runner: Playwright 1.50.0
- Config: `e2e/playwright.config.ts` (standard) and `e2e/playwright.live-ai.config.ts` (AI tests)
- Assertion: Playwright built-in matchers

**Run Commands:**
```bash
# Backend
npm run test --workspace=backend              # Run all tests
npm run test:watch --workspace=backend        # Watch mode
npm run test -- --verbose --workspace=backend # With console output

# Mobile
npm run test --workspace=mobile               # Run all tests
npm run test:watch --workspace=mobile         # Watch mode

# All workspaces
npm run test                                  # All tests (parallel where safe)

# E2E
cd e2e && npx playwright test                 # Standard fixtures (mocked AI)
cd e2e && npx playwright test --headed        # With browser visible
cd e2e && npx playwright test --ui            # Playwright UI mode
cd e2e && npx playwright test --config=playwright.live-ai.config.ts # Real AI

# Coverage (not enforced)
npm run test -- --coverage --workspace=backend
```

## Test File Organization

**Location:**
- Backend: `src/__tests__/` directory alongside source code
  - `src/__tests__/prisma-schema.test.ts` - Schema validation
  - `src/routes/__tests__/reconciler.test.ts` - Route-specific tests
- Mobile: `src/**/__tests__/` co-located with source
  - `src/utils/__tests__/chatUIState.test.ts` - Utility function tests
  - `src/components/__tests__/EmotionalBarometer.test.tsx` - Component tests
  - `src/screens/__tests__/PersonDetailScreen.test.tsx` - Screen tests
- E2E: `e2e/tests/` flat with organized subdirectories
  - `e2e/tests/stage-2-empathy/reconciler/*.spec.ts` - Feature paths
  - `e2e/tests/homepage.spec.ts`, `single-user-journey.spec.ts` - Top-level flows

**Naming:**
- Backend: `*.test.ts` (single-test-per-file preferred)
- Mobile: `*.test.tsx` (components) or `*.test.ts` (utilities)
- E2E: `*.spec.ts` (test.describe pattern)

**Test Match Pattern:**
```javascript
// Backend: jest.config.js
testMatch: ['**/__tests__/**/*.test.ts']

// Mobile: jest.config.js
// Implicitly matches *.test.tsx and *.test.ts files found by Jest

// E2E: playwright.config.ts
testDir: './tests'
testIgnore: /live-ai-.*\.spec\.ts/  // Exclude AI tests by default
```

## Test Structure

**Backend Unit Test Pattern:**
```typescript
describe('Prisma Schema', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Schema Type Validation', () => {
    it('exports all expected models', () => {
      expect(prisma.user).toBeDefined();
      expect(prisma.relationship).toBeDefined();
    });

    it('exports SessionStatus enum with correct values', () => {
      expect(SessionStatus.CREATED).toBe('CREATED');
    });
  });

  describe('Enum Alignment with Shared Package', () => {
    it('SessionStatus enum values match shared package', () => {
      expect(SessionStatus.CREATED).toBe(SharedSessionStatus.CREATED);
    });
  });
});
```

**Mobile Component Test Pattern** (`EmotionalBarometer.test.tsx`):
```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { EmotionalBarometer } from '../EmotionalBarometer';

// Mock external dependencies
jest.mock('@react-native-community/slider', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ testID, value, onValueChange }) => (
      <View testID={testID}>
        <Text>{value}</Text>
      </View>
    ),
  };
});

describe('EmotionalBarometer', () => {
  const defaultProps = {
    value: 5,
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows slider with current value', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('displays the correct intensity label for low values', () => {
    render(<EmotionalBarometer value={2} onChange={jest.fn()} />);
    const calmElements = screen.getAllByText(/Calm/);
    expect(calmElements.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Mobile Screen Test Pattern** (`PersonDetailScreen.test.tsx`):
```typescript
// Create test helpers for data
function createMockPerson(overrides: Partial<PersonData> = {}): PersonData {
  return {
    id: 'person-123',
    name: 'Alex',
    connectedSince: 'Oct 2024',
    ...overrides,
  };
}

// Wrapper for providers
function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('PersonDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders person details with active session', () => {
    renderWithProviders(<PersonDetailScreen personId="person-123" />);
    expect(screen.getByText('Alex')).toBeTruthy();
  });
});
```

**E2E Test Pattern** (`no-gaps-proceed-directly.spec.ts`):
```typescript
import { test, expect, devices, BrowserContext, Page } from '@playwright/test';
import {
  cleanupE2EData,
  getE2EHeaders,
  SessionBuilder,
  navigateToShareFromSession,
} from '../../../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

test.use(devices['iPhone 12']);

const FIXTURE_ID = 'reconciler-no-gaps';

// Helper to wait for AI response
async function waitForAIResponse(page: Page, textPattern: RegExp, timeout = 15000) {
  await expect(page.getByText(textPattern)).toBeVisible({ timeout });
  const typingIndicator = page.getByTestId('typing-indicator');
  await expect(typingIndicator).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(100);
}

// Helper to create user context
async function createUserContext(
  browser: import('@playwright/test').Browser,
  userEmail: string,
  userId: string,
  fixtureId?: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
  });
  const page = await context.newPage();
  return { context, page };
}

test.describe('Reconciler: No Gaps Detected → Proceed Directly', () => {
  const userA = { email: 'shantam@e2e.test', name: 'Shantam' };
  const userB = { email: 'darryl@e2e.test', name: 'Darryl' };

  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let userAPage: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    const setup = await new SessionBuilder()
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_SHARED_A')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID);
    userAContext = userASetup.context;
    userAPage = userASetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
  });

  test('shows no share suggestion when reconciler finds no gaps', async () => {
    await userAPage.goto(`${APP_BASE_URL}`);
    await expect(userAPage.getByText('No gaps')).toBeVisible();
  });
});
```

## Mocking

**Framework:**
- Jest: `jest.mock()` and `jest.fn()`
- React Query: `QueryClient` with `defaultOptions: { queries: { retry: false } }`
- Playwright: No mocks - browser automation, uses fixtures instead

**Patterns:**

Backend (minimal mocking - prefer integration):
```typescript
// Mock Prisma only when testing error paths
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
    },
  },
}));
```

Mobile (more extensive - React Native compatibility):
```typescript
// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  Stack: { Screen: () => null },
}));

// Mock external libraries
jest.mock('lucide-react-native', () => ({
  MoreVertical: () => 'MoreVerticalIcon',
  Plus: () => 'PlusIcon',
}));

// Mock custom hooks
const mockUsePerson = jest.fn();
jest.mock('../../hooks/usePerson', () => ({
  usePerson: (personId: string) => mockUsePerson(personId),
}));
```

E2E (no mocks - real browser automation):
```typescript
// Use test fixtures via X-E2E-Fixture-ID header or env var
const context = await browser.newContext({
  extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
});

// Fixtures control API response behavior (e.g., 'reconciler-no-gaps' returns PROCEED)
```

**What to Mock:**
- External native modules (React Native specific)
- Navigation and routing (expo-router)
- Third-party UI libraries
- Custom hooks (when testing dependent components in isolation)

**What NOT to Mock:**
- Backend database layer (use real Prisma or test DB)
- React Query itself (test with real QueryClient)
- Business logic utils (test pure functions directly)
- Enums and types

## Fixtures and Factories

**Test Data Builders:**
```typescript
// Backend example from e2e
class SessionBuilder {
  userA(email: string, name: string): this { ... }
  userB(email: string, name: string): this { ... }
  startingAt(stageKey: string): this { ... }
  async setup(request: APIRequestContext): Promise<SetupResult> { ... }
}

// Usage
const setup = await new SessionBuilder()
  .userA('alice@example.com', 'Alice')
  .userB('bob@example.com', 'Bob')
  .startingAt('EMPATHY_SHARED_A')
  .setup(request);
```

**Mobile Inline Factories:**
```typescript
// Helper function to create mock data with defaults
function createMockPerson(overrides: Partial<PersonData> = {}): PersonData {
  return {
    id: 'person-123',
    name: 'Alex',
    initials: 'AL',
    connectedSince: 'Oct 2024',
    activeSession: null,
    ...overrides,
  };
}

// Usage in test
it('shows active session indicator', () => {
  const person = createMockPerson({
    activeSession: { id: 'session-1', stage: Stage.WITNESS },
  });
  render(<PersonCard person={person} />);
  expect(screen.getByText('Active')).toBeTruthy();
});
```

**E2E Fixtures:**
Located in `e2e/helpers.ts`:
- `getE2EHeaders()` - Returns X-E2E-User-ID/Email headers for auth bypass
- `SessionBuilder` - Orchestrates setup via REST API
- `cleanupE2EData()` - Clears DB between tests
- `navigateToShareFromSession()` - Navigates to Share tab

Fixtures configured in `playwright.config.ts`:
```typescript
// Custom fixtures passed to test via REQUEST environment
webServer: webServers(process.env.E2E_FIXTURE_ID || 'default-fixture');

// Each test specifies: FIXTURE_ID = 'reconciler-no-gaps'
// API reads from header: X-E2E-Fixture-ID (controls mocked LLM responses)
```

## Coverage

**Requirements:** Not enforced (no CI gate)

**View Coverage:**
```bash
npm run test -- --coverage --workspace=backend
npm run test -- --coverage --workspace=mobile
```

**Strategy:**
- Critical paths well-tested (schemas, enums, pure functions)
- E2E tests provide end-to-end coverage (real flow validation)
- Unit tests for error handling and edge cases
- Mobile component tests verify UI rendering (functional not pixel-perfect)

## Test Types

**Unit Tests:**
- Scope: Single function or component in isolation
- Approach: Mock dependencies, test pure logic
- Examples:
  - `backend/src/__tests__/prisma-schema.test.ts` - Enum validation
  - `mobile/src/utils/__tests__/chatUIState.test.ts` - State derivation
  - `mobile/src/components/__tests__/EmotionalBarometer.test.tsx` - Component rendering
- Run: `npm run test`

**Integration Tests:**
- Scope: Multiple components/services working together
- Approach: Real databases (test DB), real API calls (backend tests)
- Examples:
  - Backend route tests hitting real Prisma
  - Mobile screens with QueryClientProvider and real hooks
- Run: `npm run test` (same as unit)

**E2E Tests:**
- Scope: Complete user journey through app
- Approach: Real browser automation (Playwright), mocked backend
- Examples:
  - `e2e/tests/single-user-journey.spec.ts` - Full session flow
  - `e2e/tests/stage-2-empathy/reconciler/*.spec.ts` - Feature-specific flows
  - `e2e/tests/live-ai-full-flow.spec.ts` - Real AI (slow, optional)
- Run: `npm run e2e` (headless) or `npm run e2e:headed`

## Common Patterns

**Async Testing (Backend):**
```typescript
// Jest async/await pattern
describe('Database Operations', () => {
  it('creates user with email', async () => {
    const user = await prisma.user.create({
      data: { email: 'test@example.com' },
    });
    expect(user.id).toBeDefined();
  });

  // Cleanup
  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });
});
```

**Async Testing (Mobile):**
```typescript
// React Query with async operations
it('loads person data on mount', async () => {
  mockUsePerson.mockReturnValue({
    data: createMockPerson(),
    isLoading: false,
  });

  renderWithProviders(<PersonDetailScreen personId="person-123" />);

  // Wait for async query
  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeTruthy();
  });
});
```

**Async Testing (E2E):**
```typescript
// Playwright wait patterns
test('shows AI response after user sends message', async ({ page }) => {
  await page.getByTestId('message-input').fill('Hello');
  await page.getByTestId('send-button').click();

  // Wait for typing indicator to appear then disappear
  const typingIndicator = page.getByTestId('typing-indicator');
  await expect(typingIndicator).toBeVisible();
  await expect(typingIndicator).not.toBeVisible({ timeout: 15000 });

  // Verify response text appears
  await expect(page.getByText(/I understand/)).toBeVisible();
});
```

**Error Testing (Backend):**
```typescript
// Testing error paths
it('throws NotFoundError when session not found', async () => {
  expect(async () => {
    await getSession('nonexistent-id');
  }).rejects.toThrow(NotFoundError);
});

// Testing validation errors
it('throws ValidationError for invalid input', () => {
  expect(() => {
    alignmentSchema.parse({ score: 150 }); // > max of 100
  }).toThrow(ZodError);
});
```

**Error Testing (Mobile):**
```typescript
// Testing error states in components
it('shows error message on mutation failure', async () => {
  const mockError = new Error('Network failed');
  mockMutation.mockRejectedValueOnce(mockError);

  renderWithProviders(<Component />);
  fireEvent.press(screen.getByText('Submit'));

  await waitFor(() => {
    expect(screen.getByText(/Network failed/)).toBeTruthy();
  });
});
```

**Console Output Control (Backend):**
```javascript
// jest.config.js - Silent by default
{
  silent: true,
  // Use --verbose flag to see console output:
  // npm run test -- --verbose --workspace=backend
}

// Setup file patterns in backend/src/__tests__/setup.ts
// Silences expected noise from services:
const silencedLogPatterns = [
  /^\[Realtime\]/,
  /^\[Push\]/,
  /^\[sendMessage[:\]]/,
  /^prisma:/,
];

// Override console methods to filter patterns
console.log = (...args) => {
  const message = args[0]?.toString() || '';
  const shouldSilence = silencedLogPatterns.some(pattern => pattern.test(message));
  if (!shouldSilence) {
    originalConsoleLog.apply(console, args);
  }
};
```

## Test Execution & CI

**Local Development:**
```bash
# Run tests in watch mode while developing
npm run test:watch --workspace=mobile

# Run with output when debugging
npm run test -- --verbose --workspace=backend

# Run single test file
npm run test -- src/__tests__/prisma-schema.test.ts --workspace=backend

# Run tests matching pattern
npm run test -- -t "SessionStatus" --workspace=backend
```

**Verification Before Commit:**
```bash
# Type check all workspaces
npm run check

# Run all tests across workspaces
npm run test

# Run E2E tests (optional, slow)
npm run e2e
```

**CI Pipeline:**
- GitHub Actions runs `npm run check` and `npm run test` on each PR
- E2E tests run on merge to main (slower, separate job)
- Live AI tests optional (manual trigger)

---

*Testing analysis: 2026-02-14*
