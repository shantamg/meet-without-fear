# Accuracy Feedback Flow

This document describes how users validate their partner's empathy attempt, including the UI component behavior and API interactions.

## Overview

After a user's empathy attempt is **REVEALED** to their partner (the subject), the subject can provide feedback on how accurately the guesser's attempt resonates with their actual feelings. This feedback determines whether the guesser needs to revise their empathy attempt.

## When Accuracy Feedback Appears

The accuracy feedback panel should appear when:
1. Partner's empathy status is `REVEALED` (not yet validated)
2. Current user is the "subject" (the one whose perspective the partner attempted to imagine)
3. No share suggestion panel is pending
4. User hasn't already submitted validation

```mermaid
flowchart TB
    A[Partner empathy status?] --> B{REVEALED?}
    B -->|No| C[Don't show panel]
    B -->|Yes| D{Am I the subject?}
    D -->|No| C
    D -->|Yes| E{Already validated?}
    E -->|Yes| C
    E -->|No| F[Show Accuracy Feedback Panel]
```

## UI Components

### Panel Location

The accuracy feedback panel should appear **above the chat input**, not at the bottom of the screen. It follows the panel priority system:

```
┌─────────────────────────────────────┐
│           Chat Messages             │
│                                     │
│    [Partner's message]              │
│              [My message]           │
│    [AI message]                     │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │  Accuracy Feedback Panel    │   │  ← Panel area (above input)
│  │  [Partner name]'s           │   │
│  │  attempt to imagine         │   │
│  │  how you feel:              │   │
│  │  "Empathy statement..."     │   │
│  │                             │   │
│  │  How accurate is this?      │   │
│  │  [✓ Accurate] [~ Partial]   │   │
│  │  [✗ Inaccurate]             │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Chat input box]                   │  ← Input area
└─────────────────────────────────────┘
```

### Panel Content

```mermaid
flowchart TB
    subgraph Panel["Accuracy Feedback Panel"]
        Title["[Partner]'s attempt to imagine how you feel:"]
        Statement["Empathy statement text"]
        Question["How accurate is this?"]

        subgraph Buttons["Rating Buttons"]
            Accurate["✓ Accurate"]
            Partial["~ Partially"]
            Inaccurate["✗ Not quite"]
        end
    end

    Title --> Statement --> Question --> Buttons
```

## User Interaction Flow

```mermaid
sequenceDiagram
    participant User as Subject (Validator)
    participant Panel as Accuracy Panel
    participant API as Backend
    participant Partner as Partner (Guesser)

    Note over User: Sees partner's REVEALED empathy

    User->>Panel: Views empathy statement

    alt Accurate
        User->>Panel: Taps "Accurate"
        Panel->>API: POST /empathy/validate<br/>{validated: true, rating: "accurate"}
        API->>API: Status → VALIDATED
        API-->>Panel: Success
        Panel->>User: Shows confirmation
        Note over User,Partner: Both proceed to Stage 3
    else Partially Accurate
        User->>Panel: Taps "Partially"
        Panel->>User: Shows feedback input (optional)
        User->>Panel: Adds feedback (optional)
        Panel->>API: POST /empathy/validate<br/>{validated: true, rating: "partially_accurate"}
        API->>API: Status → VALIDATED
        API-->>Panel: Success
    else Inaccurate
        User->>Panel: Taps "Not quite"
        Panel->>User: Shows input for initial thoughts
        User->>Panel: Submits initial thoughts
        Panel->>User: Closes panel, opens Chat
        Note over User: Enters Refinement Chat (Subject)
        
        User->>AI: Chat to refine feedback
        AI->>User: Helps craft constructive feedback
        User->>AI: Approves final feedback message
        
        AI->>API: POST /empathy/validate<br/>{validated: false, rating: "inaccurate", feedback: "final message"}
        API->>Partner: Notify "Partner shared feedback"
        
        Note over Partner: Enters Refinement Chat (Guesser)
        alt Refines
            Partner->>API: Resubmits revised empathy
            API->>User: Shows new empathy for validation
        else Declines to change
            Note over Partner: AI asks: "Are you willing to accept<br/>this as their experience?"
            alt Yes (Accepts experience but won't change words)
                Partner->>API: POST /empathy/skip-refinement<br/>{willingToAccept: true}
                API->>User: Notify "Partner accepts your experience"
                Note over User,Partner: Proceed to Stage 3
            else No (Does not accept)
                Partner->>AI: "No, because..."
                AI->>Partner: "Why?" (Collects reason)
                Partner->>API: POST /empathy/skip-refinement<br/>{willingToAccept: false, reason: "..."}
                API->>User: Notify "Moving to next stage"
                Note over User,Partner: Proceed to Stage 3 (Unresolved)
            end
        end
    end
```

