# Codebase Structure

**Analysis Date:** 2026-02-14

## Directory Layout

```
project-root/
├── backend/                    # Express API server
│   ├── src/
│   │   ├── app.ts            # Express app setup + middleware
│   │   ├── routes/           # Feature route modules
│   │   ├── controllers/       # Route handlers for features
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Auth, error handling, logging
│   │   ├── lib/              # Database, Bedrock LLM, utilities
│   │   ├── fixtures/         # Test fixtures + seed data
│   │   └── __tests__/        # Test files
│   ├── prisma/               # Prisma schema + migrations
│   └── package.json
│
├── mobile/                     # React Native Expo app
│   ├── src/
│   │   ├── screens/          # Full-screen components (by stage/feature)
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # React Query hooks + custom logic
│   │   ├── services/         # Business logic (not UI-specific)
│   │   ├── lib/              # API client, Ably realtime, utilities
│   │   ├── contexts/         # React Context providers
│   │   ├── providers/        # Custom providers (Auth, Query, etc.)
│   │   ├── utils/            # Pure utilities + pure derivation functions
│   │   ├── theme/            # Design tokens, colors, fonts
│   │   ├── config/           # App configuration
│   │   ├── types/            # TypeScript types (navigation, etc.)
│   │   ├── mocks/            # Mocks for testing (Clerk, etc.)
│   │   └── __tests__/        # Test files
│   └── package.json
│
├── shared/                     # Shared types + contracts
│   ├── src/
│   │   ├── dto/              # Data Transfer Objects (all entities)
│   │   ├── contracts/        # API endpoint request/response schemas
│   │   ├── validation/       # Zod validation schemas
│   │   └── utils/            # Shared utilities (meditation helpers, etc.)
│   └── package.json
│
├── e2e/                        # End-to-end tests (Playwright)
│   ├── tests/                # Test files
│   ├── playwright.config.ts  # Main config
│   ├── playwright.live-ai.config.ts  # Live AI testing config
│   └── package.json
│
├── docs-site/                  # Documentation website (deployed)
├── website/                    # Marketing website
├── tools/status-dashboard/    # Internal status monitoring
├── docs/                       # Planning + implementation docs
├── implementation/             # Executable implementation plans
└── package.json              # Root monorepo manifest

```

## Directory Purposes

### Backend (`backend/src/`)

**`routes/`**
- Purpose: Feature-organized route modules; each mounts on main router
- Contains: `auth.ts`, `chat.ts`, `sessions.ts`, `stage0.ts`, `stage2.ts`, `stage3.ts`, `stage4.ts`, `messages.ts`, `invitations.ts`, `needs-assessment.ts`, `meditation.ts`, `gratitude.ts`, `memories.ts`, `reconciler.ts`, `people.ts`, `emotions.ts`, `inner-thoughts.ts`, `consent.ts`, `e2e.ts`
- Key files: `index.ts` mounts all routes; routes are organized by feature (not by HTTP verb)
- Mount point: `router.use('/chat', chatRoutes)` style

**`controllers/`**
- Purpose: Route handlers that parse requests, call services, return responses
- Contains: One file per feature (e.g., `messages.ts`, `sessions.ts`, `stage2.ts`)
- Pattern: Each handler file exports functions like `createSession(req, res)`, `sendMessage(req, res)`, wrapped in `asyncHandler()` for error catching
- Key: Keep controllers thin; business logic goes in services

**`services/`**
- Purpose: Core business logic; service layer between controllers and data access
- Contains: 44 files including AI orchestration, context assembly, messaging, session management, stage-specific logic
- Key services:
  - `ai-orchestrator.ts` - Main AI message routing logic
  - `messages.ts` - Message creation, retrieval, streaming
  - `sessions.ts` - Session CRUD + state management
  - `stage-prompts.ts` - Stage-specific LLM instructions (70KB file, comprehensive prompts)
  - `context-retriever.ts`, `context-assembler.ts` - LLM context building
  - `realtime.ts` - Ably event publishing
  - `stage2.ts`, `stage3.ts`, `stage4.ts` - Stage-specific business logic
  - `chat-router/` - Subpackage with intent detection, response generation, session processing
  - `reconciler.ts` - Post-stage empathy gap analysis + share suggestions

