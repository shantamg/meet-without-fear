# OFFER_OPTIONAL & Share Flow Redesign Specification

**Date:** 2026-01-13
**Status:** Ready for Implementation
**Progress Tracking:** [offer-optional-progress.md](./offer-optional-progress.md)

## Overview

This spec covers implementing the `OFFER_OPTIONAL` reconciler action and redesigning the share suggestion flow to use a two-phase approach: first showing the topic to share about, then generating a draft only if the user opts in.

## Background

The reconciler system analyzes how well a "guesser" understood the "subject's" feelings and returns one of three actions:

| Action | Gap Severity | Current Behavior | New Behavior |
|--------|-------------|------------------|--------------|
| `PROCEED` | None/Minor | Mark as READY, proceed | Same + positive feedback to guesser |
| `OFFER_OPTIONAL` | Moderate | Treated as PROCEED (bug) | Show topic suggestion with soft language |
| `OFFER_SHARING` | Significant | Full ShareSuggestionDrawer | Show topic suggestion with strong language |

## Key Changes

### 1. Two-Phase Share Flow

**Current:** Shows draft immediately in ShareSuggestionDrawer
**New:** Phase 1 shows topic → Phase 2 generates draft only if user accepts

### 2. New ShareTopicPanel Component

A low-profile, full-width panel (similar to "Review what you'll share") that opens a full-screen drawer showing:
- Intro text explaining reconciler reviewed the guess
- The `suggestedShareFocus` topic
- Two buttons: "Yes, help me share" / "No thanks"

### 3. PROCEED Feedback

When reconciler returns PROCEED, the guesser receives:
- Banner update with positive feedback
- Chat message confirming good alignment

## Detailed Flow

```
User confirms "I feel heard"
         ↓
    Reconciler runs
         ↓
    ┌────┴────┐
    ↓         ↓
PROCEED    OFFER_* (with suggestedShareFocus)
    ↓         ↓
Update     Show ShareTopicPanel
guesser      (low-profile full-width)
status         ↓
    ↓      User taps panel
    ↓         ↓
    ↓      Opens topic drawer
    ↓         ↓
    ↓    ┌────┴────┐
    ↓    ↓         ↓
    ↓  "Yes"    "No thanks"
    ↓    ↓         ↓
    ↓  Generate  Confirm dialog
    ↓  draft       ↓
    ↓  via chat  Mark READY
    ↓    ↓
    ↓  AI responds with draft
    ↓  + "Review and share" button
    ↓    ↓
    ↓  User taps button
    ↓    ↓
    ↓  ShareSuggestionDrawer
    ↓    ↓
    ↓  Share / Edit / Decline
    ↓    ↓
Mutual empathy reveal
```

## User Stories

### US-1: Topic Suggestion Panel Display

**As a** subject who confirmed "I feel heard"
**When** the reconciler returns OFFER_SHARING or OFFER_OPTIONAL with a suggestedShareFocus
**Then** I see a low-profile full-width panel at the bottom of the chat

**Acceptance Criteria:**
- Panel appears after reconciler completes
- Panel is tappable and opens the topic drawer
- Panel disappears after user makes a decision

### US-2: Topic Drawer with Differentiated Language

**As a** subject viewing the topic drawer
**When** the action is OFFER_SHARING
**Then** I see "...you share more about:" with orange/amber lightbulb icon

**When** the action is OFFER_OPTIONAL
**Then** I see "...you might consider sharing about:" with blue/gray lightbulb icon

**Acceptance Criteria:**
- Drawer intro: "Our internal reconciler has reviewed what {name} is imagining you are feeling, noted some of the things you have talked about, and has suggested that..."
- OFFER_SHARING suffix: "...you share more about:"
- OFFER_OPTIONAL suffix: "...you might consider sharing about:"
- Topic displayed under "SUGGESTED FOCUS" label
- Two buttons: "Yes, help me share" / "No thanks"

### US-3: Draft Generation via Chat

**As a** subject who tapped "Yes, help me share"
**When** the draft is generated
**Then** I see an AI message with the draft and a button to open the share drawer

**Acceptance Criteria:**
- No visible user message is sent (hidden/automatic)
- AI response includes: "Here's what you could share with {name}:"
- Draft content follows the framing
- "Review and share" button appears below draft
- Button persists until user taps it
- Draft generation uses same pattern as empathy draft refinement
- suggestedShareFocus is included in the AI context so it knows what to reference

### US-4: Decline Confirmation

**As a** subject who tapped "No thanks"
**When** the confirmation appears
**Then** I see "Are you sure? Sharing this could help {name} understand you better."

