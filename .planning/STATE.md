# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-14 — Milestone v1.0 Session Reliability started

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Two people can reliably complete a full partner session together
**Current focus:** Defining requirements for Session Reliability milestone

## Accumulated Context

### Key Learnings (from development history)
- `sessionKeys.state` cache MUST update `progress.myProgress.stage` manually after mutations
- `sessionKeys.state` is intentionally NOT invalidated after mutations (to avoid race conditions)
- `useConfirmFeelHeard` was missing stage update (previously fixed: hardcodes `Stage.PERSPECTIVE_STRETCH`)
- `computeShowEmpathyPanel` checks `myStage === PERSPECTIVE_STRETCH` — stale cache = no panel
- SSE events flow: `user_message` → `chunk` (many) → `metadata` → `text_complete` → `complete`
- `handleMetadata` in `useStreamingMessage.ts` updates cache directly
- Both cache and state paths should work for panel visibility (defense in depth)

### Known Fragile Areas
- Stage transition cache updates (documented fix for feel-heard, but pattern repeats)
- Reconciler race conditions (manual retry logic with 100ms delays)
- Reconciliation state machine complexity (HELD → AWAITING_SHARING → REFINING → REVEALED)
- No unit tests for: ai-orchestrator, context-assembler, reconciler, context-retriever

## Session Continuity

No active session.
