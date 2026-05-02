---
title: Coding Conventions
sidebar_position: 4
description: "Analysis Date: 2026-03-11"
created: 2026-03-11
updated: 2026-03-11
status: living
---
# Coding Conventions

**Analysis Date:** 2026-03-11

## Naming Patterns

**Files:**
- Utilities and helpers: `camelCase.ts` - e.g., `chatUIState.ts`, `getWaitingStatus.ts`
- Services: `kebab-case.ts` for compound names - e.g., `context-assembler.ts`, `session-state.ts`. Single-word service files are lowercase (e.g., `auth.ts`, `empathy.ts`).
- Components: `PascalCase.tsx` - e.g., `EmotionalBarometer.tsx`
- Types/interfaces: `camelCase.ts` with PascalCase type names - e.g., `AuthUser` interface in `auth.ts`
- Enum-like types: two shapes are in use.
  - **TypeScript `enum`** for persisted / Prisma-shared types: `SessionStatus`, `Stage`, `InnerWorkStatus`, `MessageRole`, `ConnectionStatus`. Keys are `CONSTANT_CASE`; string values are usually `CONSTANT_CASE` (e.g. `SessionStatus.ACTIVE = 'ACTIVE'`) but some enums use lowercase values (e.g. `ConnectionStatus.CONNECTING = 'connecting'`).
  - **`const` object with `as const` + derived type** for wire-format discriminants and UI state tags: `ChatItemType`, `AIMessageStatus`, `IndicatorType`, `AnimationState`, `SharedContentDeliveryStatus`, `EmpathyStatus`, `ReconcilerAction`, `ShareOfferStatus`. Pattern: `export const Foo = { BAR: 'bar' } as const; export type Foo = (typeof Foo)[keyof typeof Foo];`. Keys are always `CONSTANT_CASE`. Values are either lowercase/kebab-case strings (`'ai-message'`, `'streaming'`, `'invitation-sent'`) or `CONSTANT_CASE` strings (`'HELD'`, `'PROCEED'`, `'NOT_OFFERED'`), picked to match existing peers in the same subsystem.
  - Don't change wire values (either case) without migrating every consumer, including persisted data.
- Test files: `__tests__/[name].test.ts[x]` or `__tests__/[name].spec.ts` - located in same directory as source

**Functions:**
- camelCase for all function names: `computeChatUIState()`, `deriveIndicators()`, `formatZodError()`
- Prefix pattern for utility functions: `get*`, `compute*`, `format*`, `is*` - e.g., `getWaitingStatus()`, `isWaitingForAI()`
- Async functions: no special prefix, use same camelCase - Promise type is in signature
- Private/internal functions: no prefix convention, but typically placed before exports
- Callback handlers: prefix with `handle*` or `on*` - e.g., `handleClerkAuth()`, `onMutate()`
- Type guards: prefix with `is*` and return a typed predicate - e.g., `isAIMessage()`, `isUserMessage()`, `isEmpathyStatement()`, `isSharedContext()`, `isIndicator()`

**Variables:**
- camelCase: `sessionId`, `invitationConfirmed`, `partnerProgress`
- Constants: `CONSTANT_CASE` for compile-time constants - e.g., `MODEL_LIMITS`, `DATABASE_URL`
- Booleans: both the prefix form (`is*`, `has*`, `should*`, `can*`) and state-adjective form are common in both local variables and DTO fields. Examples in DTOs: `isTyping`, `isInviter`, `hasUnread`, `hasMore`, `canAdvance`, `canConsent`, alongside `biometricEnabled`, `registered`, `success`, `readyToShare`, `alreadyConsented`, `confirmed`. Pick to match neighbors in the same file; don't rename DTO fields in passing.
- Config objects: PascalCase - e.g., `WaitingStatusConfig`
- Unused parameters: prefix with `_` to signal intention - e.g., `_next: NextFunction`, `_props`

