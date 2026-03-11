# Spec: Remove "New" Separator Line from Chat

## Summary
Remove the "New" separator line that appears in chat sessions to mark new messages since the user's last visit. Keep the `lastSeenChatItemId` infrastructure since it's used for unread message indicators on the session list and home screen.

## Scope
- **In scope**: Remove the "New messages" separator UI from ChatInterface.tsx
- **Out of scope**: `lastSeenChatItemId` prop and tracking (still needed for unread indicators elsewhere)

## User Stories

### US-1: Remove New Messages Separator
**As a** user
**I want** the "New" line removed from chat
**So that** the chat UI is cleaner without this interruption

**Acceptance Criteria:**
- The "New" text and separator lines no longer appear in any chat
- No runtime errors when chat loads
- `npm run check` passes
- `npm run test` passes

## Technical Implementation

### Files to Modify
1. `mobile/src/components/ChatInterface.tsx`

### Changes Required
1. Remove the `NewMessagesSeparatorItem` type (line 47-50)
2. Remove `NewMessagesSeparatorItem` from `ChatListItem` union type (line 52)
3. Remove the `isNewMessagesSeparator` type guard function (lines 62-64)
4. Remove the separator injection logic in `combinedItems` useMemo - the entire "3. Inject New messages separator" block (lines 201-219)
5. Remove the separator rendering branch in `renderItem` function (lines 419-427)
6. Remove the separator check in the for-loop that skips non-message items (line 387)
7. Remove associated styles: `newMessagesSeparator`, `newMessagesSeparatorLine`, `newMessagesSeparatorText`
8. Keep `lastSeenChatItemId` prop unchanged (used for unread indicators on session list)

## Verification
```bash
npm run check   # Type checking passes
npm run test    # All tests pass (no tests specifically for this separator)
```
