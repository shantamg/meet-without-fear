# Stage 2 Reconciler Flow Design

## Overview

This design fixes the Stage 2→3 transition flow where empathy statements are currently shown to partners prematurely and incorrectly. The key change: empathy statements are **held** until the reconciler validates them, with an optional refinement step when gaps are detected.

## Current Problems

1. **Wrong data displayed**: The `accuracy-feedback` card shows partner's empathy statement, but due to a bug when `partnerId` is null, it can return the user's own statement instead.

2. **Premature reveal**: Empathy statements are shown to partners immediately after consent, without waiting for both parties or reconciler analysis.

3. **Clunky UI**: The empathy reveal is a floating card at the end of chat rather than being integrated into the conversation flow.

4. **Missing reconciler integration**: The reconciler service exists but isn't used to gate the reveal or offer refinement opportunities.

## Design Principles

### Information Boundaries

The reconciler has access to both users' content to make its assessment. The refinement conversation uses **standard full retrieval** (same as any stage prompt) but does not receive the reconciler's detailed gap analysis.

| Agent | Context |
|-------|---------|
| **Reconciler** | Both users' Stage 1 content, both empathy statements, performs detailed comparison |
| **Refinement Conversation** | Standard full retrieval (recent messages, summaries, memories, relationship context) + abstract area hint from reconciler. Does NOT get reconciler's detailed analysis that references partner's content. |

Since messages are per-user (`forUserId`), partner's Stage 1 content isn't in this user's conversation history anyway. The boundary is simply: don't pass the reconciler's detailed "you missed X that partner said" analysis to the refinement prompt.

### What the Reconciler Passes to Refinement

| Reconciler Produces (Internal) | Passed to Refinement (Abstract Only) |
|-------------------------------|-------------------------------------|
| "Jason said he feels unappreciated at work and his efforts go unnoticed. Tara missed this entirely." | `areaHint: "work and effort"` |
| Detailed gap comparison | `guidanceType: "explore_deeper_feelings"` |
| Specific missed feelings list | `promptSeed: "what might be underneath"` |

## State Model

Each empathy direction (Jason→Tara, Tara→Jason) progresses independently through these states:

```
┌──────────────┐
│   DRAFTING   │  User building empathy statement with AI
└──────┬───────┘
       │ User consents to share
       ▼
┌──────────────┐
│    HELD      │  Waiting for partner to also consent
└──────┬───────┘
       │ Both consented → Reconciler runs
       ▼
┌──────────────┐
│  ANALYZING   │  Reconciler comparing guess vs actual Stage 1 content
└──────┬───────┘
       │
  ┌────┴────┐
  ▼         ▼
┌────────┐ ┌──────────┐
│REVEALED│ │NEEDS_WORK│  Significant gaps detected
└───┬────┘ └────┬─────┘
    │           │ Guesser refines via AI conversation
    │           │ Re-submits → Reconciler re-checks
    │           │
    │      ┌────┴────┐
    │      ▼         ▼
    │  [REVEALED] [Still NEEDS_WORK - loop]
    │      │
    ▼      ▼
┌──────────────┐
│   REVEALED   │  Recipient can now see statement
└──────┬───────┘
       │ Recipient validates accuracy
       ▼
┌──────────────┐
│  VALIDATED   │  This direction complete
└──────────────┘
```

## UI States Per User

| State | User A Sees | User B Sees |
|-------|-------------|-------------|
| Neither consented | Building empathy chat | Building empathy chat |
| A consented, B hasn't | "Waiting for B to share their understanding" | Normal chat (no indication A shared) |
| Both consented, analyzing | "Analyzing your empathy exchange..." | "Analyzing your empathy exchange..." |
| A→B: REVEALED, B→A: REVEALED | B's statement in chat + validation UI | A's statement in chat + validation UI |
| A→B: REVEALED, B→A: NEEDS_WORK | B's statement + validation UI | Refinement conversation with AI |
| Both VALIDATED | Ready for Stage 3 | Ready for Stage 3 |

## Chat-Integrated Empathy Reveal

Instead of a floating card, the empathy reveal becomes part of the conversation:

