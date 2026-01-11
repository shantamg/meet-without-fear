# Stage 2: Perspective Stretch - Empathy Exchange Flow

This document describes the empathy exchange flow in Stage 2, including the reconciler system that analyzes empathy accuracy and manages the sharing of additional context.

## Overview

In Stage 2, both users work to understand each other's perspective. Each user:
1. Chats with AI to develop their understanding of their partner's experience
2. Creates an empathy statement expressing that understanding
3. Shares the statement with their partner
4. Receives validation feedback on their empathy

The **Reconciler** analyzes how well each person understood the other and may suggest sharing additional context to help bridge gaps in understanding.

## Empathy Attempt States

```mermaid
stateDiagram-v2
    [*] --> HELD: User shares empathy statement

    HELD --> ANALYZING: Partner confirms "feel heard" (Stage 1)
    ANALYZING --> REVEALED: Reconciler finds minor/no gaps
    ANALYZING --> AWAITING_SHARING: Reconciler finds significant gaps

    AWAITING_SHARING --> REFINING: Subject shares context
    REFINING --> REVEALED: Guesser revises empathy

    AWAITING_SHARING --> REVEALED: Subject declines to share

    REVEALED --> VALIDATED: Subject validates empathy as accurate
    REVEALED --> NEEDS_WORK: Subject says empathy is inaccurate

    NEEDS_WORK --> HELD: Guesser resubmits revised empathy

    VALIDATED --> [*]
```

## Share Offer States

The `ReconcilerShareOffer` tracks the suggestion lifecycle:

```mermaid
stateDiagram-v2
    [*] --> PENDING: Reconciler creates offer

    PENDING --> OFFERED: User fetches offer (GET /reconciler/share-offer)
    PENDING --> OFFERED: User responds before fetching
    PENDING --> ACCEPTED: User accepts (from drawer without GET)

    OFFERED --> ACCEPTED: User accepts suggestion
    OFFERED --> DECLINED: User declines to share
    OFFERED --> SKIPPED: System skips (edge case)

    ACCEPTED --> [*]: Context shared with partner
    DECLINED --> [*]: Empathy revealed without context
    SKIPPED --> [*]
```

## Reconciler Flow

The reconciler runs when one user confirms "feel heard" (completing Stage 1) and their partner has an empathy attempt in `HELD` status.

### Reconciler Decision Tree

```mermaid
flowchart TB
    subgraph Trigger["Trigger: Subject confirms 'feel heard'"]
        A["Subject clicks 'I feel heard'"]
    end

    A --> B{Partner has HELD<br/>empathy attempt?}
    B -->|No| C[No action needed]
    B -->|Yes| D[Run Reconciler Analysis]

    D --> E{Analyze gaps in<br/>partner's understanding}

    E --> F{Gap Severity?}

    F -->|None/Minor + PROCEED| G[REVEAL directly]
    F -->|Moderate + OFFER_OPTIONAL| G
    F -->|Significant + OFFER_SHARING| H[Create Share Suggestion]

    G --> I["Guesser sees:<br/>'Partner is considering<br/>your perspective'"]
    G --> J[Update status to REVEALED]

    H --> K[Subject sees:<br/>Share Suggestion Panel]
    H --> L[Update status to AWAITING_SHARING]

    subgraph SubjectChoice["Subject's Choice"]
        K --> M{Accept suggestion?}
        M -->|Accept| N[Share context with guesser]
        M -->|Refine| O[Chat to revise suggestion]
        M -->|Decline| P[Skip sharing]
    end

    N --> Q[Guesser's empathy<br/>status → REFINING]
    O --> N
    P --> J

    Q --> R[Guesser revises<br/>empathy statement]
    R --> J
```

### Reconciler Actions by Gap Severity

