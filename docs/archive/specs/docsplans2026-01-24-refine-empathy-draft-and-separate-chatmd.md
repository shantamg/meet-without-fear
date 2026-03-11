# Specification: Tabbed Chat Interface + Inner Thoughts Removal

**Created:** 2026-01-24
**Status:** Ready for Implementation

---

## Overview

This spec covers two related changes to the Meet Without Fear mobile app:

1. **Remove Inner Thoughts from Sessions** - Inner Thoughts is a standalone app feature, not connected to partner sessions
2. **Tabbed Chat Interface** - Replace single chat + Sharing Status screen with a two-tab interface

---

## 1. Remove Inner Thoughts from Sessions

### Requirement
Inner Thoughts should NOT be connected to specific partner sessions. It exists as a separate standalone feature in the app for general journaling/reflection.

### Changes Required

**Remove from `SessionChatHeader.tsx`:**
- Remove the Inner Thoughts button from the header

**Remove from `UnifiedSessionScreen.tsx`:**
- Remove any Inner Thoughts links or panels
- Remove any waiting-state panels that link to Inner Thoughts

### Scope
This is a global removal from all session contexts (not conditional on state).

---

## 2. Tabbed Chat Interface

### Architecture

Replace the current single chat view with a two-tab interface:

| Tab | Label | Content |
|-----|-------|---------|
| 1 (default) | "AI" | User's conversation with the AI guide |
| 2 | "[Partner Name]" | Shared content between users |

### Tab Bar Design

**Style:** Segmented control (iOS-style but custom, consistent on both platforms)
- Rounded container with pill that slides between options
- Custom implementation (not platform-adaptive)

**Badge:** Dot indicator on Partner tab when pending actions exist
- Simple colored dot, no count
- Appears when user has items requiring attention

---

## 3. AI Tab

The AI tab is the existing chat interface, unchanged except:
- Remove any cross-user content (share suggestion panels, validation prompts)
- This is purely for AI guidance conversation

### Content
- Stage-specific guidance and prompts
- Empathy drafting conversation
- Reflection conversation
- All AI interactions

---

## 4. Partner Tab

### Layout
- Card-styled messages (not plain chat bubbles)
- User's content aligned right
- Partner's content aligned left
- Status text at bottom of each card
- Chronological order (oldest at top, newest at bottom)

### Content Types

All of these appear as card-styled items:

1. **Empathy Attempts** (after synchronized reveal)
2. **Shared Context Messages** (from subject to guesser)
3. **Clarification Requests/Responses** (during reconciliation)
4. **Validation Confirmations** (when partner validates accuracy)

### Empty State

When no content has been shared yet:

> "Messages with [Partner Name] will appear here once you're ready to share"

---

## 5. Pending Actions Flow

1. When user has a pending action, dot badge appears on Partner tab
2. Badge is the only notification (AI does not mention it)
3. Tapping tab navigates to Partner tab
4. Pending action is visible as an interactive card
5. Tapping card opens drawer for interaction (reuse existing drawer UI)

### Pending Action Types
- Share suggestion requiring response
- Partner's empathy needing validation
- New shared context to view

---

## 6. Share Suggestion Flow

**Current (to be replaced):** Panel in AI chat → opens drawer
**New:** Card in Partner tab → opens same drawer

### Flow
1. Reconciler detects gaps → generates share suggestion
2. Dot badge appears on Partner tab
3. User taps Partner tab → sees share suggestion card
4. User taps card → drawer opens with Accept/Edit/Decline options
5. If accepted → shared context message appears in Partner tab for both users

### Reuse
- Keep existing drawer UI (`ShareSuggestionDrawer` or similar)
- Only change is the trigger location (Partner tab instead of AI chat)

---

## 7. Empathy Validation Flow

Validation happens directly in the Partner tab:

1. Partner's empathy card appears after synchronized reveal
2. Validation buttons are shown on the card
3. User taps to validate (accurate / partially accurate / misses the mark)
4. Status updates on the card