```
[Normal chat messages...]

┌─────────────────────────────────────────────────────────────────┐
│ AI: Tara has shared how she understands what you're going       │
│ through. Here's what she wrote:                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 💬 TARA'S UNDERSTANDING                                         │
│ ───────────────────────────────────────────────────────────────│
│ "I think you might be feeling overwhelmed with work and..."     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ AI: Take a moment with this. How does Tara's understanding      │
│ feel to you?                                                    │
│                                                                 │
│ ○ This feels accurate                                           │
│ ○ Partially accurate                                            │
│ ○ This misses the mark                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Refinement Flow (When Gaps Detected)

When the reconciler finds significant gaps, the guesser enters a refinement conversation. The AI has **standard full retrieval** (same context as any stage) plus an abstract area hint. It guides through curious questions without revealing partner's specific content:

```
┌─────────────────────────────────────────────────────────────────┐
│ AI: Before sharing your understanding with Jason, I'd like to   │
│ explore a bit more with you.                                    │
│                                                                 │
│ You captured something important about work stress. Sometimes   │
│ there are deeper feelings underneath stress.                    │
│                                                                 │
│ What do you imagine might be going on for Jason beneath the     │
│ surface?                                                        │
└─────────────────────────────────────────────────────────────────┘

[User responds with their own thinking]

┌─────────────────────────────────────────────────────────────────┐
│ AI: That's a meaningful insight. Would you like to include      │
│ this in what you share with Jason?                              │
│                                                                 │
│ ○ Yes, let's update my understanding                            │
│ ○ I'd rather keep it as is                                      │
└─────────────────────────────────────────────────────────────────┘

[If yes, AI helps revise statement, then re-submits to reconciler]
```

**Key constraint**: The AI doesn't receive the reconciler's detailed analysis, so it can't say:
- ✗ "Jason feels unappreciated" (would require knowing reconciler found this gap)
- ✗ "You missed that he feels unseen" (would require detailed gap analysis)

It CAN use everything it normally would - the user's full conversation history, memories, relationship context - to ask good questions.

## Notifications

| Trigger | Recipient | Notification |
|---------|-----------|--------------|
| Both consent | Both | "Both empathy statements submitted - analyzing now" |
| Your statement approved | You | "Your understanding has been shared with [partner]" |
| Partner's statement revealed to you | You | "[Partner] shared their understanding of you" |
| Gaps detected in your statement | You | (Handled in-chat, no push notification) |
| Partner validates yours as accurate | You | "[Partner] confirmed your understanding feels right" |
| Both validated | Both | "You're both ready to move forward together" |

## Data Model Changes

### EmpathyAttempt - Add fields

```prisma
model EmpathyAttempt {
  // ... existing fields ...

  status        EmpathyStatus @default(HELD)
  revealedAt    DateTime?
  revisionCount Int           @default(0)
}