| Gap Severity | Recommended Action | Effect on Guesser | Effect on Subject |
|--------------|-------------------|-------------------|-------------------|
| None | `PROCEED` | Empathy REVEALED immediately | Sees partner's empathy |
| Minor | `PROCEED` | Empathy REVEALED immediately | Sees partner's empathy |
| Moderate | `OFFER_OPTIONAL` | Empathy REVEALED immediately | Sees partner's empathy |
| Significant | `OFFER_SHARING` | Status → AWAITING_SHARING | Sees share suggestion panel |

### Share Suggestion Generation Flow

```mermaid
sequenceDiagram
    participant Rec as Reconciler
    participant AI as AI (Sonnet)
    participant DB as Database
    participant Ably as Realtime

    Rec->>AI: Generate share suggestion<br/>(gap analysis + witnessing content)
    AI-->>Rec: { suggestedContent, reason }

    Rec->>DB: Find ReconcilerResult<br/>(retry up to 3x)

    alt Result found
        Rec->>DB: Update ReconcilerResult<br/>(suggestedShareContent, suggestedShareReason)
        Rec->>DB: Upsert ReconcilerShareOffer<br/>(status: PENDING, suggestedContent)
        Rec->>Ably: Publish empathy.share_suggestion
    else Result NOT found
        Note over Rec: CRITICAL: Suggestion lost!<br/>User won't see panel
    end
```

## User Experience: Both Users' Perspective

### User A (Guesser) Flow

```mermaid
sequenceDiagram
    participant A as User A (Guesser)
    participant AI as AI Assistant
    participant System as Backend
    participant B as User B (Subject)

    Note over A,B: Stage 1 Complete - Both felt heard

    A->>AI: Chat about B's perspective
    AI->>A: Guides empathy development
    AI->>A: Proposes empathy statement

    A->>System: Share empathy statement
    System->>System: Create EmpathyAttempt (HELD)

    Note over A: Waiting for B to feel heard...

    B->>System: Confirms "I feel heard"
    System->>System: Run Reconciler for A→B

    alt Minor/No Gaps (PROCEED/OFFER_OPTIONAL)
        System->>A: "B is now considering your perspective"
        System->>System: Update status to REVEALED
    else Significant Gaps (OFFER_SHARING)
        System->>B: Share suggestion panel appears
        alt B shares context
            B->>System: Shares additional context
            System->>A: Context notification + status → REFINING
            A->>AI: Chat to revise understanding
            AI->>A: Updated empathy statement
            A->>System: Resubmit revised empathy
        else B declines
            B->>System: Declines to share
            System->>System: Reveal current empathy
        end
    end

    System->>B: Show A's empathy statement
    B->>System: Validate (accurate/partially/inaccurate)

    alt Validated as accurate
        System->>System: Status → VALIDATED
    else Validated as inaccurate
        System->>System: Status → NEEDS_WORK
        System->>A: "B provided feedback, please revise"
    end
```

### Validation Flow (After Empathy Revealed)

```mermaid
sequenceDiagram
    participant Sub as Subject (Validator)
    participant UI as Validation Panel
    participant API as Backend
    participant Guesser as Guesser

    Note over Sub: Partner's empathy is REVEALED

    Sub->>UI: Opens validation panel
    UI->>Sub: Shows partner's empathy statement

    Sub->>UI: Provides accuracy rating<br/>(Accurate / Partially / Inaccurate)

    alt Optional feedback
        Sub->>UI: Adds text feedback
    end

    UI->>API: POST /empathy/validate<br/>{ validated, rating, feedback }

    alt Validated (accurate or partially)
        API->>API: Status → VALIDATED
        API->>Sub: Success response
        Note over Sub,Guesser: Both can proceed to Stage 3
    else Not validated (inaccurate)
        API->>API: Status → NEEDS_WORK
        API->>Guesser: Notification to revise
        Note over Guesser: Enters refinement flow
    end
```

### Refinement Flow (When NEEDS_WORK)

