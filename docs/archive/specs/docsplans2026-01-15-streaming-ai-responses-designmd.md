# Streaming AI Responses Specification

**Feature:** Streaming AI responses with Tool Use metadata delivery
**Source:** docs/plans/2026-01-15-streaming-ai-responses-design.md
**Status:** Ready for Implementation
**Date:** 2026-01-15

---

## Overview

Replace JSON-wrapped AI responses with HTTP SSE streaming and Claude Tool Use for metadata delivery. Includes prompt improvements for the Reconciler (signal-to-noise filtering) and Stage 1/2 prompts (lateral probing guidance).

### Goals

- First token visible faster (streaming vs waiting for full completion)
- Cleaner architecture: Tool Use for metadata instead of JSON parsing
- Better AI behavior: Reconciler ignores process noise, AI expands context when users are brief

### Non-Goals

- Backward compatibility (no users yet)
- Feature flags (git revert if needed)
- Latency monitoring/alerting (take whatever improvement we get)

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Mid-stream errors | Keep partial text visible + add error badge ("incomplete - tap to retry") |
| Navigation mid-stream | Backend completes generation, saves full message. User sees it on return via GET refresh |
| Background task failures | Silent server-side logging only. Not critical path |
| Retry behavior | Immediate resend of same user message. No edit option |
| UI transitions | Match existing animation patterns for metadata-triggered UI |
| Analysis field | Persist to database (used by status dashboard) |
| Feature flag | None. Rollback via git revert |
| Testing strategy | Unit tests with mocked Bedrock streams + 1-2 real integration tests |
| Mobile SSE | Native fetch first. Add react-native-sse only if production Android has issues. Maintain Expo Go compatibility |
| Background LLM calls | Convert to Tool Use for consistency (Reconciler, summarization, etc.) |
| Lateral probing | Shared constant inserted into Stage 1 and Stage 2 prompts (not explicit "modes") |

---

## User Stories

### Phase 1: Backend Streaming Infrastructure

**US-1: Add Bedrock streaming function**
- Add `getSonnetStreamingResponse()` async generator to `backend/src/lib/bedrock.ts`
- Handles `ConverseStreamCommand` with text delta and tool input accumulation
- Yields `StreamEvent` objects: `{ type: 'text' | 'tool_use' | 'done', ... }`

*Acceptance Criteria:*
- [ ] Function accepts system prompt, messages, tools array, and config
- [ ] Text chunks yield immediately as they arrive
- [ ] Tool input chunks accumulate until `contentBlockStop`, then yield parsed JSON
- [ ] `done` event includes token usage
- [ ] Unit test with mocked Bedrock stream passes

**US-2: Define session state tool**
- Add `SESSION_STATE_TOOL` definition to `backend/src/services/stage-tools.ts` (new file)
- Tool schema includes: `offerFeelHeardCheck`, `offerReadyToShare`, `proposedEmpathyStatement`, `invitationMessage`, `analysis`

*Acceptance Criteria:*
- [ ] Tool schema is valid Bedrock tool format
- [ ] Description instructs Claude to only provide stage-relevant fields
- [ ] Exported and importable by orchestrator

**US-3: Create SSE streaming endpoint**
- Add `POST /sessions/:id/messages/stream` endpoint
- Set SSE headers, disable compression for this path
- Save user message, stream AI response, save AI message on complete
- Emit events: `user_message`, `chunk`, `complete`, `error`

*Acceptance Criteria:*
- [ ] SSE headers correct: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- [ ] Compression middleware skips this endpoint
- [ ] User message saved and emitted before streaming starts
- [ ] Text chunks emitted as they arrive
- [ ] `complete` event includes messageId and all metadata
- [ ] `error` event emitted on failure (mid-stream errors keep partial text)
- [ ] Backend completes generation even if client disconnects

**US-4: Disable compression for SSE**
- Update `backend/src/app.ts` compression middleware to skip `/messages/stream` paths

*Acceptance Criteria:*
- [ ] SSE endpoint returns uncompressed response
- [ ] Other endpoints still use compression

### Phase 2: Prompt Migration to Tool Use

**US-5: Update Stage 0 prompt (Invitation)**
- Remove JSON format instructions from `buildStage0InvitationPrompt`
- Add tool call instruction
- Update to use `update_session_state` tool for `invitationMessage` and `analysis`

