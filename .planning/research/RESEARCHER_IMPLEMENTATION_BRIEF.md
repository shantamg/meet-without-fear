# Researcher's Implementation Brief

**Role:** Codebase Researcher
**Date:** February 23, 2026
**Status:** Design finalized, moving to implementation planning

---

## 1. WHAT SPECIFICALLY NEEDS TO BE BUILT (Researcher's Scope)

As the Codebase Researcher, my responsibility is to ensure the team understands the system they're modifying and can implement with confidence.

### 1.1 Documentation Updates Required

**Critical:** Previous impact assessment (TECHNICAL_CHANGE_IMPACT_ASSESSMENT.md) assumed Stage 2.5 as a real stage in StageProgress. With the final decision that **Stage 2B is prompt-routing only** (no StageProgress advancement), major sections need revision:

**Documents to Update:**
1. **Stage Enum Update** - Clarify Stage 21 is for prompt routing, not player progression
   - Prisma StageProgress will NOT have values for 2.5/21
   - Only Stage 0, 1, 2, 3, 4 exist in actual progression
   - Stage 21 is purely internal routing hint

2. **Cache Key Recalculation** - With refinement being stateless/client-only:
   - Remove: `stageKeys.refinementSession(sessionId)` (no DB persistence)
   - Remove: `stageKeys.refinementGaps(sessionId)` (not needed, can be computed)
   - KEEP: `sessionKeys.state(id)` (tracks stage 0-4 only)
   - NEW: Client-side state for refinement chat history (not in cache, local to modal)

3. **Database Schema Revision** - With stateless refinement:
   - REMOVE: RefinementSession table (no DB writes)
   - REMOVE: RefinementMessage table (no DB writes)
   - NO changes to EmpathyAttempt or StageProgress
   - NO new fields needed

4. **DTO Revision** - Stateless refinement implications:
   - Remove: RefinementSessionDTO (not persisted)
   - Keep: OpenRefinementModalResponse (API response)
   - Keep: SendRefinementMessageResponse (SSE streaming)
   - Add: RefinementChatHistoryDTO (client-side only, not serialized to DB)
   - Add: CircuitBreakerStatus in empathy response (track attempts)

### 1.2 Architecture Documentation

**Create:** `ARCHITECTURE_DECISION_RATIONALE.md`
- Explain why Stage 2B is routing-only, not a progression stage
- Document what "stateless refinement" means for implementation
- Clarify scope boundary: reconciler decides IF refinement needed, modal handles HOW

**Update:** CODEBASE_ANALYSIS.md Section 2 (Stage System)
- Clarify Stage 0-4 are only progression stages
- Stage 21 is internal to reconciler decision logic
- Refinement doesn't change the Session.currentStage field

---

## 2. FINAL CONCERNS & RECOMMENDATIONS

### 2.1 HIGH PRIORITY CLARIFICATIONS NEEDED

**Before Backend Implementation Starts:**

1. **Circuit Breaker Tracking** - Where is attempt count stored?
   - Current decision: Stage 2B is routing-only, no new stage
   - Question: How does reconciler know "this is attempt 3"?
   - Recommendation: Add `empathyRefinementAttempts` to EmpathyAttempt model (single integer field, not a new table)
   - Impact: ~2 lines in schema, not a new model

2. **Refinement Entry Point** - When does reconciler return Stage 21?
   - Decision: Reconciler logic decides IF gaps warrant refinement
   - Recommendation: Add enum value `ATTEMPT_REFINEMENT = 21` to Stage enum for dispatch routing only
   - Backend must still return `stage: 2` in progress responses (not 21)
   - Implication: Stage 21 is an internal signal, not user-visible

3. **Stateless Modal State Management** - How much history does client keep?
   - Decision: Client manages history, no DB writes
   - Questions to answer:
     - Keep full refinement chat history for session? Or discard on modal close?
     - If user closes modal mid-refinement, can they reopen to same state?
     - If connection lost during refinement, what happens?
   - Recommendation: Discard history on modal close (user can reopen, starts fresh)
   - Implication: Less component state complexity, clearer UX

### 2.2 MEDIUM PRIORITY RECOMMENDATIONS

