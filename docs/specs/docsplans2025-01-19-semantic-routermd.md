# Semantic Router Specification

**Feature:** Replace rigid JSON tool-call output with a Hybrid Envelope pattern
**Status:** Ready for Implementation
**Created:** 2025-01-19

---

## Overview

Replace the current tool-call JSON output format with a **Hybrid Envelope** pattern that combines:
- `<meta>{JSON}</meta>` - Strict JSON for routing flags (type-safe, parseable)
- `<draft>Text</draft>` - Optional raw text for invitations/empathy (no JSON escaping)
- Free text - User-facing response (no tags)

### Benefits

1. **Faster**: No JSON escaping in response text; streaming-compatible
2. **More Robust**: Strict JSON for critical flags with regex fallback
3. **Type-Safe**: TypeScript types for mode/strategy with runtime validation
4. **Token Savings**: Dispatch off-ramps to Haiku for meta-questions (not Sonnet)

---

## Architecture

### Output Format

```
<meta>{"mode":"Witness", "check":true, "dispatch":null}</meta>
<draft>I think you feel overwhelmed...</draft>
That sounds really hard. I appreciate you sharing...
```

### Meta Envelope Schema

```typescript
interface MetaEnvelope {
  mode?: AiMode;          // AI mode: Witness, Insight, Bridge, Build
  check?: boolean;        // Stage 1: offer feel-heard check
  share?: boolean;        // Stage 2: ready to share empathy
  dispatch?: string;      // Off-ramp tag (EXPLAIN_PROCESS, HANDLE_MEMORY_REQUEST) or null
  analysis?: string;      // Optional short rationale (for logging only)
}
```

### Type Constants

```typescript
// ai-types.ts
export const AI_MODES = ['Witness', 'Insight', 'Bridge', 'Build'] as const;
export type AiMode = typeof AI_MODES[number];

export const STRATEGIES = ['Validate', 'Reflect', 'Guide', 'Question'] as const;
export type Strategy = typeof STRATEGIES[number];
```

### Dispatch Architecture

When Sonnet outputs `<meta>{"dispatch":"EXPLAIN_PROCESS"}</meta>`:

1. Orchestrator catches the dispatch tag
2. Invokes Haiku with:
   - Specialist system prompt (PROCESS_SPECIALIST or MEMORY_SPECIALIST)
   - User's original message
   - Last 2-3 conversation turns for context
   - Current stage number
3. Haiku generates plain text response (no envelope)
4. Orchestrator returns Haiku's response to user

**Known Dispatch Tags:**

| Tag | Specialist Purpose | Source |
|-----|-------------------|--------|
| `EXPLAIN_PROCESS` | Explains the 4-stages methodology | `PROCESS_OVERVIEW` constant |
| `HANDLE_MEMORY_REQUEST` | Directs user to Profile → Things to Remember | `INVALID_MEMORY_GUIDANCE` constant |

---

## User Stories

### US-1: Parse Valid Hybrid Envelope

**As the** AI orchestrator
**I want to** parse a valid hybrid envelope response
**So that** I can extract mode, flags, draft, and response text correctly

**Acceptance Criteria:**
- [ ] `<meta>{"mode":"Witness","check":true}</meta>` extracts `{mode:"Witness",check:true}`
- [ ] `<draft>Draft text</draft>` extracts draft as string
- [ ] Text after tags becomes `response` field
- [ ] All tags stripped from final response text

### US-2: Handle Malformed JSON Gracefully

**As the** parser
**I want to** recover from malformed JSON in meta blocks
**So that** the system doesn't crash on LLM errors

**Acceptance Criteria:**
- [ ] Unclosed JSON `<meta>{"mode":"Witness"</meta>` triggers regex fallback
- [ ] Regex extracts `dispatch`, `check`, `share` flags if present
- [ ] Unclosed `<meta>...` (no closing tag) still parses using greedy match
- [ ] Response field contains usable text even on parse failure
- [ ] Warning logged for malformed JSON (not error/crash)

### US-3: Handle Missing Tags

**As the** parser
**I want to** handle responses with missing optional tags
**So that** simpler responses still work

**Acceptance Criteria:**
- [ ] Response without `<meta>` returns empty meta object + raw text as response
- [ ] Response without `<draft>` returns `draft: null`
- [ ] Response with only `<meta>` and text (no draft) parses correctly

### US-4: Dispatch to Process Specialist

**As a** user asking "How does this app work?"
**I want to** get a contextual explanation from a specialist
**So that** I understand the 4-stages process