**`middleware/`**
- Purpose: Express middleware for cross-cutting concerns
- Contains: `auth.ts` (Clerk JWT verification), `errors.ts` (error handler), `request-context.ts` (AsyncLocalStorage for turnId)
- Key: Error handler registered last; auth middleware protects most routes; request context captures request-scoped data

**`lib/`**
- Purpose: Infrastructure + third-party clients
- Contains:
  - `prisma.ts` - Singleton Prisma client
  - `bedrock.ts` - AWS Bedrock LLM client
  - `ably.ts` - Ably realtime REST client (NOT the mobile Realtime client)
  - `e2e-fixtures.ts` - Testing helpers
  - `request-context.ts` - AsyncLocalStorage initialization

**`fixtures/`**
- Purpose: Test data + seed data
- Contains: Journey fixtures for User A + User B, test session generators
- Key files: `user-a-full-journey.ts`, `user-b-partner-journey.ts`

**`__tests__/`**
- Purpose: Test files (co-located with source)
- Pattern: Route tests in `routes/__tests__/`, service tests in `services/__tests__/`, etc.
- Key files: `setup.ts` (test environment), `env.ts` (test environment variables)

### Mobile (`mobile/src/`)

**`screens/`**
- Purpose: Full-screen components; one per major feature/stage
- Contains:
  - `UnifiedSessionScreen.tsx` - Main chat interface (88KB, most complex)
  - `PerspectiveStretchScreen.tsx` - Stage 2 empathy work
  - `NeedMappingScreen.tsx` - Stage 3 needs
  - `StrategicRepairScreen.tsx` - Stage 4 strategies
  - `NeedsAssessmentScreen.tsx`, `InnerWorkHubScreen.tsx`, `InnerThoughtsScreen.tsx`, `MeditationScreen.tsx`, etc.
- Pattern: Each screen uses hooks to fetch data + mutations to update state; renders components

**`components/`**
- Purpose: Reusable UI components (not full screens)
- Contains: 75+ component files organized by feature
- Key components:
  - `ChatInterface.tsx` - Main chat UI (messages, input, streaming)
  - `ChatBubble.tsx` - Single message bubble (20KB, handles AI streaming animation)
  - `EmotionalBarometer.tsx` - Emotion slider UI
  - `PartnerChatTab.tsx`, `PartnerContentCard.tsx` - Partner info display
  - `EmpathyAttemptCard.tsx`, `ShareSuggestionCard.tsx` - Stage 2 components
  - `NeedCard.tsx`, `StrategyCard.tsx` - Stage 3-4 components
  - `WaitingRoom.tsx`, `WaitingBanner.tsx` - Waiting state UI
  - Subdirectories: `chat/`, `sharing/`, `SessionDrawer/` for organized subsets

**`hooks/`**
- Purpose: React Query + custom logic hooks; data layer
- Contains: 34 hooks organizing all server communication + state management
- Key hooks:
  - `queryKeys.ts` - Centralized query key definitions (prevents circular dependencies)
  - `useUnifiedSession.ts` - Orchestrates all session data (62KB); gathers state, messages, realtime events
  - `useMessages.ts` - Message querying + mutations (30KB); optimistic updates + streaming
  - `useSessions.ts` - Session CRUD + list (34KB)
  - `useStages.ts` - Stage mutations + gate validation (62KB)
  - `useRealtime.ts` - Ably subscription setup (27KB); listens to session events
  - `useStreamingMessage.ts` - SSE streaming setup + metadata handling (27KB)
  - `useChatUIState.ts` - Derives UI state from cache values (9KB wrapper around `utils/chatUIState.ts`)
  - Stage-specific: `useInnerThoughts.ts`, `useGratitude.ts`, `useMeditation.ts`, `useNeedsAssessment.ts`, etc.
  - Auth: `useAuth.ts`, `useAuthProviderClerk.ts`, `useBiometricAuth.ts`
  - Timeline: `useTimeline.ts` (13KB)

**`services/`**
- Purpose: Non-UI business logic; pure functions + utilities
- Contains: Speech synthesis, push notifications, analytics integrations (not used yet)
- Pattern: Imported by hooks + components where needed; keep pure

