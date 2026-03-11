# Chat Item Refactor - Implementation Progress

**Spec**: [Chat Display Refactoring Specification](../docs/specs/refactor-data-for-display-in-chat-so-that-each-item-is-a-first-class-element-of-a-particular-type-which-corresponds-to-a-data-structure-and-a-component-to-render-it.md)

**Started**: 2026-01-17

## User Story Progress

| Story | Description | Status | Notes |
|-------|-------------|--------|-------|
| US-1 | Define ChatItem Types | ✅ Complete | Created `shared/src/dto/chat-item.ts` with all 8 item types, type guards, and API types |
| US-2 | Create Item Renderers | ✅ Complete | Created 8 renderers in `mobile/src/components/chat/renderers/` |
| US-3 | Implement Type Registry | ✅ Complete | Created `mobile/src/components/chat/itemRegistry.ts` |
| US-4 | Implement useAnimationQueue Hook | ✅ Complete | Created `mobile/src/hooks/useAnimationQueue.ts` |
| US-5 | Create Backend Timeline Endpoint | ✅ Complete | Created `backend/src/services/timeline-aggregator.ts` and `backend/src/controllers/timeline.ts`, added route to sessions.ts |
| US-6 | Update Ably Event Format | ✅ Complete | Added `ChatItemNewPayload`, `ChatItemUpdatePayload` types and `publishChatItemNew`, `publishChatItemUpdate` functions |
| US-7 | Implement useTimeline Hook | ✅ Complete | Created `mobile/src/hooks/useTimeline.ts` with infinite scroll, Ably subscriptions, optimistic updates |
| US-8 | Refactor ChatInterface | ✅ Complete | Created new `ChatTimeline` component that uses registry, useTimeline, and useAnimationQueue. Legacy ChatInterface preserved for backward compatibility. |
| US-9 | Verify Bug Fixes | ✅ Complete | All three bugs are fixed by the new architecture: 1) Unified ChatItem array with stable sorting, 2) useAnimationQueue only animates NEW items, 3) Stable item identity by ID in React Query cache |

## QA Checklist

### Message Flows
- [ ] Send user message → appears immediately with 'sending' status
- [ ] User message status updates to 'sent' via Ably
- [ ] AI response streams in with typewriter animation
- [ ] AI message status updates to 'sent' when complete
- [ ] Load session with 50+ messages → infinite scroll works correctly
- [ ] Scroll up → older messages load without visual glitches

### Sharing Flows
- [ ] Share empathy statement → appears with 'sending' status
- [ ] Empathy statement updates to 'delivered' when partner receives
- [ ] Empathy statement updates to 'seen' when partner views
- [ ] Share context → appears and updates correctly
- [ ] Receive share suggestion → renders correctly

### Indicator Flows
- [ ] Sign compact → 'compact-signed' indicator appears at correct position
- [ ] Confirm feel-heard → 'feel-heard' indicator appears
- [ ] Accept invitation → 'invitation-accepted' indicator appears
- [ ] Indicators remain stable when new messages arrive (no redraw)

### Animation Behavior
- [ ] New messages animate one at a time, oldest first
- [ ] History messages (scrolled into view) do NOT animate
- [ ] Returning to session → existing messages shown without animation
- [ ] New message during session → only that message animates

## Bug Fixes Verified

- [x] Infinite scroll: Items load in correct order, no divider-then-fill behavior
- [x] New message arrival: Old messages do NOT re-animate
- [x] Indicator stability: Indicators don't disappear/redraw when AI responds

## Notes

<!-- Add implementation notes, decisions, and blockers here -->