---

## 8. Status Messages

Each card in the Partner tab has status text at the bottom explaining the current state.

### My Empathy Attempt Card

| State | Status Message |
|-------|----------------|
| `HELD` | "Your empathy draft is saved. It will be reviewed once [Partner] finishes reflecting." |
| `ANALYZING` | "Reviewing your empathy draft..." |
| `AWAITING_SHARING` | "[Partner] has been asked to share more context to help you understand." |
| `REFINING` | "[Partner] shared some context. You can refine your empathy draft in the AI chat." |
| `READY` | "Your empathy draft is ready. Waiting for [Partner] to finish theirs." |
| `REVEALED` | "Your empathy has been shared with [Partner]." |
| `VALIDATED` | "[Partner] confirmed your empathy feels accurate." |

### Partner's Empathy Attempt Card

| State | Status Message |
|-------|----------------|
| `REVEALED` | "[Partner] shared how they understand your feelings." |
| `VALIDATED` | "You confirmed this feels accurate." |
| Pending validation | "Does this feel accurate? Let [Partner] know." |

### Shared Context Card

| Sender | Status Message |
|--------|----------------|
| From me | "You shared this to help [Partner] understand." |
| From partner | "[Partner] shared this to help you understand." |

### Share Suggestion Card (Pending Action)

> "[Partner] is trying to understand your perspective. Would you like to share something to help?"

---

## 9. Files to Modify

### Remove Inner Thoughts
- `mobile/src/components/SessionChatHeader.tsx` - Remove Inner Thoughts button
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Remove Inner Thoughts links/panels

### Add Tabbed Interface
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Add segmented control tab bar, manage active tab state
- Create `mobile/src/components/PartnerChatTab.tsx` - New component for Partner tab content
- Create `mobile/src/components/PartnerContentCard.tsx` - Card component for shared content items

### Move Interactions to Partner Tab
- Move share suggestion trigger from AI chat to Partner tab
- Move validation UI to Partner tab
- Keep drawer components, just change where they're triggered from

### Remove Sharing Status Screen
- Remove or deprecate `mobile/app/(auth)/session/[id]/sharing-status.tsx`
- Remove or deprecate `mobile/src/screens/SharingStatusScreen.tsx`
- Keep `mobile/src/hooks/useSharingStatus.ts` for deriving badge state

### Reuse Existing Components
- `mobile/src/components/sharing/ShareSuggestionCard.tsx` - Adapt for Partner tab
- `mobile/src/components/sharing/EmpathyAttemptCard.tsx` - Adapt for Partner tab
- Existing drawer components for share suggestion interaction

---

## 10. Out of Scope

- **Iteration caps** - Skip for now, let reconciliation loop as needed
- **ACCEPTED_PARTIAL fallback** - Not implementing partial acceptance warning
- **AI mentioning pending actions** - Badge only, no AI prompts about Partner tab
- **Inner Thoughts feature** - Not removing from app, just disconnecting from sessions

---

## 11. User Stories

### US-1: Remove Inner Thoughts Button from Session Header

**As a** user in a session
**I want** the session header to not show Inner Thoughts
**So that** the session stays focused on the guided process

**Acceptance Criteria:**
- [ ] Inner Thoughts button is not visible in `SessionChatHeader`
- [ ] No runtime errors when rendering the header
- [ ] Header layout adjusts properly with button removed

### US-2: Remove Inner Thoughts from Waiting Panels

**As a** user waiting for my partner
**I want** waiting panels to not mention Inner Thoughts
**So that** I'm not confused about separate features

**Acceptance Criteria:**
- [ ] No Inner Thoughts links in any waiting/holding panels
- [ ] Panels render correctly with links removed

### US-3: Add Segmented Control Tab Bar

**As a** user in a session
**I want** to see tabs at the top to switch between AI and Partner views
**So that** I can easily navigate between the two contexts