**`lib/`**
- Purpose: API client + realtime setup
- Contains:
  - `api.ts` - HTTP client singleton (fetch + auth token injection) (13KB)
  - `ably.ts` - Ably Realtime client singleton (9KB); Expo-specific implementation
  - Subdirectory: `__tests__/` for API client tests

**`contexts/`**
- Purpose: React Context providers for app-level state
- Contains: `AuthContext.tsx`, `ToastContext.tsx`
- Pattern: Simple context + provider; hooks use them

**`providers/`**
- Purpose: Composed providers for app root
- Contains:
  - `QueryProvider.tsx` - React Query ClientProvider setup
  - `ClerkAuthFlow.tsx` - Clerk authentication wrapper
  - `E2EAuthProvider.tsx` - Testing-only auth provider (uses env headers instead of Clerk)

**`utils/`**
- Purpose: Pure utilities + pure derivation functions
- Contains:
  - `chatUIState.ts` - Pure function `computeChatUIState()` that derives complete UI state from cache + component state; pure, testable, no side effects
  - `chatListSelector.ts` - Derives indicators (timeline badges) from cached timestamps
  - `getWaitingStatus.ts` - Computes waiting status (WAITING_FOR_PARTNER, WAITING_FOR_AI, etc.) from cached data
  - `errorTracking.ts` - Error reporter integration (Sentry-ready)
  - `appSession.ts` - Session utilities
  - Test utilities: `test-utils.tsx`

**`config/`**
- Purpose: App configuration + constants
- Contains: `waitingStatusConfig.ts` (waiting status UI text), `index.ts` (feature flags, endpoints)

**`theme/`**
- Purpose: Design system (colors, fonts, spacing)
- Contains: Theme provider setup, token definitions

**`types/`**
- Purpose: TypeScript type definitions (navigation, etc.)
- Contains: `navigation.ts` (react-navigation types)

**`mocks/`**
- Purpose: Mocks for testing
- Contains: `clerk-expo.ts`, `clerk-expo-token-cache.ts` (Clerk mocking for tests)

### Shared (`shared/src/`)

**`dto/`**
- Purpose: Data Transfer Objects (SSOT for all entity types)
- Contains: 20 files, one per feature/entity:
  - `session.ts` - Session entity + session detail types
  - `session-state.ts` - SessionProgress, stage enums
  - `message.ts` - Message + MessageDTO
  - `chat-item.ts` - ChatItem union type (messages + notifications)
  - `empathy.ts` - Empathy statement, share offer, reconciler data
  - `needs.ts`, `stage.ts`, `strategy.ts` - Stage-specific DTOs
  - `auth.ts`, `consent.ts`, `meditation.ts`, `gratitude.ts`, `memory.ts`, `realtime.ts` - Feature DTOs
- Key: These are imported by backend services + mobile hooks; define exact shapes of API responses

**`contracts/`**
- Purpose: API endpoint request/response schemas (Zod validated)
- Contains: 3 contract files:
  - `auth.ts` - Auth endpoints (login, token refresh)
  - `sessions.ts` - Session endpoints (create, get, list, send message, etc.)
  - `stages.ts` - Stage endpoints (confirm, advance, etc.)
- Pattern: Each contract exports Zod schema for request body + response type
- Key: Used by backend route handlers to validate requests; used by mobile to type API calls

**`validation/`**
- Purpose: Reusable Zod validation schemas
- Contains: Schemas for common types (used across multiple endpoints)

**`utils/`**
- Purpose: Shared utility functions
- Contains: `meditation.ts` (meditation timing logic), `api.ts` (API response types)

## Key File Locations

### Entry Points

**Backend Server:**
- `backend/src/app.ts` - Express app initialization; mounts all middleware + routes
- `backend/src/index.ts` (or main file in package.json) - Server startup (calls `app.listen()`)

**Mobile App:**
- `mobile/src/App.tsx` - Root component; mounts all providers (Query, Auth, Toast, Toast)
- `mobile/app.json` - Expo app configuration (name, version, entry point)

**Shared Package:**
- `shared/src/contracts/index.ts` - Export all API contracts (for validation)
- `shared/src/dto/` - All DTOs imported by backend/mobile

### Configuration