*Acceptance Criteria:*
- [ ] No JSON format instructions in prompt
- [ ] Prompt instructs Claude to call `update_session_state` after responding
- [ ] Integration test: Stage 0 conversation produces tool call with invitationMessage

**US-6: Update Stage 1 prompt (Witnessing)**
- Remove JSON format instructions from `buildStage1Prompt`
- Add tool call instruction
- Update to use `update_session_state` tool for `offerFeelHeardCheck` and `analysis`
- Add Reconciler signal-to-noise filtering instruction
- Add lateral probing guidance constant

*Acceptance Criteria:*
- [ ] No JSON format instructions in prompt
- [ ] Prompt instructs Claude to call tool after responding
- [ ] Lateral probing guidance included (not framed as "modes")
- [ ] Integration test: Stage 1 conversation produces tool call

**US-7: Update Stage 2 prompt (Empathy Sharing)**
- Remove JSON format instructions from `buildStage2Prompt`
- Add tool call instruction
- Update to use `update_session_state` tool for `offerReadyToShare`, `proposedEmpathyStatement`, and `analysis`
- Add lateral probing guidance constant

*Acceptance Criteria:*
- [ ] No JSON format instructions in prompt
- [ ] Lateral probing guidance included
- [ ] Integration test: Stage 2 conversation produces tool call

**US-8: Update remaining stage prompts (Stages 3, 4, 5)**
- Convert all remaining stage prompts to Tool Use pattern
- Each stage may have different metadata fields

*Acceptance Criteria:*
- [ ] All stage prompts use Tool Use instead of JSON
- [ ] Each stage's relevant metadata captured via tool

**US-9: Update Reconciler prompts**
- Convert Reconciler to Tool Use pattern
- Add signal-to-noise filtering instruction to `buildReconcilerPrompt`
- Convert `getSonnetJson` helper to use streaming (for consistency, even though not user-facing)

*Acceptance Criteria:*
- [ ] Reconciler uses Tool Use for structured output
- [ ] Filtering instruction added: ignore AI-directed sentiment, UI confusion, process complaints
- [ ] Integration test: Reconciler ignores "you sound like a robot" type statements

**US-10: Update opening message generators**
- Convert all `buildXxxOpeningPrompt` functions to Tool Use

*Acceptance Criteria:*
- [ ] Opening prompts use Tool Use
- [ ] Response field correctly extracted from tool call

**US-11: Update Inner Work prompts**
- Convert Inner Work stage prompts to Tool Use

*Acceptance Criteria:*
- [ ] Inner Work prompts use Tool Use
- [ ] All metadata fields captured correctly

**US-12: Create lateral probing guidance constant**
- Create `LATERAL_PROBING_GUIDANCE` constant in `stage-prompts.ts`
- Content: guidance on expanding context (time/scope/stakes) when users give brief or resistant answers
- NOT framed as two explicit modes, just situational guidance

*Acceptance Criteria:*
- [ ] Constant defined with guidance text
- [ ] Inserted into Stage 1 and Stage 2 prompts
- [ ] Not inserted into Stage 0 (invitation is more structured)

### Phase 3: Backend Integration

**US-13: Update AI orchestrator for streaming**
- Modify `processMessage` to use streaming function when called from stream endpoint
- Remove JSON parsing logic (replaced by tool handling)
- Process tool call results for metadata

*Acceptance Criteria:*
- [ ] Orchestrator can operate in streaming mode
- [ ] Tool call results extracted correctly
- [ ] Metadata passed to downstream processing

**US-14: Update metadata persistence**
- `processStageMetadata` handles tool-delivered metadata
- `offerFeelHeardCheck` persists to stageProgress
- Analysis persists to database for status dashboard

*Acceptance Criteria:*
- [ ] stageProgress updated when offerFeelHeardCheck is true
- [ ] Analysis saved to appropriate database field
- [ ] All existing metadata flows preserved

**US-15: Remove old JSON parsing code**
- Delete `parseStructuredResponse` function
- Delete `stripAnalysisTags` function
- Delete or update `json-extractor.ts` if no longer needed
- Update/remove related tests

*Acceptance Criteria:*
- [ ] No dead code remaining
- [ ] Tests updated or removed as appropriate
- [ ] `npm run check` passes

### Phase 4: Mobile Streaming Client

**US-16: Add TextDecoder polyfill**
- Install `fast-text-encoding`
- Import in `mobile/index.js` before other imports

*Acceptance Criteria:*
- [ ] Package installed
- [ ] Import added at top of entry file
- [ ] App starts without TextDecoder errors on iOS and Android

