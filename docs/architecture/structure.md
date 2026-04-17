---
title: Codebase Structure
sidebar_position: 8
description: "Analysis Date: 2026-03-11"
created: 2026-03-11
updated: 2026-03-11
status: living
---
# Codebase Structure

**Analysis Date:** 2026-03-11

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
└── package.json              # Root monorepo manifest

```

## Directory Purposes

### Backend (`backend/src/`)

**`routes/`**
- Purpose: Feature-organized route modules; each mounts on main router
- Contains: `auth.ts`, `brain.ts`, `chat.ts`, `sessions.ts`, `stage0.ts`, `stage2.ts`, `stage3.ts`, `stage4.ts`, `messages.ts`, `invitations.ts`, `needs-assessment.ts`, `meditation.ts`, `gratitude.ts`, `memories.ts`, `reconciler.ts`, `people.ts`, `emotions.ts`, `inner-thoughts.ts`, `notifications.ts`, `tts.ts`, `consent.ts`, `e2e.ts`
- Key files: `index.ts` mounts all routes; routes are organized by feature (not by HTTP verb)
- Mount point: `router.use('/chat', chatRoutes)` style

**`controllers/`**
- Purpose: Route handlers that parse requests, call services, return responses
- Contains: One file per feature (e.g., `messages.ts`, `sessions.ts`, `stage2.ts`)
- Pattern: Each handler file exports functions like `createSession(req, res)`, `sendMessage(req, res)`, wrapped in `asyncHandler()` for error catching
- Key: Keep controllers thin; business logic goes in services

**`services/`**
- Purpose: Core business logic; service layer between controllers and data access
- Contains: ~48 files (42 top-level + chat-router/ subpackage with 6 files)
- Key services:
  - `ai-orchestrator.ts` - Main AI message routing logic
  - `stage-prompts.ts` - Stage-specific LLM instructions (~87KB / 1928 lines, comprehensive prompts)
  - `context-retriever.ts`, `context-assembler.ts` - LLM context building
  - `realtime.ts` - Ably event publishing (with circuit breaker integration)
  - `reconciler/` - Modular empathy gap analysis + share suggestions (split into `index.ts`, `state.ts`, `analysis.ts`, `sharing.ts`, `circuit-breaker.ts`)
  - `chat-router/` - Subpackage with intent detection, response generation, session processing
  - `crisis-detector.ts` - Pattern-based safety detection (suicide/self-harm, domestic violence, imminent danger, child abuse)
  - `empathy-state-machine.ts` - Formal EmpathyAttempt status transition validation
  - `input-sanitizer.ts` - Prompt injection defense via XML delimiters
  - `encryption-service.ts` - Higher-level helpers for Prisma field encryption
  - `data-retention.ts` - Two-phase retention policy for BrainActivity records
- AI services: `ai.ts`, `model-router.ts`, `dispatch-handler.ts`
- Memory services: `memory-service.ts`, `memory-intent.ts`, `memory-detector.ts`, `memory-validator.ts`, `memory-formatter.ts`, `global-memory.ts`
- Context services: `cross-feature-context.ts`, `context-formatters.ts`
- Conversation: `conversation-summarizer.ts`
- Other services: `surfacing-policy.ts`, `timeline-aggregator.ts`, `llm-telemetry.ts`, `empathy-status.ts`, `push.ts`, `email.ts`, `brain-service.ts`, `partner-session-classifier.ts`, `background-classifier.ts`, `needs.ts`, `needs-prompts.ts`, `shared-context.ts`, `embedding.ts`, `witnessing.ts`, `people-extractor.ts`, `attacking-language.ts`, `retrieval-planner.ts`, `stage-tools.ts`, `account-deletion.ts`, `session-deletion.ts`

**`middleware/`**
- Purpose: Express middleware for cross-cutting concerns
- Contains: `auth.ts` (Clerk JWT verification), `errors.ts` (error handler), `request-context.ts` (AsyncLocalStorage for turnId), `e2e-auth.ts` (extracted E2E test auth bypass, conditionally imported), `rate-limit.ts` (per-user/IP rate limiting with three tiers)
- Key: Error handler registered last; auth middleware protects most routes; request context captures request-scoped data; E2E auth is only loaded when NODE_ENV !== 'production'

**`lib/`**
- Purpose: Infrastructure + third-party clients
- Contains:
  - `prisma.ts` - Singleton Prisma client
  - `prisma-rls.ts` - PostgreSQL Row Level Security helper (`withUserContext()` sets `app.current_user_id` session variable)
  - `bedrock.ts` - AWS Bedrock LLM client (with circuit breaker integration)
  - `logger.ts` - Winston structured logger with JSON output in production, pretty-print in dev; auto-injects request context; Sentry transport for errors
  - Note: Backend Ably client lives in `backend/src/services/realtime.ts` (no separate backend/lib file). The *mobile* Ably client singleton is a separate file at `mobile/src/lib/ably.ts`.
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
  - `UnifiedSessionScreen.tsx` - Main chat interface (~2722 lines, reduced from 3096 via component extraction)
  - `session/` - Extracted session sub-components: `SessionAboveInputPanel.tsx`, `SessionOverlays.tsx`, `SessionDrawers.tsx`
  - `NeedMappingScreen.tsx` - Stage 3 needs
  - `StrategicRepairScreen.tsx` - Stage 4 strategies
  - `InnerWorkHubScreen.tsx`, `InnerThoughtsScreen.tsx` - Inner Work hub (v1.2: session list only; Needs Assessment, Gratitude, and Meditation pathways deferred to future milestone)
- Pattern: Each screen uses hooks to fetch data + mutations to update state; renders components

**`components/`**
- Purpose: Reusable UI components (not full screens)
- Contains: 90 component files organized by feature
- Key components:
  - `ChatInterface.tsx` - Main chat UI (29KB; messages, input, streaming)
  - `ChatBubble.tsx` - Single message bubble (20KB, handles AI streaming animation)
  - `EmotionalBarometer.tsx` - Emotion slider UI
  - Stage 2 components are integrated into UnifiedSessionScreen.tsx and its sub-components in `components/sharing/` and `components/SessionDrawer/`
  - `NeedCard.tsx`, `StrategyCard.tsx` - Stage 3-4 components
  - `WaitingRoom.tsx`, `WaitingBanner.tsx` - Waiting state UI
  - Subdirectories: `chat/`, `sharing/`, `SessionDrawer/` for organized subsets

**`hooks/`**
- Purpose: React Query + custom logic hooks; data layer
- Contains: 38 hooks organizing all server communication + state management
- Key hooks:
  - `queryKeys.ts` - Centralized query key definitions (prevents circular dependencies)
  - `useUnifiedSession.ts` - Orchestrates all session data (~711 lines, reduced from ~1218 via hook extraction); gathers state, messages, realtime events
  - `useRealtime.ts` / `useStreamingMessage.ts` - Ably subscription + SSE streaming, used by `useUnifiedSession` for event + message delivery
  - Note: there are no consolidated `useEmpathyActions`/`useNeedsActions`/`useStrategyActions` hooks yet. Stage mutations currently live as individual hooks in `useStages.ts` (e.g. `useSaveEmpathyDraft`, `useConfirmNeeds`, `useProposeStrategy`), consumed directly by `useUnifiedSession.ts`.
  - `cacheHelpers.ts` - Type-safe React Query cache mutation helpers (`typedSetQueryData`, `typedGetQueryData`)
  - `useMessages.ts` - Message querying + mutations (30KB); optimistic updates + streaming. Also hosts emotion tracking for messages (`useEmotionalHistory`, `useRecordEmotion`) alongside `useEmotions.ts`. `useInfiniteMessages` here is still the pagination source (wrapped by `useUnifiedSession`); `useTimeline.ts` is a newer companion hook that does not yet fully replace it.
  - `useSessions.ts` - Session CRUD + list (32KB). Uses the cache-first pattern: `useConfirmInvitationMessage` optimistically updates the cache in `onMutate` before the server confirms. `useArchiveSession` is deprecated in favor of `useDeleteSession`, which handles proper data cleanup.
  - `useStages.ts` - Stage mutations + gate validation (64KB)
  - `useRealtime.ts` - Ably subscription setup (32KB); session-scoped realtime events + fire-and-forget AI messages with stale-closure defense via `userIdRef`. Exports convenience hooks: `usePartnerTyping()`, `usePartnerPresence()`, `useSessionEvents()`, `useUserSessionUpdates()`. Handles app foreground/background state (re-enters/leaves presence, reconnects on resume).
  - `useStreamingMessage.ts` - SSE streaming setup + metadata handling (27KB)
  - `useChatUIState.ts` - Derives UI state from cache values (9KB wrapper around `utils/chatUIState.ts`)
  - `useAnimationQueue.ts` - Animation sequencing for chat UI
  - `useConsent.ts` - Consent state management
  - `useEmotions.ts` - Emotion data queries + mutations
  - `useInnerWorkOverview.ts` - Inner Work hub/dashboard query + mutations (aggregates all Inner Work features; separate from `useInnerThoughts.ts`)
  - `useInnerThoughts.ts` - Inner Thoughts (solo reflection) session hooks. Can link to a partner session (`linkedPartnerSessionId`) for context-aware reflection, and `useGenerateContext` can produce a distilled context summary when a partner session begins. Legacy `useInnerWorkSession*` aliases live here for backward compat.
  - `useProfile.ts` - User profile queries + mutations, plus push tokens (`useUpdatePushToken`), Ably realtime tokens (`useAblyToken`), GDPR data export, and account deletion
  - `usePerson.ts` - Person/relationship detail fetching and cross-session history for a single contact
  - `useKnowledgeBase.ts` - Knowledge base browsing: reflections by topic, person, or theme; cross-feature context
  - `useInvitation.ts` - Invitation-specific flows (partner invite code entry, confirmation)
  - `useRefinementChat.ts` - Refinement chat flow handling
  - `useRouterChat.ts` - Router-level chat orchestration against the virtual `ROUTER_SESSION_ID` ("router") session, responsible for session creation + navigation out of the inbox
  - `usePendingActions.ts` - Pending action tracking
  - `useUnreadSessionCount.ts` - Count of unread sessions. The aggregate app badge count lives in `usePendingActions.ts` as `useBadgeCount` (hits `/notifications/badge-count`).
  - `useSharingStatus.ts` - Composite hook for the Sharing Status screen: aggregates my/partner empathy attempts, reconciler analysis status, validation status, shared-context history, and share offer state.
  - `useSessionDrawer.tsx` - Provides `SessionDrawerContext` for the hamburger drawer (open/close state, selected tab between Inner Thoughts and Partner Sessions).
  - Inner Work feature hooks: `useGratitude.ts`, `useMeditation.ts`, `useNeedsAssessment.ts`. Hooks exist in-code but the matching product pathways are deferred per v1.2 scope (see note on `InnerWorkHubScreen.tsx`).
  - Auth: `useAuth.ts` (user auth + `useUpdateMood` for persisting the user's default mood intensity), `useAuthProviderClerk.ts`, `useBiometricAuth.ts`
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
- `backend/src/server.ts` - Server startup (calls `app.listen()`)

**Mobile App:**
- `mobile/app/_layout.tsx` - Root layout (Expo Router file-based routing); mounts all providers (Query, Auth, Toast)
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
- Backend: `backend/src/routes/messages.ts` (HTTP routes) → `backend/src/controllers/messages.ts` (request handler) → `backend/src/services/ai-orchestrator.ts` (AI routing) → `backend/src/services/chat-router/` (intent detection, context assembly)
- Mobile: `mobile/src/hooks/useMessages.ts` (mutations + queries) → `mobile/src/lib/api.ts` (HTTP client) → backend

**AI Processing:**
- Backend: `backend/src/services/ai-orchestrator.ts` (routes messages through AI pipeline) → `backend/src/services/chat-router/` (intent detection, context assembly) → `backend/src/lib/bedrock.ts` (LLM client) → Ably event publishing
- Mobile: `mobile/src/hooks/useStreamingMessage.ts` (listens to SSE) → `mobile/src/hooks/useRealtime.ts` (listens to Ably events) → cache updates via React Query

**Session State:**
- Backend: `backend/src/routes/sessions.ts` (HTTP routes) → `backend/src/controllers/sessions.ts` (session CRUD) → Prisma → `backend/src/services/realtime.ts` (publishes events)
- Mobile: `mobile/src/hooks/useSessions.ts` (queries/mutations) → `mobile/src/lib/ably.ts` (realtime subscription) → React Query cache

**Stage Progression:**
- Backend: `backend/src/routes/stage0.ts`, `stage2.ts`, `stage3.ts`, `stage4.ts` (HTTP routes) → `backend/src/controllers/stage0.ts`, `stage2.ts`, `stage3.ts`, `stage4.ts` (request handlers) → `backend/src/services/` (business logic) → database updates
- Mobile: `mobile/src/hooks/useStages.ts` (mutations that call backend) → `mobile/src/screens/UnifiedSessionScreen.tsx` (all stage UI in unified screen)

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
- Example: `UnifiedSessionScreen.tsx` uses `useStages()` hook to fetch empathy draft and renders stage-specific panels

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

*Structure analysis: 2026-03-11*