**Backend:**
- `backend/prisma/schema.prisma` - Database schema (models, relationships)
- `backend/package.json` - Scripts: `dev:watch`, `test`, `check` (type check)
- `.env.local` (gitignored) - Environment variables (DB_URL, ABLY_API_KEY, BEDROCK_REGION, etc.)

**Mobile:**
- `mobile/app.json` - Expo app metadata
- `mobile/tsconfig.json` - TypeScript configuration
- `mobile/package.json` - Dependencies, scripts: `start`, `test`, `check`

**Shared:**
- `shared/tsconfig.json` - TypeScript configuration

**Root:**
- `package.json` - Monorepo workspace setup; root scripts (`dev`, `test`, `check`, `migrate`)
- `tsconfig.json` - Root TypeScript config (extended by workspaces)

### Core Logic

**Message Flow:**
- Backend: `backend/src/routes/messages.ts` (HTTP routes) → `backend/src/controllers/messages.ts` (request handler) → `backend/src/services/messages.ts` (business logic + streaming)
- Mobile: `mobile/src/hooks/useMessages.ts` (mutations + queries) → `mobile/src/lib/api.ts` (HTTP client) → backend

**AI Processing:**
- Backend: `backend/src/services/ai-orchestrator.ts` (routes messages through AI pipeline) → `backend/src/services/chat-router/` (intent detection, context assembly) → `backend/src/lib/bedrock.ts` (LLM client) → Ably event publishing
- Mobile: `mobile/src/hooks/useStreamingMessage.ts` (listens to SSE) → `mobile/src/hooks/useRealtime.ts` (listens to Ably events) → cache updates via React Query

**Session State:**
- Backend: `backend/src/services/sessions.ts` (session CRUD) → Prisma → `backend/src/services/realtime.ts` (publishes events)
- Mobile: `mobile/src/hooks/useSessions.ts` (queries/mutations) → `mobile/src/lib/ably.ts` (realtime subscription) → React Query cache

**Stage Progression:**
- Backend: `backend/src/services/stage0.ts`, `stage2.ts`, `stage3.ts`, `stage4.ts` (stage-specific business logic) → `backend/src/routes/stage{N}.ts` (HTTP handlers) → database updates
- Mobile: `mobile/src/hooks/useStages.ts` (mutations that call backend) → `mobile/src/screens/PerspectiveStretchScreen.tsx` etc. (stage-specific UI)

### Testing

**Backend Tests:**
- Location: `backend/src/__tests__/`, `backend/src/routes/__tests__/`, `backend/src/services/__tests__/`
- Pattern: Co-located with source files; Jest runner
- Command: `npm run test` in backend workspace

**Mobile Tests:**
- Location: `mobile/src/__tests__/`, `mobile/src/screens/__tests__/`, `mobile/src/hooks/__tests__/`
- Pattern: Jest + React Testing Library (or Vitest)
- Command: `npm run test` in mobile workspace

**E2E Tests:**
- Location: `e2e/tests/` (Playwright)
- Configs: `e2e/playwright.config.ts` (default, MOCK_LLM=true), `e2e/playwright.live-ai.config.ts` (real LLM)
- Command: `npm run e2e` or `npm run e2e:headed` (headed mode for debugging)

## Naming Conventions

**Files:**
- Route files: kebab-case (e.g., `needs-assessment.ts`, `stage0.ts`)
- Component files: PascalCase (e.g., `ChatInterface.tsx`, `EmotionalBarometer.tsx`)
- Hook files: camelCase starting with `use` (e.g., `useMessages.ts`, `useChatUIState.ts`)
- Service files: camelCase (e.g., `messages.ts`, `ai-orchestrator.ts`)
- Utility files: camelCase (e.g., `chatUIState.ts`, `getWaitingStatus.ts`)
- Type/DTO files: camelCase (e.g., `message.ts`, `chat-item.ts`)

**Directories:**
- Feature features: lowercase (e.g., `messages`, `stages`, `needs`)
- React feature folders: lowercase (e.g., `screens`, `components`, `hooks`, `services`)
- Test directories: `__tests__` (double underscore convention)
- Subpackages: lowercase (e.g., `chat-router`)