1. **Refinement Modal Cache Invalidation**
   - When modal closes: invalidate `stageKeys.empathyStatus()` (status may have changed)
   - When resubmit completes: invalidate session progress cache
   - Recommendation: Document exact cache invalidation points in implementation plan

2. **Query Key Simplification**
   - Original plan had 5 new cache keys
   - With stateless refinement: only 2 cache keys needed
   - Existing: `stageKeys.empathyStatus()` - already tracks REFINING status
   - New: `stageKeys.refinementMetadata()` - track circuit breaker status per attempt
   - Recommendation: Keep cache keys minimal, don't over-persist

3. **Reconciler Visibility into Refinement**
   - Current design: Reconciler returns Stage 21, doesn't know if user actually opens modal
   - Question: Should reconciler track if refinement was offered vs. attempted vs. completed?
   - Recommendation: Track in `empathyRefinementAttempts` count, not in status
   - Implication: Reconciler doesn't need callback from modal, just count increments

### 2.3 LOW PRIORITY OBSERVATIONS

1. **Streaming Separation** - Refinement chat on separate endpoint is good
   - No risk of message merging
   - Client history management is cleaner

2. **Ably Events** - With stateless refinement, fewer events needed
   - Can publish fewer events (no refinement.session_saved needed)
   - Just: refinement.started, refinement.completed

3. **Menu Implementation** - Sent/Received tabs are simple data filter
   - No architectural complexity
   - Use existing useSharingStatus hook, just split display

---

## 3. DEPENDENCIES ON OTHER TEAM MEMBERS' WORK

### 3.1 Backend Team Dependencies

**Backend Team Must Finalize:**
1. ✅ **Stage 21 Dispatch Route** - Where is stage routing implemented?
   - In `dispatch-handler.ts`? Or in `reconciler.ts`?
   - Answer needed: Backend lead must confirm dispatch logic

2. ✅ **Reconciler Circuit Breaker Semantics** - Exact behavior
   - When does count reset? Per session? Per direction? Per empathy attempt?
   - Answer needed: Backend lead must specify in reconciler design doc

3. ✅ **Refinement Response Contract** - What does `/reconciler/refinement/message` return?
   - SSE events? Or JSON response?
   - If SSE: what metadata types?
   - Answer needed: Backend lead must finalize API contract

4. ⚠️ **EmpathyAttempt.refinementAttempts Field** - New schema field
   - Must be added during schema planning
   - Affects: EmpathyAttempt migration, DTO updates
   - Researcher output: Updated TECHNICAL_CHANGE_IMPACT_ASSESSMENT with corrected schema

### 3.2 Frontend Team Dependencies

**Frontend Team Must Finalize:**
1. ✅ **Modal Navigation Route** - Exact routing structure
   - How is refinement modal opened from SharingStatusScreen?
   - Full-screen modal = new route, or overlay on existing route?
   - Answer needed: Frontend lead must confirm navigation design

2. ✅ **Refinement Chat Component Design** - State management approach
   - useState for message history? Or other pattern?
   - How to handle optimistic sends (show immediately vs. wait for SSE)?
   - Answer needed: Frontend lead must specify component architecture

3. ⚠️ **Menu Tab Implementation** - Data filtering logic
   - Filter useSharingStatus data in component, or add hook?
   - Recommendation: Add `useSharedSentTab()` and `useSharedReceivedTab()` hooks
   - Keeps component simpler, logic centralized

4. ✅ **Cache Invalidation Strategy** - Modal close behavior
   - Which caches to invalidate?
   - Answer needed: Frontend lead must spec in hooks design

### 3.3 QA Team Dependencies

**Testing Strategy Must Account For:**
1. **Stage 2B Entry Point** - When reconciler offers refinement
   - E2E test: Gap detected → reconciler returns Stage 21 → modal offered
   - Must NOT advance stage to 2.5 (stays at 2)

2. **Circuit Breaker** - Attempts tracked correctly
   - E2E test: 3 refinement cycles → 4th attempt bypasses reconciler
   - E2E test: Count resets correctly per direction/session

