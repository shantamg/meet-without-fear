# Prompt Facilitator Upgrade Specification

## Overview

This specification combines two improvements to the AI facilitation prompts:

1. **Prompt condensation** - Trust Sonnet's capabilities, remove verbosity and explicit quote examples
2. **Human facilitator behavioral rules** - Attunement before agency, one question per turn, no premature options

Additionally, this spec includes a bug fix to wire up the emotionalIntensity signal from the database, enabling threshold-based mode-locking.

## Decisions

| Question | Decision |
|----------|----------|
| Include emotionalIntensity bug fix? | **Yes** - wire up real value from DB |
| Verification of "one question max"? | **Manual testing only** - trust prompt |
| Keep explicit examples? | **Remove all** - trust Sonnet knows reflection techniques |
| Response structure (reflect/center/next-move)? | **Internal guidance** - output should feel natural |
| Stage 2 question limit? | **Same as Stage 1** - one question max applies |
| Attunement signals tracking? | **Claude infers from conversation history** |
| Token reduction measurement? | **Note as expected benefit** - no formal measurement |
| Deployment strategy? | **All at once** - single atomic deployment |
| Rollback criteria? | **Manual QA judgment** - if responses feel worse, revert |

## Scope

### In Scope
- Prompt condensation in `backend/src/services/stage-prompts.ts`
- New FACILITATOR_RULES constant
- Stage 1 (Witnessing) prompt rewrite
- Stage 2 (Perspective Stretch) prompt update
- Light updates for Stages 0, 3, 4
- INNER_WORK_GUIDANCE condensation
- Bug fix: wire up emotionalIntensity from DB in `backend/src/services/chat-router/session-processor.ts`

### Out of Scope
- Output schema changes
- UI changes
- Programmatic verification of facilitator rules
- Per-turn emotion label tracking (future work)

## Technical Context

### emotionalIntensity Bug

**Current behavior:**
- Users record emotional intensity via `POST /sessions/:id/emotions`
- Value is saved to `EmotionalReading` table (users always have a reading since it's asked on session entry)
- When `session-processor.ts` builds the AI orchestrator context, it hardcodes `emotionalIntensity: 5`
- Threshold-based mode-locking (>= 8) never triggers

**Fixed behavior:**
- Query latest EmotionalReading for user/session
- Pass real intensity value to AI orchestrator
- Mode-locking at >= 8 triggers correctly

## User Stories

### US-1: Condense Shared Prompt Snippets

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] PRIVACY_GUIDANCE reduced from 22 lines to ~6 lines
- [ ] SIMPLE_LANGUAGE_PROMPT reduced from 4 lines to ~2 lines
- [ ] LATERAL_PROBING_GUIDANCE reduced from 17 lines to ~8 lines
- [ ] PROCESS_OVERVIEW reduced from 13 lines to ~7 lines
- [ ] All existing tests pass (`npm run test -w backend`)
- [ ] No change in behavior (verified by manual testing)

---

### US-2: Add FACILITATOR_RULES Constant

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] New constant added with:
  - Response structure guidance (reflect/center/next-move as internal checklist, not visible in output)
  - One question maximum per response
  - Post-inward-question acknowledgment rule
  - Attunement signals (high intensity, grief/shame/fear/loneliness, vulnerable naming)
  - Agency signals (explicit ask for help, problem-solving language, settled intensity)
- [ ] Constant is ~20 lines
- [ ] Applies to Stages 1 and 2

---

### US-3: Rewrite Stage 1 (Witnessing) Prompt

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] GREEN LIGHT / RED LIGHT example lists removed
- [ ] REFLECTION TECHNIQUES list removed
- [ ] MODELING REFRAMES section removed
- [ ] WHAT TO ALWAYS AVOID list removed
- [ ] INSIGHT TECHNIQUES list removed
- [ ] MEMORY USAGE section removed (duplicates base guidance)
- [ ] FACILITATOR_RULES included
- [ ] Prompt reduced from ~120 lines to ~50 lines
- [ ] All existing Stage 1 tests pass

---

### US-4: Update Stage 2 (Perspective Stretch) Prompt

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] FACILITATOR_RULES included
- [ ] MIRROR_INTERVENTION condensed to ~8 lines
- [ ] Mode descriptions condensed (LISTENING/BRIDGING/BUILDING/MIRROR - intent only, no examples)
- [ ] One question max rule applies (same as Stage 1)
- [ ] All existing Stage 2 tests pass

---

### US-5: Light Updates for Stages 0, 3, 4

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] Stage 0 (Onboarding): ONBOARDING_TONE constant added (~3 lines - warm, patient, celebratory of courage)
- [ ] Stage 3 (Need Mapping): NEED_MAPPING_APPROACH constant added (~3 lines - more teaching, validate before reframe)
- [ ] Stage 4 (Strategic Repair): No changes (appropriately more agency)
- [ ] All existing tests pass

---

### US-6: Condense INNER_WORK_GUIDANCE

**Files:** `backend/src/services/stage-prompts.ts`

**Acceptance Criteria:**
- [ ] Reduced from 52 lines to ~20 lines
- [ ] Same behavior preserved
- [ ] Tests pass

---

### US-7: Wire Up emotionalIntensity from Database

**Files:** `backend/src/services/chat-router/session-processor.ts`

**Acceptance Criteria:**
- [ ] Query latest EmotionalReading for the user in the current session
- [ ] Pass real intensity value to AI orchestrator context
- [ ] Mode-locking (>= 8 stays in WITNESS) actually triggers when user has high intensity
- [ ] Tests pass

---

## Implementation Order

1. US-1: Condense shared prompt snippets
2. US-2: Add FACILITATOR_RULES constant
3. US-3: Rewrite Stage 1 prompt
4. US-4: Update Stage 2 prompt
5. US-5: Light updates for Stages 0, 3, 4
6. US-6: Condense INNER_WORK_GUIDANCE
7. US-7: Wire up emotionalIntensity from DB

## Verification

### Automated Tests
```bash
npm run check   # Type checking
npm run test -w backend  # Backend tests
```

### Manual Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| **High-intensity emotional sharing** | User shares grief/shame/fear at intensity 8+. AI validates heavily, stays in WITNESS mode, no solutions or insights. |
| **Vulnerable disclosure** | User names something deeply personal. Next AI response acknowledges or deepens - no options, no pivot to problem-solving. |
| **Premature problem-solving request** | User asks "what should I do?" too early. AI redirects to feeling heard first before offering guidance. |
| **One question per response** | Every AI response contains at most one question. No multi-question responses. |
| **Natural conversational tone** | Responses feel like a warm human facilitator, not a textbook or checklist. No visible structure. |

## Expected Outcomes

1. **Token reduction**: ~50-60% fewer prompt tokens per request (noted as expected benefit, not formally measured)
2. **Natural variation**: AI responses won't parrot example phrases
3. **Consistent attunement**: One question max, presence before productivity
4. **No structural changes**: Same output contracts, same UI behavior

## Rollback Plan

If manual QA shows regressions (responses feel worse, less attuned, rushing past pain):
1. Git revert the prompt changes
2. Identify which specific condensation caused issues
3. Add back specificity only where needed

The existing tests provide a safety net for basic functionality.

---

*Spec generated from Lisa interview session on 2026-01-20*
