# Semantic Router Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid JSON output format with a streaming-compatible semantic tag format (`<thinking>`, `<draft>`, `<dispatch>`) that is faster (no JSON escaping) and more robust.

**Architecture:** The model outputs semantic blocks in a strict order: `<thinking>` first (hidden), optional `<draft>` for drafts, optional `<dispatch>` for off-ramping, then user-facing text. The orchestrator parses these tags via regex instead of JSON extraction, and handles dispatch tags by hijacking the response before returning to the user.

**Tech Stack:** TypeScript, existing bedrock.ts client, regex-based tag parsing

---

## Task 1: Create the Micro-Tag Parser

**Files:**
- Create: `backend/src/utils/micro-tag-parser.ts`
- Test: `backend/src/utils/__tests__/micro-tag-parser.test.ts`

**Step 1: Write the failing tests**

```typescript
// backend/src/utils/__tests__/micro-tag-parser.test.ts
import { parseMicroTagResponse, ParsedMicroTagResponse } from '../micro-tag-parser';

describe('micro-tag-parser', () => {
  describe('parseMicroTagResponse', () => {
    it('extracts thinking block content', () => {
      const raw = `<thinking>
Mode:Witness | Intensity:8 | FeelHeardCheck:Y | Strategy:Validate
</thinking>

I hear you. That sounds really difficult.`;

      const result = parseMicroTagResponse(raw);

      expect(result.thinking).toContain('Mode:Witness');
      expect(result.thinking).toContain('FeelHeardCheck:Y');
    });

    it('extracts clean response text without tags', () => {
      const raw = `<thinking>
Mode:Witness | FeelHeardCheck:N
</thinking>