**Types/Interfaces:**
- PascalCase for all type names: `SessionStateDTO`, `ChatUIState`, `ContextBundle`
- Suffixes signal the role of a data-transfer type. Common suffixes:
  - `DTO` — core entities (`UserDTO`, `TakeawayDTO`).
  - `Request` / `Response` — HTTP boundary (`UpdateProfileRequest`, `GetMeResponse`).
  - `Event` / `Payload` — realtime/Ably boundary (`StageProgressEvent`, `ChatItemNewPayload`).
  - `Summary` / `Detail` — list-view vs comprehensive entity view (`SessionSummaryDTO`, `PersonSummaryDTO` vs `PersonDetailDTO`, `StageProgressDetailDTO`, `InnerWorkSessionDetailDTO`).
  - `Result` — analysis/extraction outputs (`ExtractedPeopleResult`, `MemoryDetectionResult`).
  - `Params` — URL/route parameters, typically paired with Zod: `AcceptInvitationParamsInput`.
  - `Input` — Zod-inferred request/response types: `RecordBarometerRequestInput` (see Naming Patterns > Types/Interfaces for when this is dropped).
  - `EntryDTO` — individual rows inside a list-shaped DTO (`TopicSessionEntryDTO`).
  - Lightweight shapes may have no suffix when context makes the role obvious (`PresenceData`, `MemorySuggestion`).
- Props interface: `[ComponentName]Props` - e.g., `UseChatUIStateProps`
- State interface: `[Name]State` - e.g., `ChatUIState`, `WaitingStatusState`
- Enum keys: `CONSTANT_CASE` - e.g., `SessionStatus.ACTIVE`, `Stage.WITNESS`. See Naming Patterns > Enums for value conventions.
- Zod schema *constants* use a `xxxSchema` suffix with camelCase: `alignmentSchema`, `recordBarometerRequestSchema`, `runReconcilerRequestSchema`. Reusable validator fragments (e.g. `intensityRating` in `shared/src/validation/utils`) are camelCase without the `Schema` suffix because they're reused as building blocks, not full request/response schemas.
- Zod-inferred request/response types often use the `Input` suffix (e.g. `RecordBarometerRequestInput = z.infer<typeof recordBarometerRequestSchema>`), but some contracts omit it and use the bare `Request`/`Response` name (e.g. `RunReconcilerRequest`, `RunReconcilerResponse`, `ReconcilerStatusResponse`). Either is acceptable; match neighbors.
- When a backend response field represents a finalized lifecycle point, prefer a nullable timestamp alongside the value rather than overloading string presence. Example: `topicFrame` can be proposed text, while `topicFrameConfirmedAt` marks the final invite-ready state.

## Code Style

**Formatting:**
- Prettier configured with:
  - `singleQuote: true` - use single quotes for strings
  - `trailingComma: "all"` - trailing commas in multi-line structures
  - `printWidth: 120` - lines wrap at 120 characters
  - `tabWidth: 2` - use 2 spaces for indentation
  - `semi: true` - require semicolons
  - `bracketSpacing: true` - `{ foo }` not `{foo}`
  - `arrowParens: "avoid"` - omit parens in single-param arrow functions: `x => x * 2`