## AI Feedback Coach (Subject's Experience)
This flow mirrors the **Reconciler Share Suggestion** flow...

[... standard feedback coach details ...]

## Acceptance Check (Guesser's Experience)
If the Guesser cannot/will not refine their statement to match the Subject's feedback:
1. **AI Presentation**: "You said [Original], and they say [Feedback]. With this adjustment, they say their experience is accurately reflected."
2. **The Question**: "Are you willing to accept this as their experience?"
3. **Outcomes**:
    - **Yes**: "I accept that is their experience (even if I see it differently)." -> **Proceed**.
    - **No**: "I cannot accept that is their experience." -> AI asks **Why?** -> User answers -> **Proceed** (with disagreement logged).

## API Contract

### POST /sessions/:id/empathy/validate

**Request:**
```typescript
{
  validated: boolean;              // Overall validation (true for accurate/partial)
  rating: 'accurate' | 'partially_accurate' | 'inaccurate';
  feedback?: string;               // Optional for accurate/partial, required for inaccurate
}
```

**Response:**
```typescript
{
  success: true;
  myAttemptStatus: string;         // Current user's empathy status
  partnerValidated: boolean;       // Whether partner has validated current user's empathy
}
```

## State Transitions

### EmpathyAttempt Status

| Current Status | Validation Result | New Status |
|---------------|-------------------|------------|
| REVEALED | Accurate | VALIDATED |
| REVEALED | Partially accurate | VALIDATED |
| REVEALED | Inaccurate | NEEDS_WORK |

### What Happens Next

| New Status | For Subject | For Guesser |
|------------|-------------|-------------|
| VALIDATED | Panel closes, can proceed | Can proceed to Stage 3 |
| NEEDS_WORK | Panel closes | Sees refinement prompt, must revise |

## Frontend Implementation

### Query Dependencies

```typescript
// Fetch partner's empathy for validation
const { data: partnerEmpathy } = useQuery({
  queryKey: ['partnerEmpathy', sessionId],
  queryFn: () => api.getPartnerEmpathy(sessionId),
  enabled: !!sessionId,
});

// Check if validation panel should show
const shouldShowValidationPanel =
  partnerEmpathy?.status === 'REVEALED' &&
  !partnerEmpathy?.validation?.validatedAt;
```

### Cache Invalidation

After validation:
```typescript
queryClient.invalidateQueries(['partnerEmpathy', sessionId]);
queryClient.invalidateQueries(['empathyStatus', sessionId]);
```

### Panel Visibility Logic

```typescript
// In panel priority calculation
const panels = [
  { show: showCompactAgreementBar, priority: 1, component: CompactAgreementBar },
  { show: showInvitationPanel, priority: 2, component: InvitationPanel },
  { show: showFeelHeardPanel, priority: 3, component: FeelHeardPanel },
  { show: showShareSuggestionPanel, priority: 4, component: ShareSuggestionPanel },
  { show: shouldShowValidationPanel, priority: 5, component: AccuracyFeedbackPanel }, // <-- Here
  { show: showEmpathyPanel, priority: 6, component: EmpathyStatementPanel },
  { show: showWaitingBanner, priority: 7, component: WaitingBanner },
];

const activePanel = panels
  .filter(p => p.show)
  .sort((a, b) => a.priority - b.priority)[0];
```

## Known Issues

### Issue: Panel Position
**Problem:** Panel appears at bottom of screen instead of above chat input
**Expected:** Panel should be in the `AboveInputPanel` slot, same as other panels
**Fix:** Ensure `AccuracyFeedbackPanel` is rendered in the panel area, not as a separate absolute-positioned component

### Issue: Non-functional Buttons
**Problem:** Rating buttons don't trigger API calls
**Expected:** Tapping a button should call `POST /empathy/validate`
**Fix:** Connect button onPress handlers to mutation function

## Debugging

### Check if partner empathy is available
```typescript
// In React Query DevTools or console
queryClient.getQueryData(['partnerEmpathy', sessionId])
```

### Verify empathy status
```bash
cd backend
npx ts-node src/scripts/analyze-session.ts <sessionId>
```
Look for:
- Partner's empathy attempt status (should be `REVEALED`)
- Validation records (should be empty if not yet validated)