**Code Symbols:**
- React Components: PascalCase (e.g., `ChatInterface`, `EmotionalBarometer`)
- Hooks: camelCase with `use` prefix (e.g., `useMessages`, `useChatUIState`)
- Functions: camelCase (e.g., `sendMessage`, `computeChatUIState`)
- Constants: UPPER_SNAKE_CASE (e.g., `TYPING_TIMEOUT`, `TRANSIENT_EVENTS`)
- Types/Interfaces: PascalCase (e.g., `SessionState`, `ChatUIState`)
- Enums: PascalCase (e.g., `Stage`, `SessionStatus`)

## Where to Add New Code

### New Feature (Complete Flow)

1. **Shared Types:**
   - Add DTOs to `shared/src/dto/{feature}.ts` (entity shapes)
   - Add contracts to `shared/src/contracts/{feature}.ts` (request/response schemas)
   - Export in `shared/src/contracts/index.ts`

2. **Backend Route:**
   - Create `backend/src/routes/{feature}.ts` with Express Router
   - Create `backend/src/controllers/{feature}.ts` with request handlers
   - Create `backend/src/services/{feature}.ts` with business logic
   - Mount route in `backend/src/routes/index.ts`: `router.use('/{feature}', {feature}Routes)`

3. **Mobile Hook:**
   - Create `mobile/src/hooks/use{Feature}.ts` with React Query useQuery/useMutation
   - Add query keys to `mobile/src/hooks/queryKeys.ts` under appropriate key namespace
   - Export hook from `mobile/src/hooks/index.ts`

4. **Mobile Component:**
   - Create component in `mobile/src/components/{Feature}.tsx` that uses the hook
   - Or create screen in `mobile/src/screens/{Feature}Screen.tsx` for full-screen UI

5. **Database Schema (if needed):**
   - Update `backend/prisma/schema.prisma` with new model
   - Run: `npx prisma migrate dev --name add_{feature}`

### New Component/Module (UI-Only)

**Reusable Component:**
- Location: `mobile/src/components/{Feature}.tsx`
- Pattern: Pure presentational component; accepts data as props; calls callbacks for events
- Example: `NeedCard.tsx` takes `need` prop + `onSelect` callback

**Screen:**
- Location: `mobile/src/screens/{Feature}Screen.tsx`
- Pattern: Calls hooks to fetch data + mutations; renders components; handles navigation
- Example: `PerspectiveStretchScreen.tsx` uses `useStages()` hook to fetch empathy draft, renders `EmpathyAttemptCard` component

### Utilities/Pure Functions

**UI State Derivation:**
- Location: `mobile/src/utils/{function}.ts`
- Pattern: Pure function with no side effects; takes cache values as input; returns computed UI state
- Example: `computeChatUIState()` takes inputs like `myProgress.stage`, `invitationConfirmed`, etc., returns `{ aboveInputPanel, shouldHideInput, waitingBannerText, ... }`

**Shared Utilities:**
- Location: `shared/src/utils/{function}.ts`
- Pattern: Logic used by both backend + mobile; no framework dependencies
- Example: `meditationUtils.ts` calculates meditation session duration

**Service Logic:**
- Backend: `backend/src/services/{service}.ts` - Called by controllers; handles DB, external APIs, business rules
- Mobile: `mobile/src/services/{service}.ts` - Non-UI logic; pure functions or helpers

## Special Directories

**`backend/src/fixtures/`**
- Purpose: Test data + seed fixtures for development + testing
- Generated: By hand (can also be created dynamically in tests)
- Committed: Yes (shared test data)
- Usage: `import { userAJourney } from '../fixtures/user-a-full-journey'` in tests

**`backend/prisma/migrations/`**
- Purpose: Track all database schema changes
- Generated: By `npx prisma migrate dev --name {description}`
- Committed: Yes (required; applied in CI/CD)
- Usage: Never manually edit; always create new migration

**`mobile/src/__tests__/`**
- Purpose: Test files (co-located with source)
- Generated: By developers writing tests
- Committed: Yes
- Pattern: Mirror source structure; one test file per source file

**`.planning/codebase/`**
- Purpose: Generated architecture + structure documentation
- Generated: By `/gsd:map-codebase` agent
- Committed: Yes (guides future implementation)
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**`node_modules/` + `.next/` + `dist/` + `build/`**
- Purpose: Build artifacts + dependencies
- Generated: By build tools (npm install, npm run build, etc.)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-02-14*