**Linting:**
- ESLint with TypeScript support
- Backend: `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `prettier/recommended`
- Mobile: Expo's ESLint config
- Rules:
  - `@typescript-eslint/no-unused-vars: ["error", { argsIgnorePattern: "^_" }]` - Unused params should be prefixed with `_`
  - `prettier/prettier: "error"` - Formatting violations are errors

## Import Organization

**Order:**
1. External packages (node_modules): `import express from 'express'`
2. Internal monorepo packages: `import { Stage } from '@meet-without-fear/shared'`
3. Relative imports: `import { state } from '../utils'`, `import './styles.css'`

**Path Aliases:**
Backend (`tsconfig.json` paths):
- `@shared/*` → `../shared/src/*` - Shared types and DTOs
- `@meet-without-fear/shared` → `../shared/src/index.ts` - Shared package entry

Mobile (`tsconfig.json` + `jest.config.js`):
- `@shared/*` → `../shared/src/*` - Shared types
- `@meet-without-fear/shared` → `../shared/src/index.ts` - Shared package
- `@/theme/*` → `src/theme/*` - Theming files
- `@/*` → `src/*` or `./` - Component tree

**Import pattern (no wildcard imports from internal modules):**
```typescript
// GOOD - Named imports
import { Stage, MessageRole } from '@meet-without-fear/shared';
import { computeWaitingStatus } from '../utils/getWaitingStatus';

// AVOID - Wildcard imports from internal modules
import * as shared from '@meet-without-fear/shared';

// OK - Wildcard imports from Node.js stdlib and external packages are acceptable
import * as path from 'path';
import * as dotenv from 'dotenv';
```

## Error Handling

**Backend Error Classes** (in `src/middleware/errors.ts`):
- Base: `AppError` extends Error with `code: ErrorCode`, `statusCode: number`, `details?: Record<string, unknown>`
- Specific classes: `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `ValidationError` (400), `SessionNotActiveError` (400), `GateNotSatisfiedError` (400), `InternalServerError` (500), `ConsentRequiredError` (403)

**Error handling pattern:**
```typescript
// Controller level - use asyncHandler wrapper
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Then wrap: router.get('/path', asyncHandler(async (req, res) => { ... }))

// Throw custom errors
throw new NotFoundError('Session');
throw new ValidationError('Invalid input', { field: ['error message'] });

// Zod validation errors are caught by errorHandler middleware
```

**Middleware error handler** catches:
- `AppError` instances → format as `ApiResponse` with error code and status
- `ZodError` → format validation details into `{ fieldPath: ['message', ...] }`
- Unknown errors → return 500 with sanitized message (full message in dev only)

**Mobile error handling (loose pattern):**
- No centralized error class (React Query manages async errors)
- Mutations use `onError` to handle failures
- Error state stored in query cache or local state
- Log errors to console (production logging TBD)

## Logging

**Framework:** Winston structured logger (`backend/src/lib/logger.ts`)

**Backend Patterns:**
- All logging uses `import { logger } from '../lib/logger'` — never direct `console.*()` calls
- JSON output in production, pretty-print with colors in development
- Automatic request context injection: turnId, sessionId, userId, requestId
- Sentry transport forwards error-level logs
- Log levels: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`
- Silent mode in tests: Jest config has `silent: true`, use `--verbose` flag to debug
- Debug logs use pattern matching to silence expected noise (see `backend/src/__tests__/setup.ts`)

**Mobile Patterns:**
- Minimal logging (optimized for mobile performance)
- Use `console.log` for important state transitions
- Test output silenced by default via Jest setup

## Comments

**When to Comment:**
- Complex business logic: explain "why" not "what"
- Non-obvious design decisions: architecture rationale, state patterns
- JSDoc for public functions with parameters
- Algorithm explanation: state derivation functions
- Avoid comments for readable code - refactor instead

**JSDoc/TSDoc Pattern** (Backend):
```typescript
/**
 * Brief description (single line)
 *
 * Longer explanation if needed (optional).
 * Can span multiple paragraphs.
 *
 * @param paramName - Description including type context
 * @returns Description of return value or void
 */
export function myFunction(paramName: string): void {
  // Implementation
}
```

Examples in codebase:
- `backend/src/utils/json-extractor.ts` - Extraction function with param/return docs
- `backend/src/utils/time-language.ts` - Session context functions with full JSDoc
- `backend/src/middleware/auth.ts` - Section markers and function documentation

**Comments for sections** (backend):
```typescript
// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Middleware Exports
// ============================================================================
```

## Function Design

**Size:** Prefer small, single-responsibility functions (< 50 lines)

**Parameters:**
- Use named parameters for >3 args: `function config({ sessionId, userId, options })`
- Type all parameters explicitly
- Use destructuring for object params to make dependencies clear
- Wrap in helper factory if too many params: `new SessionBuilder().userA(...).userB(...).setup()`

**Return Values:**
- Explicit return type declarations required
- `void` for functions with side effects only
- Promise types: `Promise<T>` or `Promise<void>` for async
- Nullable returns: function signatures prefer `T | null` for "known absent" cases. DTOs mix `T | null` and optional properties; see Additional Patterns > Nullable Values.
- Union types for computation: `'option-a' | 'option-b' | null`

**Pure Functions** (preferred pattern):
```typescript
// Computation functions return new data, don't mutate inputs
export function computeChatUIState(inputs: ChatUIStateInputs): ChatUIState {
  // No side effects
  return { ...derived properties };
}