3. **Stateless Modal** - No data leaks between sessions
   - Unit test: Modal history cleared on close
   - E2E test: Reopen modal = fresh chat (no previous history)

4. **Menu Navigation** - Tab filtering works
   - Unit test: Sent tab shows only empathy I sent
   - Unit test: Received tab shows only partner's empathy

---

## 4. IMPACT ON PREVIOUS DOCUMENTS

### Updates Required to TECHNICAL_CHANGE_IMPACT_ASSESSMENT.md

**Critical Corrections:**

| Section | Old Assumption | New Decision | Impact |
|---------|---|---|---|
| 1.1 Stage Enum | Stage 2.5 in progression | Stage 21 for routing only | Remove 2.5, add 21 note |
| 1.4 Prisma Schema | RefinementSession + RefinementMessage tables | Single field: `refinementAttempts` on EmpathyAttempt | Eliminates 2 models, adds 1 field |
| 1.6 Mobile Hooks | useRefinement hook managing cache | Client-side state management only | Simplifies implementation |
| Cache Keys | 5 new keys (refinementSession, etc.) | 1 new key for metadata | Reduces cache complexity |
| Implementation | 4 phases over 8-10 days | Likely 3 phases, 5-7 days | Significant time savings |

**New Section Needed:** "Stage 21 Clarification"
- Explain Stage 21 is internal routing signal, not user-visible
- Document why stateless refinement was chosen
- Show decision tree: Gap detected → decide if refinement → dispatch to refinement handler

---

## 5. RESEARCHER'S FINAL SIGN-OFF

### What the Researcher Has Provided

✅ **CODEBASE_ANALYSIS.md** - Complete current system documentation (16 sections, all file paths verified)

✅ **TECHNICAL_CHANGE_IMPACT_ASSESSMENT.md** - Impact analysis (26 files, exact priorities, integration points)
   - **NOTE:** Needs revision for Stage 2B as routing-only, stateless refinement

🆕 **RESEARCHER_IMPLEMENTATION_BRIEF.md** (this document) - Final implementation scope

### What Researcher Will Not Do

The following are outside researcher scope (for other team members):

- ❌ Write implementation code
- ❌ Create architecture diagrams
- ❌ Design UI wireframes
- ❌ Plan testing approach
- ❌ Manage implementation schedule

### What Researcher Can Support

The following are researcher scope if needed:

- ✅ **Clarify any codebase questions** - "How does X work?"
- ✅ **Update documentation** - As implementation details change
- ✅ **Validate implementation plans** - "Does this match the codebase architecture?"
- ✅ **Flag breaking changes** - "This change will affect existing feature Y"

---

## 6. IMPLEMENTATION READINESS CHECKLIST

**For Team Lead to Finalize Before Implementation Starts:**

- [ ] Confirm Stage 21 enum value and where it's used
- [ ] Confirm refinement is stateless (no DB writes, client manages history)
- [ ] Confirm attempt counting strategy (single field on EmpathyAttempt)
- [ ] Confirm modal dismissal = discard history
- [ ] Confirm cache invalidation strategy for modal close
- [ ] Confirm refinement dispatch entry point in reconciler/dispatch
- [ ] Confirm API contract for `/reconciler/refinement/message` endpoint
- [ ] Confirm navigation route structure for modal

Once above are confirmed, researcher can validate implementation plans and provide support.

---

## 7. SUMMARY FOR IMPLEMENTATION TEAMS

**For Backend Team:**
- Small schema change (1 field added, not a new table)
- Circuit breaker logic remains in reconciler.ts
- New endpoint for refinement streaming (reuse existing SSE infrastructure)
- Dispatch routing for Stage 21 (internal decision point, not progression stage)

**For Frontend Team:**
- New full-screen modal screen (RefinementModalScreen)
- Client-side message history management (useState, not cache)
- Menu tabs in SharingStatusScreen (filter existing data)
- Cache invalidation on modal close

**For QA Team:**
- Stage 2 progression unchanged (still 0→1→2→3→4)
- Refinement is optional deviation, not core flow
- Attempt counting must be verified
- Stateless modal means no data persistence to validate

---

*This brief is final researcher output. Implementation planning can now proceed with confidence.*
