# Sharing Status Screen - Feature Specification

## Overview

Create a dedicated "Sharing Status" screen that consolidates all empathy reconciliation activity, removing it from the main chat flow. This keeps the chat focused on the 1:1 conversation with the AI while giving sharing/reconciliation its own clear, accessible space.

## Out of Scope

- Consent revocation UI (keep as advanced/hidden action)
- Direct editing of empathy content after submission
- Multi-session consolidated view
- Analytics/metrics tracking of sharing behavior

## User Stories

### US-1: View Sharing Status Button

**As a** user in Stage 2+ with pending sharing activity
**I want to** see a button in the chat header that indicates sharing status
**So that** I know there's activity to review outside the chat

**Acceptance Criteria:**
- Button appears only when there's a pending action or content to review
- Button shows badge with exact count of pending items (suggestions, validations, unread shared context, reconciler results)
- Button animates with slide-in + glow effect on first appearance
- Button is NOT visible if no actionable items exist
- Tapping button navigates to `/session/[id]/sharing-status`

### US-2: Navigate to Sharing Status Screen

**As a** user
**I want to** access the Sharing Status screen via header button or deep link
**So that** I can review sharing activity from multiple entry points

**Acceptance Criteria:**
- Route `/session/[id]/sharing-status` exists and is accessible
- Deep links work (e.g., from push notifications)
- Screen has visible back button in header that returns to chat
- Screen title is "Sharing Status"

### US-3: View My Empathy Attempt Status

**As a** user
**I want to** see the status of my empathy attempt
**So that** I know where it is in the sharing process

**Acceptance Criteria:**
- EmpathyAttemptCard displays for my attempt
- Shows status badge (HELD, ANALYZING, READY, REVEALED)
- Shows content preview of my empathy attempt
- Card is view-only (no edit/revoke actions)

### US-4: View Partner's Empathy Attempt

**As a** user
**I want to** see my partner's empathy attempt when revealed
**So that** I can understand how they perceive my perspective

**Acceptance Criteria:**
- Partner's EmpathyAttemptCard displays when status is REVEALED
- Shows their empathy attempt content
- Includes validation buttons (accurate, partially accurate, inaccurate)
- No special visual treatment for unvalidated state

### US-5: Respond to Share Suggestion

**As a** user receiving a share suggestion from the reconciler
**I want to** accept, edit, or decline the suggestion
**So that** I control what context I share with my partner

**Acceptance Criteria:**
- ShareSuggestionCard displays pending suggestion
- "Share this" button accepts and shares the content
- "Edit" button opens inline refinement: user types how to change it, AI refines, updated suggestion appears
- "No thanks" button declines and returns to chat automatically
- After accepting, card shows confirmation then updates to reflect shared state

### US-6: Refine Share Suggestion

**As a** user who wants to modify a share suggestion
**I want to** describe how I want it changed and see the AI's refinement
**So that** I can share content that feels right to me

**Acceptance Criteria:**
- Tapping "Edit" expands card into refinement mode
- User types instructions (e.g., "make it shorter" or "focus on the feeling")
- Loading state shown while AI processes
- Updated suggestion appears inline on status screen
- User can then accept or refine again

### US-7: Validate Partner's Empathy

**As a** user reviewing partner's empathy attempt
**I want to** provide accuracy feedback
**So that** we can achieve mutual understanding

**Acceptance Criteria:**
- Three buttons: "This feels accurate", "Partially accurate", "This misses the mark"
- "Accurate" and "Partially accurate" complete validation on status screen
- "Inaccurate" navigates to chat for AI coach feedback flow
- After validation, card updates to show validated state

### US-8: View Sharing History

**As a** user
**I want to** see a timeline of all sharing activity
**So that** I can track what has been exchanged

**Acceptance Criteria:**
- SharedContextTimeline section shows chronological list
- Includes: empathy attempts, reconciler updates, messages shared/received
- Each item shows direction (sent/received), content preview, timestamp
- Section is always visible when there's history content

### US-9: Receive Real-time Updates

**As a** user on the Sharing Status screen
**I want to** see updates when partner activity occurs
**So that** I stay informed without refreshing

**Acceptance Criteria:**
- Toast notification appears for new updates (e.g., "Partner's understanding revealed")
- Tapping toast auto-scrolls to relevant updated card
- Data updates via existing Ably events + query invalidation
- No polling required (trust real-time system)

### US-10: View Collapsed Indicator in Chat

**As a** user viewing the chat
**I want to** see a minimal indicator when context was shared
**So that** the chat stays focused on conversation