**Acceptance Criteria:**
- Confirmation dialog appears
- Two options: confirm decline or go back
- Confirming marks empathy direction as READY
- Goes back to topic drawer if cancelled

### US-5: Guesser Status Updates

**As a** guesser waiting for my partner
**When** my partner is in the share flow
**Then** I see appropriate status updates

**Acceptance Criteria:**
- If subject has share suggestion: "{name} is considering a suggestion to share more"
- If PROCEED: "{name} hasn't seen your [empathy statement] yet and is imagining what you might be feeling"
- After PROCEED completes: Positive feedback in banner AND chat message

### US-6: PROCEED Positive Feedback

**As a** guesser whose partner's reconciler returned PROCEED
**When** the reconciler completes
**Then** I see positive feedback about my understanding

**Acceptance Criteria:**
- Banner updates with positive message about alignment
- Chat message added with reconciler feedback
- Example: "{name} has felt heard. The reconciler reports your attempt to imagine what they're feeling was quite accurate."

### US-7: Shared Content Delivery to Guesser

**As a** guesser whose partner shared additional context
**When** the share is delivered
**Then** I see it with context about the reconciler

**Acceptance Criteria:**
- Realtime notification (existing behavior)
- Message appears in chat with label: "{name} hasn't seen your empathy statement yet because the reconciler suggested they share more. This is what they shared:"
- Shared content follows the label

### US-8: Edge Case - Null suggestedShareFocus

**As a** subject whose reconciler returned OFFER_* but no suggestedShareFocus
**When** the reconciler completes
**Then** the system treats it as PROCEED

**Acceptance Criteria:**
- No topic panel shown
- No share flow initiated
- Proceeds directly as if PROCEED was returned

## Technical Implementation

### New Components

#### ShareTopicPanel (mobile)
- Low-profile full-width panel
- Located at bottom of chat area
- Tappable to open ShareTopicDrawer

#### ShareTopicDrawer (mobile)
- Full-screen drawer
- Displays topic intro, suggestedShareFocus, and action buttons
- Visual differentiation between OFFER_SHARING and OFFER_OPTIONAL (colors, icons)

### Modified Components

#### ShareSuggestionDrawer
- Remove initial topic display (now in ShareTopicDrawer)
- Keep draft display and Share/Edit/Decline functionality

#### WaitingBanner / getWaitingStatus
- Add new status states for reconciler/share flow
- Handle guesser status updates

### Backend Changes

#### reconciler.ts
- Ensure OFFER_OPTIONAL is handled (currently only checks for PROCEED)
- May need endpoint modification for draft generation with suggestedShareFocus context

#### Realtime Events
- Ensure proper events for guesser status updates
- Shared content delivery with reconciler context label

### Database

No schema changes expected. Existing `ReconcilerResult` and `ReconcilerShareOffer` tables should suffice.

## UI Copy Reference

### Topic Drawer Intro
```
Our internal reconciler has reviewed what {name} is imagining you are feeling,
noted some of the things you have talked about, and has suggested that
[you share more about: / you might consider sharing about:]
```

### Topic Label
```
SUGGESTED FOCUS
```

### Buttons
```
"Yes, help me share"
"No thanks"
```

### Decline Confirmation
```
Are you sure? Sharing this could help {name} understand you better.
```

### Draft Framing
```
Here's what you could share with {name}:
[draft content]
[Review and share button]
```

### Guesser Shared Content Label
```
{name} hasn't seen your empathy statement yet because the reconciler
suggested they share more. This is what they shared:
[shared content]
```

## Analytics Events

| Event | Properties |
|-------|------------|
| `share_topic_shown` | `action: OFFER_SHARING \| OFFER_OPTIONAL` |
| `share_topic_accepted` | `action` |
| `share_topic_declined` | `action` |
| `share_draft_sent` | `action`, `was_edited: boolean` |

## Error Handling

- Draft generation failure: Show error with "Try again" button
- Unlimited retries allowed
- App close during flow: State persists via chat, panels restore on reopen

## Scope Exclusions

- User cannot directly edit suggestedShareFocus topic
- User CAN chat to influence what gets generated/shared
- No timeout auto-proceed
- No retry limits on draft generation

## Implementation Notes

1. Draft generation should follow the same pattern as empathy draft refinement (separate input, message prepended with context)
2. Include suggestedShareFocus in AI context so it knows what to pull even if user's comments are brief
3. Mutual empathy reveal (already built) happens after both sides complete the reconciler/share flow