// Testable in isolation
// Used in hooks: useMemo(computeChatUIState(inputs), [inputs])
```

## Module Design

**Exports:**
- Feature/service modules prefer one primary export per file (default or named), with helpers grouped: `export { Helper1, Helper2 }`
- Shared DTO files intentionally group many related exports (interfaces, discriminant consts, type guards) in a single file — e.g. `shared/src/dto/auth.ts` exports all auth DTOs together, `shared/src/dto/chat-item.ts` exports `ChatItemType` plus every item interface and matching `isAIMessage`/`isUserMessage` type guards.
- No star exports (`export *`) except in barrel files (`index.ts`), main package entry points (`shared/src/index.ts`), and validation modules that re-export the matching contract types (e.g. `shared/src/validation/invitations.ts` re-exporting from `../contracts/sessions`)

**Barrel Files** (index.ts):
- Used for organizing related modules
- Example: `src/theme/` contains theme files, `index.ts` exports all
- Reduces import paths: `import { colors } from '@/theme'` not `import colors from '@/theme/colors'`

**Dependency Direction:**
- Backend: Controllers → Services → Utils → Library
- Mobile: Screens → Components → Hooks → Utils → Library
- No circular imports (TypeScript will flag)
- Shared package has no dependencies on backend or mobile code. Internal cross-file imports between shared DTOs (e.g. `dto/chat-item.ts` → `./empathy`, `dto/chat-router.ts` → `./session`, `./message`, `./memory`) are expected.

## Type Safety

**TypeScript Configuration:**
- `strict: true` - Enable all strict checks
- `noImplicitAny: true` - Disallow implicit any
- `noImplicitReturns: true` - All code paths must return value
- `noFallthroughCasesInSwitch: true` - Catch missing case statements
- Module: `commonjs` (backend), `ESNext` (mobile via Expo)
- Target: `ES2020`

**Enum Pattern:**
```typescript
// In shared/src/enums.ts - single source of truth
export enum SessionStatus {
  CREATED = 'CREATED',
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  // ...
}

// Used in both Prisma schema and shared package
// Tests verify they match in `__tests__/prisma-schema.test.ts`
```

**Validation Pattern** (using Zod):
```typescript
// In shared/src/dto/*.ts
export const alignmentSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
});
export type Alignment = z.infer<typeof alignmentSchema>;

// Used in backend routes
const parsed = alignmentSchema.parse(req.body);
// ZodError caught by middleware, formatted as { fieldPath: ['message'] }
```

## Additional Patterns

**`compute*` Prefix Pattern:**
Pure derivation functions that compute state from inputs use the `compute*` prefix:
- `computeChatUIState()` — derives complete UI state from cache values
- `computeWaitingStatus()` — derives waiting status from session data

**Query Key Organization:**
Query keys use factory functions with nested spreads for hierarchical organization:
```typescript
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  detail: (id: string) => [...sessionKeys.all, id] as const,
  state: (id: string) => [...sessionKeys.all, id, 'state'] as const,
};
```

**Barrel File Re-export Pattern:**
Feature directories use `index.ts` barrel files to provide clean import paths. Not all directories follow this consistently.

**Mobile Hook vs. Backend Controller Pattern:**
- Mobile: Logic lives in hooks (`use*.ts`) that combine React Query with business logic
- Backend: Logic lives in controllers (thin request handlers) + services (business logic)
- Pattern boundary: Controllers never call other controllers; hooks may compose other hooks

**Nullable Values:**
Function return types prefer explicit `T | null`. DTOs use both forms, with a rough split by role:
- Response / entity DTOs use explicit `T | null` for fields that are always present but may be empty: `UserDTO.name: string | null`, `UserDTO.lastMoodIntensity: number | null`, `TakeawayDTO.theme: string | null`, `EmpathyExchangeStatusResponse.myAttempt: EmpathyAttemptDTO | null`.
- Request DTOs lean on optional properties (`field?: T`) when the field may be absent entirely (partial update payloads, URL query params).
Either is acceptable; pick to match neighbors.

---

*Convention analysis: 2026-03-11*