**US-17: Create useStreamingMessage hook**
- New hook in `mobile/src/hooks/useStreamingMessage.ts`
- Handles SSE connection, parsing, cache updates
- Optimistic user message + placeholder AI message
- Chunk accumulation with immutable updates
- Error state with retry support

*Acceptance Criteria:*
- [ ] Hook exports `sendMessage` and `cancel` functions
- [ ] Optimistic updates appear immediately
- [ ] Text chunks append without flicker
- [ ] Temp IDs reconcile with real IDs from `user_message` event
- [ ] `complete` event finalizes message with real ID
- [ ] `error` event sets message status to 'error'
- [ ] AbortController cancels stream on unmount/navigation

**US-18: Add handleMetadata function**
- Handles metadata from `complete` event
- Updates session state cache for `showFeelHeardCheck`
- Updates empathy draft cache for `proposedEmpathyStatement`
- Updates invitation cache for `invitationMessage`

*Acceptance Criteria:*
- [ ] Feel-heard check UI appears when metadata.offerFeelHeardCheck is true
- [ ] Empathy draft populates when metadata.proposedEmpathyStatement provided
- [ ] Invitation message updates when metadata.invitationMessage provided

**US-19: Update ChatInterface for streaming**
- Use `useStreamingMessage` instead of existing message mutation
- Derive typing indicator from message status ('streaming' with empty content)
- Render streaming messages with blinking cursor
- Render error messages with "tap to retry" badge

*Acceptance Criteria:*
- [ ] Typing indicator shows until first text chunk
- [ ] Streaming message shows with blinking cursor
- [ ] Complete message shows normally
- [ ] Error message shows partial text + retry badge
- [ ] Retry immediately resends same user message

**US-20: Remove typewriter animation**
- Delete or disable `TypewriterText` component
- Replace `onTypewriterComplete` callbacks with status-based logic

*Acceptance Criteria:*
- [ ] No typewriter animation in message display
- [ ] UI triggers (feel-heard button, etc.) fire on status change to 'complete'

### Phase 5: Cleanup

**US-21: Remove old message endpoint**
- Delete non-streaming `POST /sessions/:id/messages` endpoint
- Update any remaining references

*Acceptance Criteria:*
- [ ] Old endpoint removed
- [ ] No 404 errors in app (all calls use stream endpoint)

**US-22: Update tests**
- Update backend integration tests for streaming
- Update mobile tests if applicable
- Add new tests for streaming behavior

*Acceptance Criteria:*
- [ ] `npm run test` passes in all workspaces
- [ ] `npm run check` passes
- [ ] Key streaming behaviors covered

---

## Files to Modify

### Backend - New Files
- `backend/src/services/stage-tools.ts` - Tool definitions

### Backend - Modified Files
- `backend/src/lib/bedrock.ts` - Add streaming function
- `backend/src/app.ts` - Compression middleware update
- `backend/src/controllers/messages.ts` - SSE endpoint, remove old endpoint
- `backend/src/services/ai-orchestrator.ts` - Streaming mode, remove JSON parsing
- `backend/src/services/stage-prompts.ts` - All prompt updates, lateral probing constant
- `backend/src/services/reconciler.ts` - Tool Use conversion, filtering instruction
- `backend/src/utils/json-extractor.ts` - Potentially remove if unused

### Mobile - Modified Files
- `mobile/index.js` - Polyfill import
- `mobile/src/hooks/useStreamingMessage.ts` - New streaming hook
- `mobile/src/hooks/queryKeys.ts` - Any new query keys if needed
- `mobile/src/components/ChatInterface.tsx` - Use streaming hook, update rendering

---

## Verification

After each user story, run:
```bash
npm run check   # Type checking
npm run test    # Automated tests
```

All verification is automated. No documented manual test flows required.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Android buffers SSE response | Start with native fetch; add react-native-sse if needed in production |
| Tool Use changes AI behavior | Thorough integration tests for each stage |
| Streaming adds complexity | Keep old code until streaming is validated, then delete |
| Expo Go compatibility | Avoid native modules; verified react-native-sse is pure JS |

---

## Progress Tracking

Track implementation progress in: `docs/specs/streaming-ai-responses-progress.md`

---

## Out of Scope

- Feature flags for gradual rollout
- Latency monitoring/alerting
- Ably fallback for streaming
- Edit-before-retry functionality
