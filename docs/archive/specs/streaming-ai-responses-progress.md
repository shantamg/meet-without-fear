# Streaming AI Responses - Progress Tracker

**Spec:** [docsplans2026-01-15-streaming-ai-responses-designmd.md](./docsplans2026-01-15-streaming-ai-responses-designmd.md)
**Started:** 2026-01-15

---

## Phase 1: Backend Streaming Infrastructure

- [x] **US-1:** Add Bedrock streaming function
- [x] **US-2:** Define session state tool
- [x] **US-3:** Create SSE streaming endpoint
- [x] **US-4:** Disable compression for SSE

## Phase 2: Prompt Migration to Tool Use

- [x] **US-5:** Update Stage 0 prompt (Invitation)
- [x] **US-6:** Update Stage 1 prompt (Witnessing)
- [x] **US-7:** Update Stage 2 prompt (Empathy Sharing)
- [x] **US-8:** Update remaining stage prompts (Stages 3, 4, 5)
- [x] **US-9:** Update Reconciler prompts
- [x] **US-10:** Update opening message generators
- [x] **US-11:** Update Inner Work prompts
- [x] **US-12:** Create lateral probing guidance constant

## Phase 3: Backend Integration

- [x] **US-13:** Update AI orchestrator for streaming
- [x] **US-14:** Update metadata persistence
- [ ] **US-15:** Remove old JSON parsing code (deferred to Phase 5)

## Phase 4: Mobile Streaming Client

- [x] **US-16:** Add TextDecoder polyfill
- [x] **US-17:** Create useStreamingMessage hook
- [x] **US-18:** Add handleMetadata function (integrated into useStreamingMessage)
- [x] **US-19:** Update ChatInterface for streaming
- [x] **US-20:** Remove typewriter animation (streaming bypasses typewriter; kept for non-streaming messages)

## Phase 5: Cleanup

- [ ] **US-21:** Remove old message endpoint
- [ ] **US-22:** Update tests

---

## Notes

### 2026-01-15: Bug Fixes

Fixed message doubling issues in streaming implementation:

1. **User message doubling**: Added `replaceMessageInCache` function to swap optimistic user message (`optimistic-user-xxx`) with real server message when `user_message` SSE event arrives.

2. **AI response doubling**:
   - Added `streaming-` prefix check to ChatInterface to skip typewriter animation for streaming messages (SSE chunks display text directly)
   - Kept streaming message ID instead of swapping to real ID to avoid React remount and duplicate animation
   - Added query invalidation after streaming completes to refetch with real IDs

3. **Typewriter vs Streaming**: ChatInterface now correctly identifies `streaming-` prefixed messages and skips typewriter animation since the text is already being displayed via SSE chunks.