```mermaid
sequenceDiagram
    participant G as Guesser
    participant AI as AI Assistant
    participant API as Backend
    participant Sub as Subject

    Note over G: Empathy marked NEEDS_WORK

    G->>API: GET /empathy/status
    API-->>G: refinementHint from reconciler

    G->>AI: Chat to refine understanding
    AI->>G: Guidance based on gap analysis

    G->>AI: Draft revised empathy
    AI->>G: Proposes updated statement

    G->>API: POST /empathy/resubmit<br/>{ newContent }

    API->>API: Update EmpathyAttempt content
    API->>API: Re-run reconciler

    alt Still significant gaps
        API->>Sub: Share suggestion panel (if not declined before)
        Note over G: Wait for subject response
    else No significant gaps
        API->>API: Status → REVEALED
        API->>Sub: Show revised empathy for validation
    end
```

## UI State Machine

The chat input visibility and above-input panels are controlled by the waiting status:

```mermaid
stateDiagram-v2
    [*] --> Active: User enters Stage 2

    Active --> WitnessPending: Partner in Stage 1
    WitnessPending --> Active: Partner completes Stage 1

    Active --> ReconcilerAnalyzing: Reconciler running
    ReconcilerAnalyzing --> PartnerConsidering: Minor gaps, revealed
    ReconcilerAnalyzing --> AwaitingContextShare: Significant gaps

    PartnerConsidering --> Active: Partner shares empathy

    AwaitingContextShare --> Active: User responds to share offer

    Active --> EmpathyPending: User consented, waiting for partner
    EmpathyPending --> PartnerSharedEmpathy: Partner shares
    PartnerSharedEmpathy --> Active: Show validation UI

    state Active {
        [*] --> Chatting
        Chatting --> ViewingEmpathy: Tap "View your understanding"
        ViewingEmpathy --> Chatting: Close drawer
        ViewingEmpathy --> Sharing: Tap "Share"
        Sharing --> Chatting: Confirmed
    }
```

## Input Visibility Rules

| Waiting Status | Hide Input? | Show Banner? | Show Inner Thoughts? |
|---------------|-------------|--------------|---------------------|
| `null` | No | No | Depends on stage |
| `witness-pending` | Yes | Yes | Yes |
| `empathy-pending` | Yes | Yes | Yes |
| `partner-considering-perspective` | Yes | Yes | Yes |
| `reconciler-analyzing` | Yes | Yes (with spinner) | Yes |
| `awaiting-context-share` | No | Yes | No |
| `refining-empathy` | No | No | No |

## Panel Priority

Only one panel shows at a time, in this priority order:

1. **Compact Agreement Bar** - During onboarding
2. **Invitation Panel** - After signing, before sending invite
3. **Feel Heard Panel** - Stage 1 completion
4. **Share Suggestion Panel** - Subject must respond to share suggestion
5. **Accuracy Feedback Panel** - Partner's empathy available for validation
6. **Empathy Statement Panel** - User's empathy ready to review
7. **Waiting Banner** - Any waiting status

## Realtime Events

| Event | Trigger | Cache Invalidation | UI Update |
|-------|---------|-------------------|-----------|
| `empathy.share_suggestion` | Reconciler finds significant gaps | `shareOffer`, `empathyStatus` | Show share suggestion panel |
| `empathy.context_shared` | Subject shares additional context | `empathyStatus`, `shareOffer`, `messages` | Guesser sees shared context |
| `empathy.revealed` | Empathy revealed (no significant gaps) | `empathyStatus`, `partnerEmpathy` | Subject can validate |
| `partner.stage_completed` | Partner completes a stage | `empathyStatus`, `progress` | Update waiting status |
| `partner.session_viewed` | Partner views session | `empathyStatus` (delivery status) | Update delivery indicator |
| `empathy.validated` | Partner validates empathy | `empathyStatus` | Show validation result |

## Data Models

### EmpathyAttempt

