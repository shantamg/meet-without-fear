# Coding Conventions

**Analysis Date:** 2026-02-14

## Naming Patterns

**Files:**
- Utilities and helpers: `camelCase.ts` - e.g., `chatUIState.ts`, `getWaitingStatus.ts`
- Services: `camelCase.ts` - e.g., `context-assembler.ts` for compound names with hyphens
- Components: `PascalCase.tsx` - e.g., `EmotionalBarometer.tsx`
- Types/interfaces: `camelCase.ts` with PascalCase type names - e.g., `AuthUser` interface in `auth.ts`
- Enums: `CONSTANT_CASE` values - e.g., `SessionStatus.CREATED`, `MessageRole.USER`
- Test files: `__tests__/[name].test.ts[x]` or `__tests__/[name].spec.ts` - located in same directory as source

**Functions:**
- camelCase for all function names: `computeChatUIState()`, `deriveIndicators()`, `formatZodError()`
- Prefix pattern for utility functions: `get*`, `compute*`, `format*`, `is*` - e.g., `getWaitingStatus()`, `isWaitingForAI()`
- Async functions: no special prefix, use same camelCase - Promise type is in signature
- Private/internal functions: no prefix convention, but typically placed before exports
- Callback handlers: prefix with `handle*` or `on*` - e.g., `handleClerkAuth()`, `onMutate()`

**Variables:**
- camelCase: `sessionId`, `invitationConfirmed`, `partnerProgress`
- Constants: `CONSTANT_CASE` for compile-time constants - e.g., `MODEL_LIMITS`, `DATABASE_URL`
- Booleans: prefix with `is*`, `has*`, `should*`, `can*` - e.g., `isLoading`, `hasInvitationMessage`, `shouldHideInput`
- Config objects: PascalCase - e.g., `WaitingStatusConfig`
- Unused parameters: prefix with `_` to signal intention - e.g., `_next: NextFunction`, `_props`

**Types/Interfaces:**
- PascalCase for all type names: `SessionStateDTO`, `ChatUIState`, `ContextBundle`
- DTO suffix for data transfer objects: `SessionSummaryDTO`, `StageProgressDTO`
- Props interface: `[ComponentName]Props` - e.g., `UseChatUIStateProps`
- State interface: `[Name]State` - e.g., `ChatUIState`, `WaitingStatusState`
- Enum values: `CONSTANT_CASE` in UPPERCASE - e.g., `SessionStatus.ACTIVE`, `Stage.WITNESS`

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

**Import pattern (no wildcard imports):**
```typescript
// GOOD - Named imports
import { Stage, MessageRole } from '@meet-without-fear/shared';
import { computeWaitingStatus } from '../utils/getWaitingStatus';

// AVOID - Wildcard imports
import * as shared from '@meet-without-fear/shared';
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

**Framework:** console.log/warn/error (no structured logging library)

**Backend Patterns:**
- Request logging in `app.ts`: `[ISO timestamp] METHOD /path (auth: boolean)`
- Response logging: `[ISO timestamp] METHOD /path -> statusCode`
- Scope-tagged logs: `[ControllerName]`, `[ServiceName]`, `[Middleware]`
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
- Nullable returns: `T | null` not `T?` (explicit null handling)
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
- One primary export per file (default or named)
- Helper exports grouped: `export { Helper1, Helper2 }`
- No star exports (`export *`) except barrel files

**Barrel Files** (index.ts):
- Used for organizing related modules
- Example: `src/theme/` contains theme files, `index.ts` exports all
- Reduces import paths: `import { colors } from '@/theme'` not `import colors from '@/theme/colors'`

**Dependency Direction:**
- Backend: Controllers → Services → Utils → Library
- Mobile: Screens → Components → Hooks → Utils → Library
- No circular imports (TypeScript will flag)
- Shared package has no internal dependencies (pure data + enums)

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

---

*Convention analysis: 2026-02-14*