enum EmpathyStatus {
  HELD
  ANALYZING
  NEEDS_WORK
  REVEALED
  VALIDATED
}
```

### ReconcilerResult - Add abstract guidance fields

```prisma
model ReconcilerResult {
  // ... existing fields ...

  // Abstract guidance for refinement (no specific partner content)
  areaHint      String?   // e.g., "work and effort"
  guidanceType  String?   // e.g., "explore_deeper_feelings"
  promptSeed    String?   // e.g., "what might be underneath"
}
```

## API Changes

### Modified: POST /sessions/:id/empathy/consent

**Before**: Creates EmpathyAttempt, partner can immediately see via `/empathy/partner`

**After**: Creates EmpathyAttempt with `status: HELD`. If both parties are now HELD, triggers reconciler automatically.

### Modified: GET /sessions/:id/empathy/partner

**Before**: Returns partner's attempt if it exists

**After**: Returns partner's attempt only if `status` is `REVEALED` or `VALIDATED`. Returns `null` otherwise (even if attempt exists but is HELD/ANALYZING/NEEDS_WORK).

### New: POST /sessions/:id/empathy/refine

For refinement conversation when status is NEEDS_WORK. Uses standard full retrieval.

**Request**:
```json
{
  "message": "User's response to refinement prompt"
}
```

**Response**:
```json
{
  "response": "AI's next question/guidance",
  "proposedRevision": "Updated statement if user agreed to revise",
  "canResubmit": true
}
```

### New: POST /sessions/:id/empathy/resubmit

Submit revised statement for re-analysis.

**Request**:
```json
{
  "content": "Revised empathy statement"
}
```

**Response**:
```json
{
  "status": "ANALYZING",
  "message": "Re-analyzing your updated understanding..."
}
```

Reconciler runs again. If approved, status → REVEALED. If still gaps, status → NEEDS_WORK.

## Implementation Phases

### Phase 1: Fix Immediate Bug + Foundation

- [ ] Add `status` field to EmpathyAttempt model
- [ ] Add migration for new fields
- [ ] Modify `consentToShare` to set `status = HELD`
- [ ] Modify `getPartnerEmpathy` to only return if `status` in [REVEALED, VALIDATED]
- [ ] Remove/disable `accuracy-feedback` inline card temporarily
- [ ] Fix the `partnerId ?? undefined` bug in getPartnerEmpathy query

### Phase 2: Reconciler Trigger + Status Flow

- [ ] Add trigger: when both attempts are HELD → run reconciler for both directions
- [ ] Update reconciler to output abstract guidance fields (areaHint, guidanceType, promptSeed)
- [ ] Reconciler sets status to REVEALED (minor/no gaps) or NEEDS_WORK (significant gaps)
- [ ] Add `revealedAt` timestamp when status transitions to REVEALED

### Phase 3: Chat-Integrated Reveal

- [ ] Create new message roles/types: `EMPATHY_REVEAL_INTRO`, `EMPATHY_STATEMENT`, `EMPATHY_VALIDATION_PROMPT`
- [ ] When status → REVEALED, generate intro + statement + prompt messages for recipient
- [ ] Update UnifiedSessionScreen to render these message types appropriately
- [ ] Handle validation response selection in chat flow
- [ ] Update status to VALIDATED when user confirms accuracy

### Phase 4: Refinement Flow

- [ ] Create refinement prompt that uses standard full retrieval + abstract area hint
- [ ] Add `/empathy/refine` endpoint (uses same retrieval as other stages)
- [ ] Add `/empathy/resubmit` endpoint
- [ ] Frontend: detect NEEDS_WORK status, show refinement conversation
- [ ] Track revision count
- [ ] Re-run reconciler after resubmit, update status accordingly

### Phase 5: Notifications + Polish

- [ ] Add notification triggers at key state transitions
- [ ] Implement waiting state UI with appropriate messaging
- [ ] Handle edge cases:
  - Timeout if reconciler takes too long
  - Maximum revision attempts
  - One direction stuck while other progresses
- [ ] Add analytics/logging for reconciler outcomes

## Testing Scenarios

1. **Happy path**: Both share → reconciler approves both → both see statements → both validate → Stage 3
2. **One needs work**: A shares (approved), B shares (needs work) → A sees B's statement, B refines → B resubmits → approved → B sees A's statement
3. **Both need work**: Both refine independently → both resubmit → both approved → both see statements
4. **Decline to refine**: User chooses "keep as is" → statement shared anyway (user's choice)
5. **Multiple revisions**: First revision still has gaps → user refines again → approved on second try
6. **Partial validation**: User says "partially accurate" → feedback captured → can still proceed

## Success Criteria

1. Empathy statements are never shown to partner until reconciler approves or user explicitly declines to refine
2. Refinement conversations use standard full retrieval but don't get reconciler's detailed gap analysis
3. UI feels like a natural conversation, not a card-based form
4. Each direction progresses independently
5. Clear waiting states so users know what's happening
6. Notifications keep users informed of progress

---

## Related Documents

- [Stage 2: Perspective Stretch](../mvp-planning/plans/stages/stage-2-perspective-stretch.md)
- [Reconciler Service](../../backend/src/services/reconciler.ts)
- [Reconciler DTOs](../../shared/src/dto/reconciler.ts)
