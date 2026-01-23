# Sharing Status Screen - Implementation Plan

## Summary

Create a dedicated "Sharing Status" screen that consolidates all empathy reconciliation activity, removing it from the main chat flow. This keeps the chat focused on the 1:1 conversation with your AI while giving sharing/reconciliation its own clear, accessible space.

## Architecture

```
Session Screen (chat with AI)
    │
    ├── SessionChatHeader
    │       └── [New: Sharing Status Button with Badge]
    │               • Badge shows pending action count
    │               • Navigates to sharing-status screen
    │
    └── Chat Timeline
            • Messages between you and AI only
            • Collapsed indicator for shared content
            • Simpler state management

Sharing Status Screen (new)
    │
    ├── My Empathy Attempt Card
    │       • Status: HELD → ANALYZING → READY → REVEALED
    │       • Content preview
    │
    ├── Partner's Empathy Attempt Card
    │       • Their status and content (when revealed)
    │
    ├── Reconciler Activity Indicator
    │       • Shows when analyzing
    │
    ├── Pending Actions Section
    │       • Share suggestion card (accept/refine/decline)
    │       • Refinement prompts
    │
    └── Shared Context History
            • Timeline of what's been shared
```

## Design Decisions

1. **Visibility**: Sharing status button visible **only in Stage 2+** (PERSPECTIVE_STRETCH and beyond)
2. **Chat simplification**: Show **collapsed indicator** ("Context shared - tap to view") that links to the status screen

## Implementation Steps

### Step 1: Add Route and Screen Shell

**Files to create:**
- `mobile/app/(auth)/session/[id]/sharing-status.tsx` - Route handler
- `mobile/src/screens/SharingStatusScreen.tsx` - Main screen component

**Changes to:**
- `mobile/app/(auth)/session/[id]/_layout.tsx` - Add the new screen to Stack

The existing layout uses a Stack with `headerShown: false`, so we add:
```tsx
<Stack.Screen name="sharing-status" options={{ title: 'Sharing Status' }} />
```

### Step 2: Create Composite Data Hook

**File to create:**
- `mobile/src/hooks/useSharingStatus.ts`

Composes existing hooks:
- `useEmpathyStatus(sessionId)` - my/partner attempt status
- `useShareOffer(sessionId)` - pending share suggestion
- `usePartnerEmpathy(sessionId)` - partner's empathy content

Returns:
- `myAttempt`, `partnerAttempt` - empathy attempt data
- `isAnalyzing`, `isAwaitingSharing` - reconciler state
- `shareOffer`, `hasSuggestion` - pending suggestions
- `pendingActionsCount` - for badge (derived count)
- `sharedContextHistory` - list of shared items

### Step 3: Add Header Button with Badge

**File to modify:**
- `mobile/src/components/SessionChatHeader.tsx`

Add new props:
```tsx
showSharingStatusButton?: boolean;
sharingBadgeCount?: number;
onSharingStatusPress?: () => void;
```

Add button in right section (next to Inner Thoughts button):
- Icon: `Users` or `Share2` from lucide-react-native
- Badge overlay when `sharingBadgeCount > 0`
- Only visible when `showSharingStatusButton` is true

**File to create:**
- `mobile/src/components/BadgeIndicator.tsx` - Reusable badge overlay component

### Step 4: Build Status Screen UI Components

**Files to create in `mobile/src/components/sharing/`:**

1. **EmpathyAttemptCard.tsx**
   - Shows status badge (color-coded by status)
   - Content preview with "View full" expansion
   - Delivery status indicator (pending/delivered/seen)

2. **ReconcilerActivityCard.tsx**
   - Spinner + "Analyzing..." when active
   - Quiet state when idle

3. **ShareSuggestionCard.tsx** (replaces drawer pattern)
   - Inline expandable card
   - Shows suggested topic and content
   - Action buttons: Accept, Edit, Decline
   - Uses existing `useRespondToShareOffer` mutation

4. **SharedContextTimeline.tsx**
   - Chronological list of shared context
   - Direction indicators (sent/received)
   - Timestamps

### Step 5: Wire Up the Session Screen

**File to modify:**
- `mobile/src/screens/UnifiedSessionScreen.tsx`

Changes:
1. Import and use `useSharingStatus` hook
2. Pass new props to `SessionChatHeader`:
   - `showSharingStatusButton={currentStage === Stage.PERSPECTIVE_STRETCH}`
   - `sharingBadgeCount={sharingStatus.pendingActionsCount}`
   - `onSharingStatusPress={() => router.push(`/session/${sessionId}/sharing-status`)}`
3. Remove `ShareTopicDrawer` and `ShareSuggestionDrawer` usage
4. Remove related state variables

### Step 6: Add Collapsed Indicator in Chat

**File to modify:**
- `mobile/src/utils/chatListSelector.ts`

For SHARED_CONTEXT messages, render as a collapsed indicator:
- Display: "Context shared - tap to view"
- On tap: Navigate to sharing status screen
- Timestamp still visible

### Step 7: Real-time Updates

The status screen uses existing Ably patterns. When these events arrive:
- `empathy.share_suggestion` → invalidate shareOffer query
- `empathy.revealed` → invalidate empathyStatus query
- `empathy.status_updated` → invalidate all empathy queries

Badge count auto-updates because it's derived from query data.

## Files Summary

### New Files (7)
| Path | Purpose |
|------|---------|
| `mobile/app/(auth)/session/[id]/sharing-status.tsx` | Route |
| `mobile/src/screens/SharingStatusScreen.tsx` | Screen |
| `mobile/src/hooks/useSharingStatus.ts` | Data hook |
| `mobile/src/components/BadgeIndicator.tsx` | Badge overlay |
| `mobile/src/components/sharing/EmpathyAttemptCard.tsx` | Attempt display |
| `mobile/src/components/sharing/ShareSuggestionCard.tsx` | Suggestion UI |
| `mobile/src/components/sharing/SharedContextTimeline.tsx` | History |

### Modified Files (4)
| Path | Changes |
|------|---------|
| `mobile/app/(auth)/session/[id]/_layout.tsx` | Add sharing-status route |
| `mobile/src/components/SessionChatHeader.tsx` | Add sharing button + badge |
| `mobile/src/screens/UnifiedSessionScreen.tsx` | Remove drawers, add button props |
| `mobile/src/utils/chatListSelector.ts` | Collapsed indicator for shared content |

### Files to Deprecate Later
- `mobile/src/components/ShareTopicDrawer.tsx`
- `mobile/src/components/ShareSuggestionDrawer.tsx`

## Verification

1. **Navigation**: From session screen, tap sharing button → opens status screen
2. **Badge**: When share suggestion exists, badge shows "1"
3. **Accept/Decline**: Actions work on status screen, queries invalidate
4. **Real-time**: Partner activity updates status screen without refresh
5. **Collapsed indicator**: Shared content in chat shows as tappable indicator
6. **Tests**: Run `npm run test` in mobile workspace
7. **Types**: Run `npm run check` to verify no type errors
