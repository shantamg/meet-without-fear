# Fire-and-Forget Messages with Ably Delivery

## Problem

When a user sends a chat message and leaves the session while waiting for the AI response (ghost dots showing), then quickly returns:
- The ghost dots disappear (mutation state is lost on remount)
- The AI response is never received (HTTP response was missed)
- The AI response exists in the database but the client never sees it

## Solution

Return immediately from the HTTP request after saving the user message. Process the AI response in the background and deliver it via Ably. This ensures:
- User gets immediate feedback (their message appears)
- AI response is delivered reliably via Ably subscription
- No complex pending state tracking needed

## Design

### Backend Changes

**1. Modify POST `/sessions/:sessionId/messages`**

Current flow:
```
Save user msg → Call AI → Save AI msg → Return both
```

New flow:
```
Save user msg → Return user msg → (background) Call AI → Save AI msg → Publish via Ably
```

**2. New Ably Events**

Published to session channel (`session:{sessionId}`):

`message.ai_response` - Successful AI response
```typescript
{
  message: MessageDTO,
  // Metadata for UI updates
  offerFeelHeardCheck?: boolean,
  invitationMessage?: string | null,
  offerReadyToShare?: boolean,
  proposedEmpathyStatement?: string | null,
}
```

`message.error` - AI processing failed
```typescript
{
  userMessageId: string,  // Which message failed
  error: string,          // User-friendly error message
  canRetry: boolean       // Whether retry is possible
}
```

### Frontend Changes

**1. `useSendMessage` mutation**
- Returns immediately with just the user message
- No longer waits for AI response
- Remove AI message from `onSuccess` cache update

**2. `useRealtime` hook**
- Add handler for `message.ai_response` event
- Add handler for `message.error` event

**3. On `message.ai_response`**
- Add AI message to React Query cache
- Process metadata (offerFeelHeardCheck, etc.) - same logic as current onSuccess
- Invalidate related queries (session state, progress)

**4. On `message.error`**
- Show error toast with message
- If `canRetry: true`, show retry button
- Retry sends the same message again

### Error Handling

If AI processing fails:
1. Backend catches error, publishes `message.error` event
2. Frontend shows toast: "Failed to get response. [Retry]"
3. User can tap Retry to resend their message
4. Original user message stays in chat (it was saved successfully)

### Migration Notes

- No database schema changes required
- Backward compatible: existing clients will still work (they just won't receive Ably updates until upgraded)
- The HTTP response structure changes (returns single message instead of pair)

## Files to Modify

### Backend
- `backend/src/services/chat-router/session-processor.ts` - Split into sync/async parts
- `backend/src/services/chat-router/handlers/conversation.ts` - Update response handling
- `backend/src/services/realtime.ts` - Add new event types
- `shared/src/dto/realtime.ts` - Add event type definitions

### Frontend
- `mobile/src/hooks/useMessages.ts` - Update useSendMessage response handling
- `mobile/src/hooks/useRealtime.ts` - Add message event handlers
- `mobile/src/hooks/useUnifiedSession.ts` - Process metadata from Ably events
