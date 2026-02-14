# Codebase Concerns

**Analysis Date:** 2026-02-14

## Tech Debt

**Large, Monolithic Components:**
- Issue: Multiple components exceed 1500+ lines of code, making them difficult to maintain and test
- Files:
  - `mobile/src/screens/UnifiedSessionScreen.tsx` (2169 lines)
  - `backend/src/controllers/stage2.ts` (2261 lines)
  - `backend/src/services/reconciler.ts` (2187 lines)
  - `mobile/src/hooks/useUnifiedSession.ts` (1303 lines)
- Impact: Increased bug risk, harder to test individual features, cognitive load for future developers
- Fix approach: Break into smaller domain-focused components/hooks. Consider extracting stage-specific logic into separate files (e.g., `useStage2Logic`, `useStage3Logic`)

**Legacy/Deprecated Code Still Active:**
- Issue: Deprecated endpoints and old patterns coexist with new ones, creating confusion and maintenance burden
- Files:
  - `backend/src/controllers/messages.ts` (105) - `sendMessage` endpoint marked DEPRECATED with fire-and-forget pattern still in use
  - `backend/src/services/stage-prompts-legacy.ts` (1899 lines) - Full legacy prompting system still exists
  - Multiple deprecated test routes in `backend/src/routes/__tests__/messages.test.ts`
- Impact: New developers may implement using deprecated patterns; code reviewers must check compatibility
- Fix approach: Schedule removal of deprecated endpoints (sendMessage) after ensuring all clients migrated to `/messages/stream`. Archive stage-prompts-legacy once stage-prompts.ts is fully validated.

**Unused/Partially Implemented Features:**
- Issue: Features stubbed out or marked for future implementation
- Files/Examples:
  - `mobile/app/(auth)/person/[id].tsx` (52) - Remove person is wired to UI but API call not implemented (just navigates back)
  - `mobile/app/(auth)/inner-thoughts/index.tsx` (225) - Linking partner sessions disabled (`isLinked = false; // TODO: item.linkedPartnerSessionId`)
  - `backend/src/controllers/stage4.ts` (862) - TODO: Call AI service to generate strategy suggestions
- Impact: Users may believe features work when they don't; incomplete business logic
- Fix approach: Either implement these features or remove UI elements that reference them. Create explicit GitHub issues for deferred work.

---

## Known Issues & Fragile Areas