I hear you. That sounds really difficult.`;

      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('I hear you. That sounds really difficult.');
      expect(result.response).not.toContain('<thinking>');
    });

    it('extracts FeelHeardCheck:Y as true', () => {
      const raw = `<thinking>FeelHeardCheck:Y</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(true);
    });

    it('extracts FeelHeardCheck:N as false', () => {
      const raw = `<thinking>FeelHeardCheck:N</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(false);
    });

    it('extracts ReadyShare:Y as true', () => {
      const raw = `<thinking>ReadyShare:Y</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerReadyToShare).toBe(true);
    });

    it('extracts draft block as invitationMessage', () => {
      const raw = `<thinking>Mode:Invitation</thinking>

<draft>
I've been thinking about us and would love to have a real conversation. Join me?
</draft>

Here's a draft invitation for you to review.`;

      const result = parseMicroTagResponse(raw);

      expect(result.draft).toContain("I've been thinking about us");
      expect(result.response).toBe("Here's a draft invitation for you to review.");
      expect(result.response).not.toContain('<draft>');
    });

    it('extracts dispatch tag', () => {
      const raw = `<thinking>User asking about process</thinking>

<dispatch>EXPLAIN_PROCESS</dispatch>

Let me explain how this works.`;

      const result = parseMicroTagResponse(raw);

      expect(result.dispatchTag).toBe('EXPLAIN_PROCESS');
    });

    it('handles response with no tags gracefully', () => {
      const raw = 'Just a plain response with no tags.';
      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('Just a plain response with no tags.');
      expect(result.thinking).toBe('');
      expect(result.draft).toBeNull();
      expect(result.dispatchTag).toBeNull();
    });

    it('handles malformed thinking tags', () => {
      const raw = `<thinking>Incomplete

Response without closing tag.`;

      const result = parseMicroTagResponse(raw);
      // Should return raw text as response when tags are malformed
      expect(result.response).toBeTruthy();
    });

    it('strips multiple tag types from response', () => {
      const raw = `<thinking>Analysis here</thinking>

<draft>Draft content</draft>

<dispatch>SOME_TAG</dispatch>

The actual response.`;

      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('The actual response.');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- micro-tag-parser.test.ts`
Expected: FAIL with "Cannot find module '../micro-tag-parser'"

**Step 3: Write minimal implementation**

```typescript
// backend/src/utils/micro-tag-parser.ts

/**
 * Micro-Tag Parser
 *
 * Parses the semantic tag format used by the AI response:
 * - <thinking>...</thinking> - Hidden analysis with flags
 * - <draft>...</draft> - Optional draft content (invitation/empathy)
 * - <dispatch>...</dispatch> - Optional off-ramp signal
 * - Everything else is the user-facing response
 */

export interface ParsedMicroTagResponse {
  /** The user-facing response text (all tags stripped) */
  response: string;
  /** The raw thinking block content (for logging) */
  thinking: string;
  /** Optional draft content (for invitation/empathy statements) */
  draft: string | null;
  /** Optional dispatch tag for off-ramping */
  dispatchTag: string | null;
  /** Extracted from thinking: FeelHeardCheck:Y */
  offerFeelHeardCheck: boolean;
  /** Extracted from thinking: ReadyShare:Y */
  offerReadyToShare: boolean;
}

/**
 * Parse the micro-tag response format.
 * Extracts semantic blocks and flags from the raw AI response.
 */
export function parseMicroTagResponse(rawResponse: string): ParsedMicroTagResponse {
  // 1. Extract blocks using regex
  const thinkingMatch = rawResponse.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const draftMatch = rawResponse.match(/<draft>([\s\S]*?)<\/draft>/i);
  const dispatchMatch = rawResponse.match(/<dispatch>([\s\S]*?)<\/dispatch>/i);

  const thinking = thinkingMatch?.[1]?.trim() ?? '';
  const draft = draftMatch?.[1]?.trim() ?? null;
  const dispatchTag = dispatchMatch?.[1]?.trim() ?? null;

  // 2. Clean response text - remove all tags
  let responseText = rawResponse
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
    .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '')
    .trim();

  // 3. Extract flags from thinking string (no JSON needed!)
  const offerFeelHeardCheck = /FeelHeardCheck:\s*Y/i.test(thinking);
  const offerReadyToShare = /ReadyShare:\s*Y/i.test(thinking);

  return {
    response: responseText,
    thinking,
    draft,
    dispatchTag,
    offerFeelHeardCheck,
    offerReadyToShare,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- micro-tag-parser.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add backend/src/utils/micro-tag-parser.ts backend/src/utils/__tests__/micro-tag-parser.test.ts
git commit -m "feat: add micro-tag parser for semantic response format

Replaces JSON parsing with regex-based tag extraction.
Supports <thinking>, <draft>, <dispatch> blocks and flag extraction."
```

---

## Task 2: Create the Dispatch Handler

**Files:**
- Create: `backend/src/services/dispatch-handler.ts`
- Test: `backend/src/services/__tests__/dispatch-handler.test.ts`

**Step 1: Write the failing tests**

```typescript
// backend/src/services/__tests__/dispatch-handler.test.ts
import { handleDispatch, DispatchTag } from '../dispatch-handler';

describe('dispatch-handler', () => {
  describe('handleDispatch', () => {
    it('returns process explanation for EXPLAIN_PROCESS', async () => {
      const result = await handleDispatch('EXPLAIN_PROCESS');

      expect(result).toContain('stages');
      expect(result).toContain('Witness');
      expect(result).toContain('Perspective');
    });

    it('returns memory guidance for HANDLE_MEMORY_REQUEST', async () => {
      const result = await handleDispatch('HANDLE_MEMORY_REQUEST');

      expect(result).toContain('Profile');
      expect(result).toContain('Things to Remember');
    });

    it('returns generic message for unknown dispatch tag', async () => {
      const result = await handleDispatch('UNKNOWN_TAG');

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });

    it('handles null/empty dispatch tag gracefully', async () => {
      const result = await handleDispatch('');
      expect(result).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- dispatch-handler.test.ts`
Expected: FAIL with "Cannot find module '../dispatch-handler'"

**Step 3: Write minimal implementation**

```typescript
// backend/src/services/dispatch-handler.ts

/**
 * Dispatch Handler
 *
 * Handles off-ramp dispatch tags from the AI.
 * When the AI outputs <dispatch>TAG</dispatch>, this handler
 * hijacks the response to provide consistent, controlled answers
 * for specific scenarios.
 */

export type DispatchTag =
  | 'EXPLAIN_PROCESS'
  | 'HANDLE_MEMORY_REQUEST'
  | string; // Allow unknown tags

/**
 * Handle a dispatch tag and return the appropriate response.
 * This hijacks the AI response for controlled off-ramp scenarios.
 */
export async function handleDispatch(dispatchTag: DispatchTag): Promise<string> {
  console.log(`[Dispatch Handler] Triggered: ${dispatchTag}`);

  switch (dispatchTag) {
    case 'EXPLAIN_PROCESS':
      return `Meet Without Fear guides you through four stages:

**1. Witness Stage** - Each person shares their experience and feels fully heard. No problem-solving yet, just deep listening.

**2. Perspective Stretch** - You'll try to understand what your partner might be feeling. This builds empathy without requiring agreement.

**3. Need Mapping** - Together, you'll identify what you each truly need - not positions, but underlying needs like safety, respect, or connection.

**4. Strategic Repair** - Finally, you'll design small experiments to address both needs. Low-stakes trials you can adjust.

You move through these at your own pace. There's no rush.`;

    case 'HANDLE_MEMORY_REQUEST':
      return `I'd love to help you remember important things! You can add memories in your Profile under "Things to Remember." That way I'll always have them available when we talk.

Is there something specific you'd like to note down?`;

    default:
      console.warn(`[Dispatch Handler] Unknown tag: ${dispatchTag}`);
      return "I'm here to help. What would you like to explore?";
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- dispatch-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/dispatch-handler.ts backend/src/services/__tests__/dispatch-handler.test.ts
git commit -m "feat: add dispatch handler for AI off-ramp scenarios

Provides consistent responses for EXPLAIN_PROCESS, HANDLE_MEMORY_REQUEST.
Extensible for future dispatch tags."
```

---

## Task 3: Create Response Protocol Builder

**Files:**
- Modify: `backend/src/services/stage-prompts.ts`
- Test: `backend/src/services/__tests__/stage-prompts.test.ts` (add new tests)

**Step 1: Write the failing tests**

Add these tests to `backend/src/services/__tests__/stage-prompts.test.ts`:

```typescript
// Add to existing stage-prompts.test.ts

describe('Response Protocol (Semantic Router)', () => {
  describe('buildResponseProtocol', () => {
    it('Stage 1 protocol includes FeelHeardCheck flag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).toContain('<thinking>');
      expect(prompt).toContain('FeelHeardCheck:Y');
      expect(prompt).toContain('FeelHeardCheck:N');
    });

    it('Stage 2 protocol includes ReadyShare flag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(2, context);

      expect(prompt).toContain('<thinking>');
      expect(prompt).toContain('ReadyShare:Y');
      expect(prompt).toContain('ReadyShare:N');
    });

    it('Stage 0 protocol includes draft tag instruction', () => {
      const context = createContext();
      const options = { isInvitationPhase: true };
      const prompt = buildStagePrompt(0, context, options);

      expect(prompt).toContain('<draft>');
    });

    it('protocol includes dispatch tag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).toContain('<dispatch>');
      expect(prompt).toContain('EXPLAIN_PROCESS');
    });

    it('does NOT include old JSON format instructions', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      // Should not have JSON output instructions
      expect(prompt).not.toContain('"response":');
      expect(prompt).not.toContain('JSON object');
    });

    it('does NOT include tool call instructions', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).not.toContain('update_session_state');
      expect(prompt).not.toContain('THIRD: Call');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- stage-prompts.test.ts`
Expected: FAIL (current prompts use JSON/tool format)

**Step 3: Create the response protocol builder**

Add to `backend/src/services/stage-prompts.ts` near the top (replacing TOOL_USE constants):

```typescript
// ============================================================================
// Response Protocol (Semantic Router Format)
// ============================================================================

/**
 * Build the response protocol instructions for a given stage.
 * Uses semantic tags instead of JSON for faster streaming and robustness.
 */
function buildResponseProtocol(stage: number, options?: {
  includesDraft?: boolean;
  draftPurpose?: 'invitation' | 'empathy';
}): string {
  const baseProtocol = `
RESPONSE FORMAT (STRICT OUTPUT ORDER):

1. FIRST: Start IMMEDIATELY with a <thinking> block:
   <thinking>
   Mode: [Your current mode]
   Intensity: [1-10 emotional intensity you observe]
   ${stage === 1 ? 'FeelHeardCheck: [Y if ready to offer feel-heard check, N otherwise]' : ''}
   ${stage === 2 ? 'ReadyShare: [Y if ready to share empathy statement, N otherwise]' : ''}
   Strategy: [Your response approach]
   </thinking>

2. SECOND: ${options?.includesDraft ? `If you have a ${options.draftPurpose} draft ready, output it in a <draft> block:
   <draft>
   Your ${options.draftPurpose} message here
   </draft>

3. THIRD: ` : ''}Write your conversational response to the user.
   - This is what the user sees - warm, natural dialogue
   - Do NOT include any tags here - just your response

OFF-RAMP (when to use <dispatch>):
If the user asks "how does this work?" or wants process explanation:
<dispatch>EXPLAIN_PROCESS</dispatch>

If the user asks you to "remember" something:
<dispatch>HANDLE_MEMORY_REQUEST</dispatch>

When you use <dispatch>, you can skip the user response - the system handles it.

CRITICAL RULES:
1. You MUST start with <thinking>...</thinking> IMMEDIATELY
2. The thinking block is hidden from users
3. Your response text should be pure conversation - no tags, no internal thoughts
4. Never show "FeelHeardCheck" or "ReadyShare" to the user`;

  return baseProtocol;
}
```

**Step 4: Update buildStage1Prompt to use new protocol**

In `buildStage1Prompt`, replace the `${TOOL_USE_STAGE_1}` reference with:

```typescript
${buildResponseProtocol(1)}
```

**Step 5: Update buildStage2Prompt to use new protocol**

In `buildStage2Prompt`, replace `${TOOL_USE_STAGE_2}` with:

```typescript
${buildResponseProtocol(2, { includesDraft: true, draftPurpose: 'empathy' })}
```

**Step 6: Update buildStage0InvitationPrompt**

Replace `${TOOL_USE_STAGE_0}` with:

```typescript
${buildResponseProtocol(0, { includesDraft: true, draftPurpose: 'invitation' })}
```

**Step 7: Update remaining stages (3, 4, Inner Work)**

Replace all `TOOL_USE_LATER_STAGES`, `TOOL_USE_INNER_WORK`, `TOOL_USE_OPENING_MESSAGE` references with appropriate `buildResponseProtocol()` calls.

**Step 8: Delete the old TOOL_USE constants**

Remove lines 25-187 (all TOOL_USE_* constants).

**Step 9: Run tests**

Run: `cd backend && npm test -- stage-prompts.test.ts`
Expected: PASS

**Step 10: Commit**

```bash
git add backend/src/services/stage-prompts.ts backend/src/services/__tests__/stage-prompts.test.ts
git commit -m "refactor: replace TOOL_USE constants with buildResponseProtocol

Implements semantic tag format (<thinking>, <draft>, <dispatch>).
Removes JSON output format and tool call instructions.
Adds dispatch off-ramp for EXPLAIN_PROCESS and HANDLE_MEMORY_REQUEST."
```

---

## Task 4: Update AI Orchestrator to Use Micro-Tag Parser

**Files:**
- Modify: `backend/src/services/ai-orchestrator.ts`
- Test: Manually verify via API calls (integration test)

**Step 1: Import new dependencies**

At the top of `ai-orchestrator.ts`:

```typescript
import { parseMicroTagResponse } from '../utils/micro-tag-parser';
import { handleDispatch } from './dispatch-handler';
```

**Step 2: Update the main orchestration flow**

In `orchestrateResponse()`, replace the response parsing block (around lines 370-398) with:

```typescript
    if (sonnetResponse) {
      // Parse the semantic tag response
      const parsed = parseMicroTagResponse(sonnetResponse);

      // Check for dispatch (off-ramp)
      if (parsed.dispatchTag) {
        console.log(`[AI Orchestrator] Dispatch triggered: ${parsed.dispatchTag}`);
        const dispatchedResponse = await handleDispatch(parsed.dispatchTag);

        return {
          response: dispatchedResponse,
          memoryIntent,
          contextBundle,
          retrievalPlan,
          retrievedContext,
          usedMock: false,
          offerFeelHeardCheck: false,
          offerReadyToShare: false,
          invitationMessage: null,
          proposedEmpathyStatement: null,
          analysis: `DISPATCHED: ${parsed.dispatchTag} | Original: ${parsed.thinking}`,
        };
      }

      // Normal response flow
      response = parsed.response;
      offerFeelHeardCheck = parsed.offerFeelHeardCheck;
      offerReadyToShare = parsed.offerReadyToShare;

      // Draft is used for both invitation (Stage 0) and empathy (Stage 2)
      if (context.isInvitationPhase || context.stage === 0) {
        invitationMessage = parsed.draft;
      } else if (context.stage === 2) {
        proposedEmpathyStatement = parsed.draft;
      }

      analysis = parsed.thinking;

      // Debug logging
      if (context.stage === 2) {
        console.log(`[AI Orchestrator] Stage 2 - offerReadyToShare: ${offerReadyToShare}, empathyDraft: ${proposedEmpathyStatement ? 'present' : 'null'}`);
      }
    } else {
      response = getMockResponse(context);
      usedMock = true;
    }
```

**Step 3: Remove old parseStructuredResponse calls**

Delete or comment out:
- `parseStructuredResponse()` function (lines 493-526)
- `extractResponseFallback()` function (lines 532-573)
- The `extractJsonFromResponse` import

**Step 4: Update the expectsStructuredOutput logic**

Remove the `expectsStructuredOutput` variable - it's no longer needed since we always use tag parsing.

**Step 5: Run type check**

Run: `cd backend && npm run check`
Expected: No type errors

**Step 6: Commit**

```bash
git add backend/src/services/ai-orchestrator.ts
git commit -m "refactor: integrate micro-tag parser and dispatch handler

Replaces JSON extraction with semantic tag parsing.
Adds dispatch handling for off-ramp scenarios.
Removes parseStructuredResponse and extractResponseFallback."
```

---

## Task 5: Verification Testing

**Step 1: Create integration test scenarios**

Create: `backend/src/services/__tests__/semantic-router-integration.test.ts`

```typescript
import { parseMicroTagResponse } from '../../utils/micro-tag-parser';
import { handleDispatch } from '../dispatch-handler';

describe('Semantic Router Integration', () => {
  describe('Stage 1 Flow', () => {
    it('correctly parses a typical Stage 1 response', () => {
      const simulatedResponse = `<thinking>
Mode: Witness
Intensity: 7
FeelHeardCheck: N
Strategy: Reflect back the frustration
</thinking>

I hear how frustrated you're feeling right now. It sounds like this has been building up for a while. What feels most important for me to understand?`;

      const parsed = parseMicroTagResponse(simulatedResponse);

      expect(parsed.offerFeelHeardCheck).toBe(false);
      expect(parsed.response).toContain('frustrated');
      expect(parsed.response).not.toContain('Mode:');
    });

    it('correctly detects feel-heard readiness', () => {
      const simulatedResponse = `<thinking>
Mode: Witness
Intensity: 4
FeelHeardCheck: Y
Strategy: User has named core pain, affirmed reflection
</thinking>

Yes, exactly - that feeling of being invisible in your own home. I really hear that. It sounds like what you need most is to be seen.`;

      const parsed = parseMicroTagResponse(simulatedResponse);

      expect(parsed.offerFeelHeardCheck).toBe(true);
    });
  });

  describe('Stage 2 Flow', () => {
    it('extracts empathy draft from Stage 2 response', () => {
      const simulatedResponse = `<thinking>
Mode: Bridging
ReadyShare: Y
Strategy: User has developed genuine empathy, ready to draft
</thinking>

<draft>
I think you might be feeling overwhelmed by all the demands on your time, and scared that if you say no, I'll think you don't care about us.
</draft>

That's a really thoughtful attempt to step into their shoes. Here's how I'd summarize what you're sensing.`;

      const parsed = parseMicroTagResponse(simulatedResponse);

      expect(parsed.offerReadyToShare).toBe(true);
      expect(parsed.draft).toContain('overwhelmed');
      expect(parsed.response).not.toContain('overwhelmed');
    });
  });

  describe('Dispatch Flow', () => {
    it('handles EXPLAIN_PROCESS dispatch', async () => {
      const simulatedResponse = `<thinking>
User asking how this works
</thinking>

<dispatch>EXPLAIN_PROCESS</dispatch>`;

      const parsed = parseMicroTagResponse(simulatedResponse);

      expect(parsed.dispatchTag).toBe('EXPLAIN_PROCESS');

      const dispatchedResponse = await handleDispatch(parsed.dispatchTag!);
      expect(dispatchedResponse).toContain('Witness Stage');
    });
  });

  describe('Privacy - Tags Never Leak', () => {
    it('thinking tags are fully stripped', () => {
      const simulatedResponse = `<thinking>
Mode: Witness
FeelHeardCheck: Y
Secret analysis here
</thinking>

Your response text.`;

      const parsed = parseMicroTagResponse(simulatedResponse);

      expect(parsed.response).not.toContain('<thinking>');
      expect(parsed.response).not.toContain('Mode:');
      expect(parsed.response).not.toContain('Secret analysis');
      expect(parsed.response).toBe('Your response text.');
    });
  });
});
```

**Step 2: Run integration tests**

Run: `cd backend && npm test -- semantic-router-integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/services/__tests__/semantic-router-integration.test.ts
git commit -m "test: add semantic router integration tests

Verifies Stage 1, Stage 2, dispatch flow, and privacy (tag stripping)."
```

---

## Task 6: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `cd backend && npm run check`
Expected: No type errors

**Step 3: Manual verification (optional)**

Start the backend and test with actual AI responses:
1. Send a message in Stage 1, verify `offerFeelHeardCheck` triggers correctly
2. Send "how does this work?", verify dispatch handling returns process explanation
3. Verify no `<thinking>` tags appear in user-visible responses

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: semantic router implementation complete

- Micro-tag parser replaces JSON extraction
- Dispatch handler for controlled off-ramps
- Response protocol builder for semantic tags
- All tests passing"
```

---

## Summary: Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/src/utils/micro-tag-parser.ts` | Create | Tag extraction (thinking, draft, dispatch) |
| `backend/src/utils/__tests__/micro-tag-parser.test.ts` | Create | Parser unit tests |
| `backend/src/services/dispatch-handler.ts` | Create | Off-ramp response handler |
| `backend/src/services/__tests__/dispatch-handler.test.ts` | Create | Handler unit tests |
| `backend/src/services/stage-prompts.ts` | Modify | Replace TOOL_USE with buildResponseProtocol |
| `backend/src/services/__tests__/stage-prompts.test.ts` | Modify | Add protocol tests |
| `backend/src/services/ai-orchestrator.ts` | Modify | Use micro-tag parser, add dispatch flow |
| `backend/src/services/__tests__/semantic-router-integration.test.ts` | Create | E2E verification tests |

---

## Rollback Plan

If issues arise in production:
1. The old `parseStructuredResponse` can be restored from git history
2. Revert the prompt changes in `stage-prompts.ts` to use TOOL_USE constants
3. Remove the dispatch handler integration in orchestrator

The changes are isolated to parsing/prompt layers, so rollback is straightforward.