**Acceptance Criteria:**
- [ ] Sonnet outputs `<meta>{"dispatch":"EXPLAIN_PROCESS"}</meta>`
- [ ] Orchestrator invokes Haiku with PROCESS_SPECIALIST_PROMPT
- [ ] Haiku receives user's original question + last 2-3 turns
- [ ] Haiku returns plain text (no envelope)
- [ ] User receives Haiku's response (not Sonnet's)
- [ ] Brain activity logs show dispatch flow (DISPATCHED: EXPLAIN_PROCESS)

### US-5: Dispatch to Memory Specialist

**As a** user asking the AI to "remember" something
**I want to** be redirected to the proper memory feature
**So that** I can save memories in my profile

**Acceptance Criteria:**
- [ ] Sonnet outputs `<meta>{"dispatch":"HANDLE_MEMORY_REQUEST"}</meta>`
- [ ] Orchestrator invokes Haiku with MEMORY_SPECIALIST_PROMPT
- [ ] Response directs user to Profile → Things to Remember
- [ ] Response is warm and conversational (not canned)

### US-6: Stage 1 Feel-Heard Check Flag

**As the** orchestrator processing Stage 1
**I want to** detect when AI is ready to offer feel-heard check
**So that** the UI can show the appropriate prompt

**Acceptance Criteria:**
- [ ] `<meta>{"check":true}</meta>` sets `offerFeelHeardCheck: true`
- [ ] `<meta>{"check":false}</meta>` sets `offerFeelHeardCheck: false`
- [ ] Missing `check` field defaults to `false`

### US-7: Stage 0 Invitation Draft

**As the** orchestrator processing Stage 0 (Invitation)
**I want to** extract the invitation message draft
**So that** the UI can show the draft with a Share button

**Acceptance Criteria:**
- [ ] Stage 0 prompt instructs model to use `<draft>` for invitation text
- [ ] `<draft>I've been thinking about us...</draft>` extracts as `invitationMessage`
- [ ] Draft extracted regardless of meta flags (no `share` flag needed for Stage 0)
- [ ] Invitation draft populates `invitationMessage` field in orchestrator result
- [ ] Works for both initial invitation and invitation refinement flows

### US-8: Stage 2 Ready-to-Share Flag with Empathy Draft

**As the** orchestrator processing Stage 2
**I want to** detect when AI has an empathy draft ready
**So that** the UI can show the draft and share button

**Acceptance Criteria:**
- [ ] Stage 2 prompt instructs model to use `<draft>` for empathy statement
- [ ] `<meta>{"share":true}</meta>` with `<draft>...</draft>` extracts both
- [ ] Draft content populates `proposedEmpathyStatement`
- [ ] `offerReadyToShare: true` set when `share:true`
- [ ] Empathy draft auto-saved to database when present

### US-9: Log Parsed Structure to Brain Activity

**As a** developer debugging via status dashboard
**I want to** see parsed envelope fields in brain activity
**So that** I can verify parsing is correct

**Acceptance Criteria:**
- [ ] `structuredOutput` field includes `{ thinking, response, draft, meta }`
- [ ] Status dashboard displays thinking/meta content in collapsible section
- [ ] Raw output text also preserved in `output.text`

### US-10: Prompt Protocol Builder

**As the** prompt system
**I want to** generate consistent response protocol instructions
**So that** all stages use the same envelope format

**Acceptance Criteria:**
- [ ] `buildResponseProtocol(stage)` returns format instructions
- [ ] Valid modes injected from `AI_MODES.join('|')`
- [ ] Stage-specific flags included (check for S1, share for S2)
- [ ] Dispatch tag instructions included
- [ ] No duplication - shared protocol used across stages

### US-11: Remove Legacy Tool Call Instructions

**As the** codebase
**I want to** remove old TOOL_USE constants
**So that** there's no confusion about output format

**Acceptance Criteria:**
- [ ] `TOOL_USE_STAGE_0`, `TOOL_USE_STAGE_1`, `TOOL_USE_STAGE_2` deleted
- [ ] `TOOL_USE_LATER_STAGES`, `TOOL_USE_INNER_WORK` deleted
- [ ] `TOOL_USE_OPENING_MESSAGE` deleted
- [ ] `update_session_state` tool references removed from prompts
- [ ] All stages use `buildResponseProtocol()`

### US-12: Transition Prompt Consistency