```typescript
{
  id: string;
  sessionId: string;
  sourceUserId: string;       // The guesser
  content: string;            // The empathy statement
  status: 'HELD' | 'ANALYZING' | 'REVEALED' | 'AWAITING_SHARING' |
          'REFINING' | 'VALIDATED' | 'NEEDS_WORK';
  sharedAt: Date;             // When initially shared
  revealedAt: Date | null;    // When revealed to subject
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'SEEN';
  deliveredAt: Date | null;
  seenAt: Date | null;
}
```

### ReconcilerResult

```typescript
{
  id: string;
  sessionId: string;
  guesserId: string;
  subjectId: string;
  guesserName: string;
  subjectName: string;
  alignmentScore: number;     // 0-100
  gapSeverity: 'none' | 'minor' | 'moderate' | 'significant';
  recommendedAction: 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING';
  mostImportantGap: string | null;
  suggestedShareContent: string | null;   // From generateShareSuggestion
  suggestedShareReason: string | null;
}
```

### ReconcilerShareOffer

```typescript
{
  id: string;
  resultId: string;           // FK to ReconcilerResult
  userId: string;             // The subject who can share
  status: 'PENDING' | 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'SKIPPED';
  suggestedContent: string | null;        // AI-generated suggestion
  suggestedReason: string | null;
  customContent: string | null;           // User's refined content
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'SEEN';
  createdAt: Date;
  sharedAt: Date | null;
  declinedAt: Date | null;
}
```

### EmpathyValidation

```typescript
{
  id: string;
  empathyAttemptId: string;
  userId: string;             // The validator (subject)
  validated: boolean;         // Overall validation
  rating: 'accurate' | 'partially_accurate' | 'inaccurate';
  feedback: string | null;    // Optional text feedback
  validatedAt: Date;
}
```

## Known Edge Cases

### Case 1: Race Condition on Reveal
If both users share empathy at nearly the same time, both reconcilers run. Need to handle:
- Both returning PROCEED → both reveal immediately
- One returning OFFER_SHARING → only one gets share suggestion

### Case 2: Refresh During Share Suggestion
If user refreshes while share suggestion is pending:
- Frontend fetches `/reconciler/share-offer`
- If status is `PENDING`, it becomes `OFFERED`
- Panel should reappear with suggestion

### Case 3: Validation Before Reconciler Completes
If user tries to validate partner's empathy before reconciler finishes:
- Frontend should wait for `empathy.revealed` event
- Or poll `empathyStatus` until attempt is in `REVEALED` status

### Case 4: Share Suggestion Without suggestedContent
**Issue discovered during debugging**: If `generateShareSuggestion` fails to find the `ReconcilerResult` (race condition), the `suggestedContent` will be null. The fix includes:
- Retry logic (3 attempts with 100ms delay) in `generateShareSuggestion`
- Frontend fallback to display `offerMessage` if `suggestedContent` is missing

### Case 5: User Responds Before Fetching Share Offer
If user accepts/declines before the GET endpoint marks offer as `OFFERED`:
- `respondToShareSuggestion` accepts both `PENDING` and `OFFERED` status
- Marks as `OFFERED` before processing for proper audit trail

## Debugging Tips

### Analyze Session State
Use the diagnostic script to get a complete view of a session:
```bash
cd backend
npx ts-node src/scripts/analyze-session.ts <sessionId>
```

This shows:
- Participant info
- Stage progress for each user
- Empathy drafts and attempts
- Reconciler results and share offers
- Chronological timeline of all events
- Potential issues detected

### Check Reconciler Logs
Look for these key log messages:
- `[Reconciler] Running asymmetric reconciliation` - Start of analysis
- `[Reconciler] Outcome analysis: severity=X, action=Y` - Decision made
- `[Reconciler] Share suggestion generated` - Suggestion created
- `[Reconciler] CRITICAL: Could not find reconcilerResult` - Race condition error

### Frontend Cache Issues
If UI doesn't update after Ably events:
- Check that `empathy.revealed` handler invalidates `empathyStatus`
- Verify `shareOffer` query is invalidated after `empathy.share_suggestion`
- Use React Query DevTools to inspect cache state