**Stage Transition Cache Update Pattern (Critical):**
- Issue: Mobile app uses Cache-First architecture where mutations must manually update `sessionKeys.state` cache with new stage. Failing to do this causes stage-specific panels to not display (e.g., empathy panel won't show if `myProgress.stage` cache is stale).
- Files:
  - `mobile/src/hooks/useStages.ts` - Stage mutations
  - `mobile/src/hooks/useChatUIState.ts` - Derives panel visibility from stage cache
  - `CLAUDE.md` line 30: Already documented as fixed in `useConfirmFeelHeard`
- Symptoms: User completes action that should advance to new stage, but no UI updates appear
- Workaround: Refresh/reload to re-fetch fresh stage from server
- Risk: This pattern is not type-safe; easy to miss cache update when adding new stage mutations
- Fix approach: Consider creating a wrapper mutation hook that enforces cache update pattern, or use React Query's `onSuccess` with `invalidateQueries` to auto-refresh

**Reconciler Race Conditions:**
- Issue: Reconciler service has manual retry logic (3 attempts with 100ms delays) to handle database visibility issues after record creation
- Files: `backend/src/services/reconciler.ts` (792-813) - "handle potential race condition where the record might not be immediately visible after creation"
- Symptoms: Reconciliation may fail silently if database replication/indexing is slow
- Impact: Empathy gap analysis might not run when it should
- Fix approach: Use database-level guarantees (read-after-write consistency, explicit transaction isolation) instead of polling. Consider using Prisma transactions to ensure atomicity.

**Reconciliation State Machine Complexity:**
- Issue: Reconciler manages complex state transitions (HELD → AWAITING_SHARING → REFINING → REVEALED) with multiple database tables (ReconcilerResult, ReconcilerShareOffer, EmpathyStatus)
- Files: `backend/src/services/reconciler.ts` (entire file), `backend/src/controllers/stage2.ts`
- Impact: Logic to prevent looping (e.g., `hasContextAlreadyBeenShared`) added as workarounds, suggests underlying state machine is fragile
- Risk: Adding new reconciliation features requires careful consideration of state transitions
- Fix approach: Create formal state diagram and consider using explicit state machine library (e.g., XState) to enforce valid transitions

**Circuit Breaker Timing (Performance):**
- Issue: Haiku circuit breaker timeout increased to 20 seconds (HAIKU_TIMEOUT_MS = 20000) from previous 1.5s/3s attempts, indicating service is slow but needed room for cold starts
- Files: `backend/src/utils/circuit-breaker.ts` (38)
- Impact: E2E test runs can take 8-12 minutes when hitting Haiku timeouts (documented in MEMORY.md)
- Risk: E2E tests may fail intermittently based on LLM service health
- Mitigation: Circuit breaker has fallback values; tests gracefully degrade
- Recommendation: Monitor Haiku latency; consider caching responses or pre-warming service

---

## Performance Bottlenecks

**Large AI Service Calls Block User Response:**
- Issue: Some services use `withTimeout` with circuit breakers but still perform expensive operations in user request path
- Files:
  - `backend/src/services/memory-detector.ts` (203) - Slow Haiku calls wrapped but still in response path
  - `backend/src/services/partner-session-classifier.ts` (519) - Circuit breaker prevents blocking but still called per request
  - `backend/src/services/background-classifier.ts` (254) - Non-blocking pattern used
- Recommendations: Continue using fire-and-forget pattern for optional enrichment; ensure all blocking calls have reasonable timeouts (<5s)

**N+1 Query Risk in Reconciler:**
- Issue: Reconciler builds context by fetching user messages, themes, empathy statements separately. If session has many messages, could cause multiple database round-trips
- Files: `backend/src/services/reconciler.ts` - buildReconcilerPrompt, buildShareOfferPrompt
- Risk: Higher latency with larger sessions
- Mitigation: Prisma relations are properly defined; queries use includes/selects when needed
- Recommendation: Monitor slow query logs; consider pagination if sessions grow beyond 1000 messages

---

## Test Coverage Gaps

**Critical Services Lack Unit Tests:**
- Issue: Major backend services have no dedicated test files
- Untested files (high-impact):
  - `backend/src/services/ai-orchestrator.ts` (26.6KB) - Routes AI requests to appropriate models; core system
  - `backend/src/services/ai.ts` (6.6KB) - LLM interaction wrapper
  - `backend/src/services/context-assembler.ts` (18.3KB) - Builds prompt context; high complexity
  - `backend/src/services/context-retriever.ts` (28KB) - Fetches session context; core data service
  - `backend/src/services/reconciler.ts` (2187 lines) - Reconciliation logic; some integration tests but no unit tests
  - `backend/src/services/embedding.ts` (16.4KB) - Vector embedding service
  - `backend/src/services/conversation-summarizer.ts` (22.5KB) - Session summarization
  - `backend/src/services/needs.ts`, `backend/src/services/memory-*.ts` (multiple 10-14KB files)
- Total untested services: 40+ files
- Impact: Bugs in these services may go undetected; regressions from refactoring not caught
- Risk: High priority changes to reconciliation, context assembly, or AI orchestration have no automated safety net
- Fix approach: Create integration test suite for critical paths (e.g., "Stage 1 → Stage 2 → reconciler runs → gaps detected" flow). Prioritize tests for ai-orchestrator, context-assembler, reconciler.

**Mobile E2E Test Brittleness:**
- Issue: Live AI E2E test (`e2e/tests/live-ai-full-flow.spec.ts`) depends on external service health (partner-session-classifier circuit breaker adds 20s timeout per response per MEMORY.md)
- Files: `e2e/tests/live-ai-full-flow.spec.ts`
- Impact: Test may timeout intermittently; hard to debug flakiness
- Workaround: MOCK_LLM=true for faster local tests
- Recommendation: Continue with mocked tests for CI; reserve live AI test for scheduled deep validation runs

**No Tests for Person Deletion/Linking:**
- Issue: Incomplete features (`mobile/app/(auth)/person/[id].tsx` remove, inner thoughts linking) have no test coverage because they're not fully implemented
- Fix approach: Implement features and add tests, or remove incomplete UI elements

---

## Scaling & Capacity Concerns

**Session Message Growth:**
- Issue: UnifiedSessionScreen fetches messages with infinite scroll (`hasMoreMessages` flag, `fetchMoreMessages` callback)
- Files: `mobile/src/screens/UnifiedSessionScreen.tsx`, `mobile/src/hooks/useMessages.ts`
- Current design: Good (pagination support built in)
- Concern: Large sessions (1000+ messages) may slow down:
  - Reconciler context assembly (fetches all user messages to build context)
  - Mobile UI rendering (infinite scroll list)
- Mitigation: Message list uses pagination; reconciler uses message window, not full history
- Recommendation: Monitor session sizes; consider caching reconciler context if sessions exceed 2000 messages

**Realtime Connection Scalability:**
- Issue: Each session maintains Ably connection for real-time updates (`mobile/src/hooks/useRealtime.ts`, `backend/src/services/realtime.ts`)
- Current design: One connection per mobile session, fire-and-forget updates to partner
- Concern: Multiple concurrent sessions × many users = significant Ably bandwidth
- Mitigation: Production Ably plan is presumed to support expected user base
- Recommendation: Monitor Ably metrics; set up alerts for connection errors or message backlog

---

## Security Considerations

**E2E Auth Bypass Active in Production Code:**
- Issue: E2E auth bypass (`E2E_AUTH_BYPASS=true` environment variable) is built into production auth middleware
- Files: `backend/src/middleware/auth.ts` (75-120) - Accepts `x-e2e-user-id` and `x-e2e-user-email` headers
- Risk: If E2E_AUTH_BYPASS is accidentally set to true in production, anyone can impersonate any user
- Mitigation: Code checks `process.env.E2E_AUTH_BYPASS !== 'true'` before accepting headers; should only be enabled in test environments
- Recommendation: Extract E2E auth into separate test-only middleware file; never include in production auth chain. Add startup warning if detected in non-test environment.

**No Input Validation on Controller Parameters:**
- Issue: Controllers receive route parameters directly without schema validation; request bodies validated but route params may not be
- Files: Multiple controllers, e.g., `backend/src/controllers/stage2.ts` uses `req.params.id` without explicit zod/joi schema check
- Risk: Edge cases (missing IDs, malformed UUIDs) may cause unexpected database errors instead of clean 400 response
- Mitigation: Prisma handles invalid IDs gracefully; authorization checks verify user owns resource
- Recommendation: Add middleware to validate route params against schema (e.g., `is-valid-cuid()`)

---

## Fragile Areas Requiring Careful Modification

**Mobile Cache-First Architecture:**
- Files: `mobile/src/hooks/queryKeys.ts`, `mobile/src/hooks/useStages.ts`, `mobile/src/hooks/useSessions.ts`
- Fragility: Query key mismatches cause writes to cache keys nobody reads from; stage updates must be coordinated between multiple hooks
- Safe modification:
  1. Always check `queryKeys.ts` definitions before creating new cache writes
  2. Test mutation + cache update with React Query DevTools
  3. Verify UI updates by checking `useChatUIState` derives correct visibility
  4. Test reload/refresh to ensure derived UI state matches server truth

**Reconciler Empathy Status Machine:**
- Files: `backend/src/services/reconciler.ts`, `backend/src/controllers/stage2.ts`, `backend/src/services/empathy-status.ts`
- Fragility: Multiple tables track related state; cascading deletes may orphan records
- Safe modification:
  1. Understand full state diagram before changing ReconcilerResult status
  2. Check both ReconcilerResult and EmpathyStatus when changing empathy state
  3. Run existing reconciler tests after changes
  4. Test with database snapshots (`backend/snapshots/`) to validate data consistency

**Stage Prompts System:**
- Files: `backend/src/services/stage-prompts.ts`, `backend/src/services/stage-prompts-legacy.ts`
- Fragility: Stage-specific instructions embedded in prompt templates; changes affect AI behavior globally
- Safe modification:
  1. Make prompt changes in stage-prompts.ts only (not legacy)
  2. Test with prompt-test scripts before committing
  3. Run live AI E2E test to validate AI still understands stage intent
  4. Document any new prompt tags in comments (e.g., `<thinking>`, `<draft>`)

---

## Missing or Unclear Documentation

**Cache Key Pattern Not Type-Safe:**
- Issue: Query keys defined as string arrays in `queryKeys.ts`; no enforcement that keys used in `useQuery` match keys used in `setQueryData`
- Files: `mobile/src/hooks/queryKeys.ts`, all stage hooks
- Impact: Silent cache misses when keys don't match exactly
- Fix approach: Consider migrating to typed query key factory pattern (e.g., QueryClient `@tanstack/solid-query` style)

**AI Orchestrator Request Routing Logic Undocumented:**
- Issue: `routeModel()` and `scoreAmbiguity()` in `backend/src/services/model-router.ts` decide which model (Haiku/Sonnet/Claude) handles a request; logic not well documented
- Impact: Hard to understand why certain requests route to certain models
- Recommendation: Add docstring explaining routing decision logic; document model cost/latency tradeoffs

---

## Dependencies at Risk

**Bedrock/Claude API Dependence:**
- Risk: Entire AI system depends on AWS Bedrock for Claude models
- Mitigation: Circuit breakers prevent total failure; fallbacks return safe responses
- Recommendation: Monitor Bedrock health; have contingency plan if service is unavailable (e.g., maintenance mode)

**Expo/React Native Ecosystem:**
- Risk: Mobile app built on Expo; platform relies on rapid Expo/RN updates for iOS/Android compatibility
- Mitigation: Expo handles most compatibility concerns
- Recommendation: Keep Expo SDK and RN versions current; test on real devices during major upgrades

---

## Deferred Work / Known Limitations

**Person Removal Not Wired:**
- Status: UI exists but no backend implementation
- Impact: Users can open remove dialog but action is no-op
- Issue: `mobile/app/(auth)/person/[id].tsx` (52)

**Inner Thoughts Linking Not Complete:**
- Status: Schema supports linking inner work sessions to partner sessions; mobile UI prepared but feature disabled
- Impact: Intended feature to reflect during partner sessions not available
- Issue: `mobile/app/(auth)/inner-thoughts/index.tsx` (225)

**Strategy Suggestion Generation Missing:**
- Status: UI prepares for AI-generated strategy suggestions; AI call not hooked up
- Impact: Users see strategy UI but suggestions are hardcoded/empty
- Issue: `backend/src/controllers/stage4.ts` (862)

**Bell Sound for Typing Indicator Not Implemented:**
- Status: Code comments indicate intent but no audio asset loaded
- Issue: `mobile/src/hooks/useSpeech.ts` (471)

---

## Database & Migration Concerns

**No Explicit Database Transaction Usage:**
- Issue: Multi-step operations (e.g., reconciler result creation + share offer upsert) lack explicit transactions
- Files: `backend/src/services/reconciler.ts` (825-840)
- Risk: Partial failures could leave orphaned records
- Mitigation: Cascading deletes defined in Prisma schema handle cleanup
- Recommendation: Wrap multi-step operations in `prisma.$transaction()` for consistency

**Migration Files Not Audited:**
- Issue: Prisma migrations exist but no review of migration safety/rollback procedures
- Impact: Uncertain if old migrations can rollback cleanly
- Recommendation: Document migration testing procedure; keep backup before production migrations

---

*Concerns audit: 2026-02-14*