**As the** prompt system
**I want** transition prompts to use the same envelope format
**So that** stage transitions are consistent

**Acceptance Criteria:**
- [ ] `buildStageTransitionPrompt()` includes `buildResponseProtocol()`
- [ ] Transition prompts have minimal duplication
- [ ] Only stage-specific context included (not repeated base instructions)

---

## Implementation Plan

### Phase 1: Core Protocol & Types

**Goal:** Establish type-safe foundation

#### Task 1.1: Define AI Types
- **Create:** `backend/src/services/ai-types.ts`
- **Define:** `AI_MODES`, `AiMode`, `STRATEGIES`, `Strategy`
- **Export:** For use in prompt builder and orchestrator

### Phase 2: Hybrid Envelope Parser (TDD)

**Goal:** Build robust parser with comprehensive tests

#### Task 2.1: Write Parser Tests
- **Create:** `backend/src/services/__tests__/ai-parser.test.ts`
- **Tests:**
  1. Parse perfect hybrid envelope
  2. Parse envelope with missing draft
  3. Handle malformed JSON gracefully (regex fallback)
  4. Handle unclosed tags (greedy match)
  5. Strip all tags from user response
  6. Handle empty/whitespace responses
  7. Handle draft without meta
  8. Validate mode against AI_MODES constant

#### Task 2.2: Implement Parser
- **Location:** `backend/src/services/ai-parser.ts` (new file)
- **Function:** `parseHybridResponse(raw: string): ParsedEnvelope`
- **Logic:**
  1. Extract `<meta>` → `JSON.parse()` with try/catch
  2. Regex fallback for critical flags on JSON failure
  3. Extract `<draft>` → raw text
  4. Strip tags → remaining text is response
  5. Validate mode against AI_MODES

### Phase 3: Dispatch System (Haiku Side-Channel)

**Goal:** Implement specialist handlers for off-ramp scenarios

#### Task 3.1: Create Specialist Prompts
- **Create:** `backend/src/services/haiku-specialists.ts`
- **Move:** `PROCESS_OVERVIEW` from stage-prompts.ts
- **Define:** `PROCESS_SPECIALIST_PROMPT`, `MEMORY_SPECIALIST_PROMPT`

#### Task 3.2: Implement Dispatch Handler
- **Create:** `backend/src/services/dispatch-handler.ts`
- **Function:** `handleDispatch(tag: string, context: DispatchContext): Promise<string>`
- **Logic:**
  1. Switch on dispatch tag
  2. Build Haiku prompt with specialist + user message + recent context
  3. Call `getHaikuResponse()`
  4. Return plain text response

#### Task 3.3: Write Dispatch Tests
- **Create:** `backend/src/services/__tests__/dispatch-handler.test.ts`
- **Tests:**
  1. EXPLAIN_PROCESS returns process explanation
  2. HANDLE_MEMORY_REQUEST returns memory guidance
  3. Unknown tag returns graceful fallback
  4. Context (stage, recent messages) passed to Haiku

### Phase 4: Prompt Builder Refactor

**Goal:** Update prompts to request new envelope format

#### Task 4.1: Create Response Protocol Builder
- **Location:** `backend/src/services/stage-prompts.ts`
- **Function:** `buildResponseProtocol(stage: number): string`
- **Content:**
  ```
  RESPONSE FORMAT:
  1. HEADER: <meta>{"mode":"<Witness|Insight|Bridge|Build>", "check":true/false, ...}</meta>
  2. DRAFT: <draft>Text</draft> (Only if drafting content)
  3. MESSAGE: Your natural response text (No tags)
  ```
- **Dynamic:** Inject `AI_MODES.join('|')` for valid options

#### Task 4.2: Update Stage Prompts
- Replace `${TOOL_USE_STAGE_0}` with `${buildResponseProtocol(0)}` - **must include `<draft>` instruction for invitation**
- Replace `${TOOL_USE_STAGE_1}` with `${buildResponseProtocol(1)}` - includes `check` flag
- Replace `${TOOL_USE_STAGE_2}` with `${buildResponseProtocol(2)}` - includes `share` flag + `<draft>` for empathy
- Update Stage 3, 4 with `${buildResponseProtocol(stage)}` (no flags, no draft)
- Update Inner Work, transitions to use consistent protocol