**Acceptance Criteria:**
- SHARED_CONTEXT messages render as collapsed indicator
- Text: "Context shared"
- Tappable: navigates to Sharing Status screen
- Timestamp visible

## Technical Decisions

### New Files

| Path | Purpose |
|------|---------|
| `mobile/app/(auth)/session/[id]/sharing-status.tsx` | Route handler |
| `mobile/src/screens/SharingStatusScreen.tsx` | Main screen component |
| `mobile/src/hooks/useSharingStatus.ts` | Composite data hook |
| `mobile/src/components/BadgeIndicator.tsx` | Reusable badge overlay |
| `mobile/src/components/sharing/EmpathyAttemptCard.tsx` | Empathy attempt display |
| `mobile/src/components/sharing/ShareSuggestionCard.tsx` | Suggestion UI with actions |
| `mobile/src/components/sharing/SharedContextTimeline.tsx` | History timeline |

### Modified Files

| Path | Changes |
|------|---------|
| `mobile/app/(auth)/session/[id]/_layout.tsx` | Add sharing-status route to Stack |
| `mobile/src/components/SessionChatHeader.tsx` | Add sharing button with badge |
| `mobile/src/screens/UnifiedSessionScreen.tsx` | Remove drawers, add button logic |
| `mobile/src/utils/chatListSelector.ts` | Collapsed indicator for shared content |

### Files to Remove

| Path | Reason |
|------|---------|
| `mobile/src/components/ShareTopicDrawer.tsx` | Replaced by status screen |
| `mobile/src/components/ShareSuggestionDrawer.tsx` | Replaced by status screen |

### Layout Order (Top to Bottom)

1. Pending Actions (share suggestions requiring response)
2. My Empathy Attempt Card
3. Partner's Empathy Attempt Card
4. Shared Context History

### Hook Design

`useSharingStatus` composes existing hooks:
- `useEmpathyStatus(sessionId)` - my/partner attempt status
- `useShareOffer(sessionId)` - pending share suggestion
- `usePartnerEmpathy(sessionId)` - partner's empathy content

Returns derived data:
- `myAttempt`, `partnerAttempt` - empathy attempt data
- `isAnalyzing` - reconciler running state
- `shareOffer`, `hasSuggestion` - pending suggestions
- `pendingActionsCount` - for badge (count of ALL pending items)
- `sharedContextHistory` - list of shared items
- `shouldShowButton` - derived: true only when there's actionable content

### State Synchronization

- Use existing Ably real-time events + query invalidation
- No additional polling (trust real-time system)
- Events: `empathy.share_suggestion`, `empathy.revealed`, `empathy.status_updated`
- Badge count auto-updates because it's derived from query data

### Animation

- Button entry: Slide-in with glow effect on first appearance
- Toast notifications for real-time updates

### Prompt Context

Existing `shared-context.ts` and `context-formatters.ts` already include shared content (empathy statements, milestones, shared context) in AI prompts. No changes needed.

## Edge Cases

### Stage Completion
When Stage 3 is reached (both users validated), stay on status screen showing completed state. User navigates away manually.

### Empty State
Button only appears when there's actionable content. If user navigates via deep link to empty state, show friendly message: "Nothing here yet. Continue chatting to build understanding."

### Post-Decline
When user declines share suggestion, auto-navigate back to chat (matches current drawer behavior).

### Post-Accept/Validate
When user accepts share suggestion or validates empathy, stay on status screen to see updated state.

## Verification Checklist

- [ ] Button appears only when pending actions exist
- [ ] Button shows correct badge count
- [ ] Button animates with slide-in + glow on first appearance
- [ ] Navigation to status screen works from button and deep link
- [ ] Back button returns to chat
- [ ] My Empathy Card shows correct status (HELD/ANALYZING/READY/REVEALED)
- [ ] Partner's Empathy Card shows content when REVEALED
- [ ] Validation buttons work (accurate/partial on screen, inaccurate to chat)
- [ ] Share suggestion displays with Accept/Edit/Decline actions
- [ ] Edit flow: type instructions → see AI refinement inline
- [ ] Decline returns to chat
- [ ] Accept shows confirmation, updates state
- [ ] History timeline shows all sharing activity
- [ ] Toast appears on real-time update
- [ ] Tapping toast scrolls to relevant card
- [ ] Collapsed indicator in chat shows "Context shared"
- [ ] Tapping collapsed indicator navigates to status screen
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] ShareTopicDrawer and ShareSuggestionDrawer removed