**Acceptance Criteria:**
- [ ] Segmented control appears below the header
- [ ] "AI" tab is selected by default
- [ ] Partner tab shows partner's name (e.g., "Sarah")
- [ ] Tapping switches active tab with visual feedback
- [ ] Tab state persists during the session

### US-4: Partner Tab Empty State

**As a** user before any sharing has occurred
**I want** to see a helpful empty state in the Partner tab
**So that** I understand content will appear later

**Acceptance Criteria:**
- [ ] Empty state shows: "Messages with [Partner Name] will appear here once you're ready to share"
- [ ] Partner name is dynamically inserted
- [ ] Empty state disappears when first content item appears

### US-5: Partner Tab Badge Indicator

**As a** user with pending actions
**I want** to see a dot badge on the Partner tab
**So that** I know something needs my attention

**Acceptance Criteria:**
- [ ] Dot badge appears when pending actions exist
- [ ] Badge is removed when no pending actions
- [ ] Badge is a simple dot (no count)
- [ ] Badge is visually prominent (colored)

### US-6: Share Suggestion in Partner Tab

**As a** user receiving a share suggestion
**I want** to see it in the Partner tab
**So that** cross-user interactions are consolidated

**Acceptance Criteria:**
- [ ] Share suggestion card appears in Partner tab (not AI chat)
- [ ] Tapping card opens existing drawer for Accept/Edit/Decline
- [ ] After accepting, shared context appears in Partner tab
- [ ] Badge clears after responding

### US-7: Empathy Cards in Partner Tab

**As a** user after synchronized reveal
**I want** to see empathy attempts as cards in Partner tab
**So that** I can review and validate them

**Acceptance Criteria:**
- [ ] My empathy card shows on right side
- [ ] Partner's empathy card shows on left side
- [ ] Each card has appropriate status text at bottom
- [ ] Cards appear after reveal (not before)

### US-8: Inline Validation in Partner Tab

**As a** user viewing partner's empathy
**I want** to validate it directly in the Partner tab
**So that** I don't have to switch contexts

**Acceptance Criteria:**
- [ ] Validation buttons appear on partner's empathy card
- [ ] Options: accurate / partially accurate / misses the mark
- [ ] Status updates after validation
- [ ] No need to go to AI chat for validation

### US-9: Shared Context Cards

**As a** user viewing shared context
**I want** to see it as a card with clear attribution
**So that** I know who shared it and why

**Acceptance Criteria:**
- [ ] Shared context from me appears on right
- [ ] Shared context from partner appears on left
- [ ] Status text indicates purpose (to help understand)
- [ ] Cards appear in chronological order

### US-10: Remove Sharing Status Screen

**As a** developer
**I want** to remove the separate Sharing Status screen
**So that** the codebase is simplified

**Acceptance Criteria:**
- [ ] Sharing Status route removed or redirects to session
- [ ] No broken links to Sharing Status screen
- [ ] Functionality moved to Partner tab

---

## 12. Verification Commands

```bash
# Type checking
npm run check

# Run tests
npm run test

# Specific test files (if they exist)
npm run test -- --grep "SessionChatHeader"
npm run test -- --grep "UnifiedSessionScreen"
```

---

## 13. Implementation Notes

### Tab State Management
- Use local state for active tab (useState)
- Consider using React Navigation's tab navigator if complexity increases
- Tab state does not need to persist across app restarts

### Card Component Design
- Create a generic `PartnerContentCard` component
- Props: `content`, `sender`, `type`, `status`, `onPress`
- Reuse for all content types (empathy, shared context, etc.)

### Badge State Derivation
- Continue using `useSharingStatus` hook
- Derive badge visibility: `hasPendingAction = shareOffer?.hasSuggestion || needsValidation || hasNewContext`

### Migration Path
1. Remove Inner Thoughts from header and panels
2. Add tab bar to UnifiedSessionScreen
3. Create PartnerChatTab component with empty state
4. Move share suggestion card to Partner tab
5. Move empathy cards to Partner tab
6. Add inline validation to Partner tab
7. Remove Sharing Status screen and routes