#### Task 4.3: Clean Up Legacy Code
- Delete `TOOL_USE_STAGE_0`, `TOOL_USE_STAGE_1`, `TOOL_USE_STAGE_2`
- Delete `TOOL_USE_LATER_STAGES`, `TOOL_USE_INNER_WORK`, `TOOL_USE_OPENING_MESSAGE`
- Remove `isProcessQuestion()` helper (dispatch handles this now)
- Move `PROCESS_OVERVIEW` to haiku-specialists.ts

#### Task 4.4: Write Prompt Tests
- **Update:** `backend/src/services/__tests__/stage-prompts.test.ts`
- **Tests:**
  1. Stage 1 protocol includes `<meta>` and `check` flag
  2. Stage 2 protocol includes `share` flag and `<draft>` instructions
  3. Protocol does NOT include old JSON format
  4. Protocol does NOT include tool call instructions
  5. AI_MODES options appear in prompt text

### Phase 5: Integration & Cutover

**Goal:** Wire everything together and verify

#### Task 5.1: Update Orchestrator
- **Modify:** `backend/src/services/ai-orchestrator.ts`
- **Changes:**
  1. Import `parseHybridResponse` from ai-parser
  2. Import `handleDispatch` from dispatch-handler
  3. Replace `parseStructuredResponse` with `parseHybridResponse`
  4. Add dispatch check: `if (parsed.meta.dispatch) return handleDispatch(...)`
  5. Map parsed flags to existing fields (`offerFeelHeardCheck`, etc.)
  6. Log `structuredOutput` with parsed envelope to brain activity

#### Task 5.2: Delete Legacy Code
- Remove `parseStructuredResponse()` function
- Remove `extractResponseFallback()` function
- Remove `extractJsonFromResponse` import

#### Task 5.3: Update Brain Activity Logging
- **Modify:** `completeActivity()` call in orchestrator
- **Add:** `structuredOutput: { thinking: parsed.meta, response, draft, dispatchTag }`

#### Task 5.4: Integration Tests
- **Create:** `backend/src/services/__tests__/semantic-router-integration.test.ts`
- **Tests:**
  1. Stage 1 flow: parse response, extract check flag
  2. Stage 2 flow: parse response, extract draft and share flag
  3. Dispatch flow: EXPLAIN_PROCESS triggers Haiku
  4. Privacy: Tags never leak to user response
  5. Malformed response: system doesn't crash

#### Task 5.5: Manual Verification
1. Start session, say "I'm feeling sad" → Verify Witness response
2. Say "How does this app work?" → Verify Haiku dispatch response
3. Say "Remember my partner's name is Alex" → Verify memory dispatch
4. Progress to Stage 2 → Verify empathy draft extraction
5. Check status dashboard → Verify brain activity shows parsed structure

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/src/services/ai-types.ts` | Create | Type constants for modes/strategies |
| `backend/src/services/ai-parser.ts` | Create | Hybrid envelope parser |
| `backend/src/services/__tests__/ai-parser.test.ts` | Create | Parser unit tests |
| `backend/src/services/haiku-specialists.ts` | Create | Specialist prompts for dispatch |
| `backend/src/services/dispatch-handler.ts` | Create | Dispatch routing handler |
| `backend/src/services/__tests__/dispatch-handler.test.ts` | Create | Dispatch handler tests |
| `backend/src/services/stage-prompts.ts` | Modify | Replace TOOL_USE with buildResponseProtocol |
| `backend/src/services/__tests__/stage-prompts.test.ts` | Modify | Add protocol tests |
| `backend/src/services/ai-orchestrator.ts` | Modify | Use new parser, add dispatch flow |
| `backend/src/services/__tests__/semantic-router-integration.test.ts` | Create | E2E verification |

---

## Verification Commands

```bash
# Run all backend tests
cd backend && npm test

# Run specific test suites
npm test -- ai-parser.test.ts
npm test -- dispatch-handler.test.ts
npm test -- stage-prompts.test.ts
npm test -- semantic-router-integration.test.ts

# Type check
npm run check

# Manual verification
# Start backend, open status dashboard, test conversation flows
```

---

## Rollback Plan

If issues arise post-implementation:

1. The old `parseStructuredResponse` can be restored from git history
2. Revert prompt changes to use TOOL_USE constants
3. Remove dispatch handler integration
4. Changes are isolated to parsing/prompt layers - rollback is straightforward

---

## Out of Scope

- Streaming response parsing (future enhancement)
- Additional dispatch tags beyond EXPLAIN_PROCESS and HANDLE_MEMORY_REQUEST
- Mobile app changes (backend-only refactor)
- Feature flags for gradual rollout (hard cutover since not in production)
