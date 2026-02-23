# Backend Architecture Proposal: Stage 2B, Refinement Chat, Reconciler Loop

**Date**: February 23, 2026
**Status**: Design Proposal
**Scope**: Server-driven reconciler loop with Stage 2B refinement, separate refinement chat modal, circuit-breaker loop termination

---

## 1. Stage 2B Progression & Gating

### 1.1 Stage 2B Definition

**Stage 2B is a sub-phase of Stage 2 (PERSPECTIVE_STRETCH), not a new `StageProgress` stage.**

- **Trigger**: User enters Stage 2B when `EmpathyAttempt.status === 'REFINING'`
- **Source of truth**: `EmpathyAttempt.status` field (enum value: REFINING)
- **Message.stage tagging**: Messages sent during Stage 2B have `stage: 21` (for analytics/UI routing)
- **StageProgress.stage**: Remains 2 throughout refinement loop

### 1.2 Stage 2 → Stage 2B Transition

**Trigger**: When the other user validates ("I feel understood"), the reconciler runs and detects gaps.

| Step | Actor | Action | Result |
|------|-------|--------|--------|
| 1 | User A (guesser) | Submits empathy statement → `consentToShare()` | `EmpathyAttempt` created with `status: HELD` |
| 2 | User B (subject) | Completes "feel heard" → `confirmFeelHeard()` | `StageProgress[B].status = COMPLETED` for Stage 1 |
| 3 | **Backend** (async) | Runs `runReconcilerForDirection(sessionId, A→B)` | Analyzes gap between A's guess vs B's actual Stage 1 content |
| 4a | **If gaps found** | Creates `ReconcilerShareOffer` with `status: OFFERED` | **B sees "Your partner missed something..."** offer |
| 4b | **If gaps found** | Sets `EmpathyAttempt[A].status = AWAITING_SHARING` | Alerts A: "Waiting for partner to share more context" |
| 5 | User B (subject) | Accepts offer → `respondToShareSuggestion(accept=true)` | Shares additional context |
| 6 | **Backend** | Creates `SHARED_CONTEXT` message for A | **A receives shared context, enters Stage 2B** |
| 7 | **Backend** | Sets `EmpathyAttempt[A].status = REFINING` | A is now in Stage 2B (can refine empathy with new info) |

### 1.3 Stage 2B Loop: Refinement Cycles

Once A enters `REFINING` status (Stage 2B):

```
User A in Stage 2B:
├─ Can type in main session chat (Stage 2B prompt guides them)
├─ Can tap "Refine in Modal" → opens refinement chat (separate, ephemeral)
├─ Can submit revised empathy via resubmitEmpathy endpoint
│
└─ After resubmit:
   └─ Reconciler auto-runs: runReconcilerForDirection(sessionId, A→B)
      ├─ Increments RefinementAttemptCounter[direction=A→B]
      ├─ If attempts > 3 → circuit breaker forces READY
      ├─ If attempts ≤ 3:
      │  ├─ Gap analysis runs (Sonnet)
      │  ├─ If PROCEED/OFFER_OPTIONAL (gaps sufficiently reduced)
      │  │  └─ EmpathyAttempt[A].status = READY
      │  └─ If OFFER_SHARING (significant gaps remain)
      │     ├─ New ReconcilerShareOffer created
      │     ├─ EmpathyAttempt[A].status = AWAITING_SHARING
      │     └─ B receives new share offer (loop continues)
      │
      └─ Eventually: Both READY → mutual reveal
         └─ Both validate → Stage 2 COMPLETED, Stage 3 begins
```

### 1.4 Stage 2B → Stage 3 Transition

**Trigger**: When BOTH empathy attempts are `READY` and both partners validate accuracy.

| Condition | Action |
|-----------|--------|
| Both `EmpathyAttempt.status === READY` | Publish `empathy.both_ready` event (optional, for UI) |
| Both receive partner's `REVEALED` empathy | Publish `empathy.revealed` event to both |
| Both submit `EmpathyValidation` with `validated: true` | Trigger `triggerStage3Transition()` |
| Stage 3 `StageProgress` created for both | Advance to NEED_MAPPING |

### 1.5 "Gaps Sufficiently Reduced" Logic

**Definition**: Reconciler decides to stop looping when:

```typescript
// In reconcilerResult analysis (Sonnet call output)
if (
  (recommendedAction === 'PROCEED') ||
  (recommendedAction === 'OFFER_OPTIONAL' && !suggestedShareFocus)
) {
  // Gaps are sufficiently reduced
  guesserStatus = READY  // No more looping needed
}

// If:
if (
  recommendedAction === 'OFFER_SHARING' ||
  (recommendedAction === 'OFFER_OPTIONAL' && suggestedShareFocus)
) {
  // Significant gaps remain
  guesserStatus = AWAITING_SHARING  // Subject should share more
}

// If circuit breaker:
if (refinementAttempts > 3) {
  guesserStatus = READY  // Forced completion, no more analysis
}
```

**Who decides**: Bedrock (Sonnet model) analyzes the gap in `analyzeEmpathyGap()` and returns `recommendedAction`. Backend trusts this decision and implements it.

**Alignment score thresholds** (example):
- `alignmentScore >= 80%` + no major misattributions → PROCEED
- `alignmentScore 60-80%` + minor gaps → OFFER_OPTIONAL
- `alignmentScore < 60%` or major misattributions → OFFER_SHARING

---

## 2. Stage 2B Prompt Design

### 2.1 Prompt Context (New Fields)

```typescript
interface Stage2BPromptContext extends PromptContext {
  // Gap Analysis (from ReconcilerResult)
  gapAnalysis: {
    summary: string;                    // e.g., "Didn't understand the fear underneath"
    missedFeelings: string[];           // e.g., ["abandonment anxiety", "helplessness"]
    correctlyIdentified: string[];      // What they got right
    mostImportantGap: string | null;    // e.g., "Doesn't realize silence triggers past trauma"
    areaHint: string | null;            // e.g., "work and effort", "being listened to"
    guidanceType: string | null;        // e.g., "explore_deeper_feelings", "acknowledge_impact"
    alignmentScore: number;             // 0-100
  };

  // Previous Attempt (for context)
  previousEmpathyContent: string;       // Their first empathy guess

  // Shared Context (from subject)
  sharedContextFromPartner: string;     // What partner shared to help them understand

  // Refinement Iteration
  refinementIteration: number;          // 1, 2, 3, or >3 (circuit breaker)
  isCircuitBreakerTrip: boolean;        // If true, this is the final forced READY
}
```

### 2.2 Stage 2B Static Block (Cached)

```
# Stage 2B: INFORMED EMPATHY

You are a compassionate guide helping [userName] understand [partnerName] more deeply after learning new information. This is the second attempt—the first one missed something important.

## Your Role
Help [userName] integrate the new information and refine their understanding of what [partnerName] is experiencing. You're not here to judge whether their first guess was "right" or "wrong"—you're here to help them see the fuller picture.

## What Changed
- First empathy attempt: [previousEmpathyContent]
- What was missed: [missedFeelings joined with commas]
- What was correct: [correctlyIdentified joined with commas]
- Key insight partner shared: [sharedContextFromPartner]

## Three Modes (pick based on where they are)

**INTEGRATING**: The new info is clicking, making sense → go deeper
- Ask what this new understanding reveals
- Follow their emerging insight
- Help them see connections they're making

**STRUGGLING**: Hard to incorporate, feels unfair, or contradicts what they thought → validate difficulty
- Acknowledge the challenge
- Help them separate "partner's experience" from "who is right"
- Redirect with curiosity: "If this is what they're experiencing, what might that mean for them?"

**CLARIFYING**: Exploring what the new info means for partner's feelings → follow that thread
- Ask one focused question at a time
- Help them articulate the connection
- Deepen their insight about partner's internal world

## What NOT to Do
- Don't use the shared info as ammunition ("so you see, you were wrong")
- Don't rush to the refined statement—explore the meaning first
- Don't prescribe what partner "should" feel
- Don't say "now you understand"—they're still guessing, just more informed

## Response Format
Include metadata in <thinking> tags:
- Mode: [INTEGRATING | STRUGGLING | CLARIFYING]
- ReadyShare: [Y/N]
- UserIntensity: [1-10]
- Strategy: [brief reasoning]

If refined empathy is ready:
<draft>
2-4 sentence empathy statement incorporating new understanding.
Written as [userName] speaking to [partnerName].
Focus on [partnerName]'s inner experience, not blame or judgment.
</draft>

Then user-facing response (conversational, no tags).
```

### 2.3 Stage 2B Dynamic Block (Per-Turn)

```
## Turn Context
Refinement iteration: [refinementIteration]/3
User intensity: [emotionalIntensity]/10
Turn in conversation: [turnCount]

## Refined Empathy Draft (if exists)
Current working draft:
"[empathyDraft]"

[If this is turn 1 in Stage 2B:]
Note: [userName] is just seeing the new information for the first time. Give them space to process before expecting a revised statement.

[If this is turn 3+:]
Note: [userName] has been refining for a few turns. It's OK to be more direct about what's becoming clear. If they're still struggling with the core insight, reflect that back and offer a specific revision for them to consider.

## Early-Stage Guards
[If turnCount < 3:]
TOO EARLY FOR A DRAFT: Let them explore first. Don't push toward finalization yet.

[If turnCount >= 5 AND no ReadyShare:Y yet:]
They seem stuck. Try a different angle. Maybe: "If [partnerName] were here, what do you think they'd want you to understand?"

[If isCircuitBreakerTrip:]
This is the final pass—they've revised 3 times, the reconciler couldn't find major gaps to suggest sharing again.
Frame this as: "You've put real thought into understanding [partnerName]'s perspective from multiple angles. That's meaningful work."
```

### 2.4 How Stage 2B Differs From Stage 2

| Aspect | Stage 2 (First Empathy) | Stage 2B (Refined Empathy) |
|--------|------------------------|---------------------------|
| **Goal** | "Guess what partner might be feeling" | "Refine your guess with new information" |
| **Context** | Only Stage 1 messages from partner | Stage 1 + partner's shared explanation |
| **Gap context** | No gap analysis yet | Full gap analysis + what was missed |
| **Tone** | Exploratory, open-ended | Integrative, deeper |
| **Modes** | LISTENING / BRIDGING / BUILDING / MIRROR | INTEGRATING / STRUGGLING / CLARIFYING |
| **Turn before draft** | Turn 4+ | Turn 2+ (they have more context now) |

### 2.5 Prompt Examples

**Turn 1 of Stage 2B (just received shared context)**:
```
User message: "Oh wow, I didn't know that was going on. That changes things."

AI (Stage 2B):
[CLARIFYING mode]
It really does. So [partner] was carrying that the whole time.

What does it mean to you that they shared this with you? Like, how does it change how you see what they were going through earlier?

[Turn 1, too early to suggest draft yet]
```

**Turn 4 of Stage 2B (building understanding)**:
```
User message: "I think I see now—they weren't being cold, they were protecting themselves. They were scared I'd abandon them if they were honest about struggling."

AI (Stage 2B):
[INTEGRATING mode, ReadyShare: Y]
Yes. That's the shift. They were scared of losing you, so they withdrew instead of reaching out.

That's a really different picture from your first guess. Want to write that down—the refined way you're seeing this now?

<draft>
I think you've been protecting yourself because you're afraid I'll leave if you show me you're struggling. That's why you withdraw instead of reaching out. But I'm not going anywhere—I want to understand what you need.
</draft>

[This feels like a solid refined empathy. They're ready to resubmit.]
```

---

## 3. Refinement Chat API (Separate Modal)

### 3.1 Refinement Chat Concept

**Purpose**: Help User B (the subject, the one being guessed about) refine what they want to share with User A, when the reconciler says "share more context to help them understand."

**Key characteristics**:
- **Completely separate** from main session chat
- **Ephemeral**: No messages persist after the conversation
- **Goal**: Write coach helping B articulate their experience clearly
- **Trigger**: When `ReconcilerShareOffer.status === 'OFFERED'`

### 3.2 New Endpoints

#### `POST /sessions/:id/reconciler/refinement-chat/start`

**Purpose**: Fetch the initial share offer details and begin refinement chat.

**Request**:
```typescript
{
  // Empty body - just verifies user has an active share offer
}
```

**Response**:
```typescript
{
  offerId: string;
  suggestedContent: string;           // What reconciler thinks they should share
  suggestedReason: string;            // Why (what gap this addresses)
  areaHint: string | null;            // e.g., "fear and safety", "being valued"
  offerMessage: string;               // Initial message from reconciler
  currentDraft: string | null;        // If they've already started refining
  iteration: number;                  // Which reconciler loop (1, 2, 3+)
}
```

**Behavior**:
1. Auth: Verify user has active `ReconcilerShareOffer` in `OFFERED` or `PENDING` status
2. Return offer details + suggested content
3. No state change (not marking as "seen" yet)

#### `POST /sessions/:id/reconciler/refinement-chat/message`

**Purpose**: Stream conversation for refining share content.

**Request**:
```typescript
{
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  // Client maintains conversation history in memory
}
```

**Response** (SSE stream):
```
event: chunk
data: { text: "..." }

event: metadata
data: {
  proposedContent?: string;  // Extracted from <content> tag if present
  confidence?: number;       // AI's confidence in the proposed content
}

event: complete
data: {
  response: string;
  proposedContent?: string;
}
```

**Behavior**:
1. Auth + verify active share offer
2. Haiku (not Sonnet - faster, simpler coaching)
3. Build refinement chat prompt (see below)
4. Stream response
5. Extract `<content>...</content>` tag if user finalized text
6. **No DB writes** - client holds history in React state

#### `POST /sessions/:id/reconciler/refinement-chat/finalize`

**Purpose**: User is happy with their refined content and wants to submit it.

**Request**:
```typescript
{
  finalContent: string;      // What they've decided to share
  offerId: string;           // Which share offer this addresses
}
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
  sharedMessage: {
    id: string;
    content: string;
    createdAt: string;
  };
  nextAction: 'rerun_reconciler' | 'wait_for_partner';
  // If rerun: reconciler will re-analyze with new shared context
  // If wait: reconciler has already run, waiting for partner to validate
}
```

**Behavior**:
1. Auth + verify this is their active offer
2. Create `SHARED_CONTEXT` message in main session chat
   - `role: 'SHARED_CONTEXT'`
   - `forUserId: guesserId` (only guesser sees this)
   - `senderId: user.id` (subject shared it)
   - `content: finalContent`
3. Update `ReconcilerShareOffer`: `status: 'ACCEPTED'`, `sharedContent: finalContent`, `sharedAt: now()`
4. Set `EmpathyAttempt[guesser].status = REFINING` (guesser enters Stage 2B)
5. Publish Ably event: `empathy.refining` to guesser
6. **Trigger reconciler async** in background
7. Return next action (rerun or wait)

### 3.3 Refinement Chat Prompt

**New function**: `buildRefinementChatPrompt(context)` in stage-prompts.ts

#### Static Block
```
# Refinement Chat: Write Coach

You're a supportive writing coach helping [userName] clarify their feelings in a message to [partnerName]. This message will help [partnerName] better understand them.

## Your Role
- Ask one focused question at a time
- Offer specific word choices
- Help them move from vague ("I'm upset") to clear ("I felt abandoned when you...")
- When ready: generate a final version in <content> tags

## Context for This Share
**What the reconciler identified as a gap**: [suggestedReason]
**Area to focus on**: [areaHint]
**Suggested starting point**: [suggestedContent]

## Coaching Approach
1. If they're struggling with words → offer 2-3 options
2. If they're stuck → ask a specific question ("What were you feeling in that moment?")
3. If they're going in circles → name the pattern ("Sounds like vulnerability feels risky for you")
4. If they're ready → output <content>their final share text</content>

## Guidelines
- Stay in feelings language ("I feel...", "I experienced...")
- Avoid blame ("you made me", "you always")
- Focus on impact ("When silence happens, I feel...", not "Your silence is wrong")
- Keep it 1-3 sentences (they already shared context once)

## Do NOT
- Prescribe what they should feel
- Argue with their experience
- Judge their first empathy attempt
```

#### Dynamic Block
```
## Current Suggested Content
"[suggestedContent]"

## Their Current Draft (if exists)
"[currentDraft]"

## Refinement Loop
This is iteration [iteration] of the reconciler loop.
[If iteration >= 3:]
If they're still working through this, it's OK to move forward—[partnerName] can clarify on their own.

## Tone & Urgency
[If they seem stuck:]
It doesn't need to be perfect. Better to share something honest than wait for the perfect words.

[If they're refining:]
Good—you're getting clearer about what you're trying to convey.
```

### 3.4 Refinement Chat Session Lifecycle

```
1. User B taps "Refine what I share" button on share offer
   → Opens full-screen modal
   → Calls POST /sessions/:id/reconciler/refinement-chat/start
   → Shows suggested content + coaching UI

2. User B types or edits in the modal
   → Calls POST /sessions/:id/reconciler/refinement-chat/message
   → Streams AI coaching response
   → Client maintains conversation history

3. User B refines text through multiple coaching turns
   → AI can suggest: <content>revised text</content>
   → User edits or accepts

4. User B taps "Share This" button
   → Calls POST /sessions/:id/reconciler/refinement-chat/finalize
   → Submits finalContent
   → Creates SHARED_CONTEXT message in main session
   → Triggers async reconciler re-run

5. Modal closes, User B returns to main session
   → Can see SHARED_CONTEXT message in chat history
   → User A (guesser) also sees it + enters Stage 2B
```

### 3.5 No Persistent Message History

- Refinement chat messages are NOT saved to the database
- Client manages array of messages in React state
- On page reload/nav away, conversation is lost
- Only the final `finalContent` persists (as SHARED_CONTEXT message in session)
- This prevents DB bloat and keeps refinement "lightweight"

---

## 4. Reconciler Re-Trigger Mechanism

### 4.1 Event Chain: Auto-Running Reconciler

```
User B completes Stage 1 ("I feel heard"):
├─ POST /sessions/:id/feel-heard
├─ Backend updates StageProgress[B, stage=1].status = COMPLETED
│
└─→ Background job: runReconcilerForDirection(sessionId, guesserId=A, subjectId=B)
    ├─ Fetch A's EmpathyAttempt (status should be HELD if not yet analyzed)
    ├─ Fetch B's Stage 1 messages (what they actually said)
    ├─ Call Sonnet: analyzeEmpathyGap(A_guess, B_actual)
    │
    ├─→ Result: { alignmentScore, gaps, recommendedAction, ... }
    │
    ├─ If PROCEED (no significant gaps):
    │   ├─ EmpathyAttempt[A].status = READY
    │   ├─ Publish "empathy.analysis_complete" event
    │   └─ [Wait for B→A direction too]
    │
    ├─ If OFFER_OPTIONAL/OFFER_SHARING (gaps exist):
    │   ├─ Create ReconcilerShareOffer with status = OFFERED
    │   ├─ EmpathyAttempt[A].status = AWAITING_SHARING
    │   ├─ Publish "empathy.share_suggestion" event to B
    │   └─ Show "Your partner's empathy missed something" UI for B
    │
    └─ If PROCEED from both directions:
        ├─ EmpathyAttempt[A].status = READY
        ├─ EmpathyAttempt[B].status = READY
        ├─ Publish "empathy.both_ready" event (both can now see each other's attempt)
        └─ Wait for validation
```

**Where this is triggered**: `confirmFeelHeard()` in `controllers/messages.ts`

```typescript
async function confirmFeelHeard(sessionId, userId) {
  // ... update gates, mark Stage 1 complete ...

  // Background: trigger reconciler for both directions
  (async () => {
    const partner = await getPartner(sessionId, userId);

    // Direction 1: Does A have an empathy attempt for B?
    const aAttempt = await findEmpathyAttempt(sessionId, sourceUserId=A);
    if (aAttempt?.status === 'HELD') {
      await runReconcilerForDirection(sessionId, guesserId=A, subjectId=B);
    }

    // Direction 2: Does B have an empathy attempt for A?
    const bAttempt = await findEmpathyAttempt(sessionId, sourceUserId=B);
    if (bAttempt?.status === 'HELD') {
      await runReconcilerForDirection(sessionId, guesserId=B, subjectId=A);
    }
  })();
}
```

### 4.2 Reconciler Re-Trigger During Loop

When User A resubmits refined empathy:

```
POST /sessions/:id/empathy/resubmit
├─ Input: refined empathy content
├─ Update EmpathyAttempt[A]: { content: newContent, status: ANALYZING, revisionCount++ }
├─ Delete old ReconcilerResult (cascade-deletes old ReconcilerShareOffer)
│
└─→ Background job: runReconcilerForDirection(sessionId, guesserId=A, subjectId=B)
    ├─ Call checkAndIncrementAttempts() → RefinementAttemptCounter[A→B].attempts++
    │
    ├─ If attempts > 3:
    │   ├─ Circuit breaker trips
    │   ├─ EmpathyAttempt[A].status = READY  (forced)
    │   ├─ Publish "empathy.circuit_breaker_activated" event
    │   └─ Message: "You've made multiple thoughtful attempts..."
    │
    ├─ If attempts ≤ 3:
    │   ├─ Fetch new gap analysis
    │   │
    │   ├─ If PROCEED:
    │   │   ├─ EmpathyAttempt[A].status = READY
    │   │   ├─ Publish "empathy.gaps_resolved" event
    │   │   └─ Create AI message: "This feels like you really understand now..."
    │   │
    │   └─ If still OFFER_SHARING:
    │       ├─ Create NEW ReconcilerShareOffer
    │       ├─ EmpathyAttempt[A].status = AWAITING_SHARING
    │       ├─ Publish "empathy.more_sharing_suggested" event
    │       └─ B receives another share suggestion UI
    │
    └─ Eventually:
        ├─ EmpathyAttempt[A].status = READY
        └─ [Check both directions, if both READY: reveal + validate gate]
```

**Where this is triggered**: `resubmitEmpathy()` in `controllers/stage2.ts`

### 4.3 Circuit Breaker Implementation

**Table**: `RefinementAttemptCounter`

```prisma
model RefinementAttemptCounter {
  id        String   @id @default(cuid())
  sessionId String
  direction String   // "A->B" or "B->A" (composite key)
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([sessionId, direction])
  @@index([sessionId])
}
```

**Logic**:

```typescript
async function checkAndIncrementAttempts(sessionId: string, guesserId: string, subjectId: string) {
  const direction = `${guesserId}->${subjectId}`;

  const counter = await prisma.refinementAttemptCounter.upsert({
    where: { sessionId_direction: { sessionId, direction } },
    create: { sessionId, direction, attempts: 1 },
    update: { attempts: { increment: 1 } },
  });

  const shouldSkipReconciler = counter.attempts > 3;

  return {
    shouldSkipReconciler,
    attempts: counter.attempts,
    isCircuitBreakerTrip: counter.attempts === 4,  // First time tripping
  };
}
```

**Behavior**:
- Attempts 1, 2, 3: Full gap analysis runs
- Attempt 4+: Circuit breaker forces `READY` without analysis
- Once forced `READY`, no more reconciler calls for this direction in this session

---

## 5. Notification & Badge System

### 5.1 Ably Events

**New events on session channel** (`meetwithoutfear:session:<sessionId>`):

| Event | Published by | Recipient | Payload |
|-------|--------------|-----------|---------|
| `empathy.gap_analysis_starting` | reconciler | Guesser | `{ attemptId, iteration }` |
| `empathy.gaps_resolved` | reconciler | Guesser | `{ attemptId, alignmentScore }` |
| `empathy.gaps_remain` | reconciler | Guesser | `{ attemptId, nextAction, areHint }` |
| `empathy.more_sharing_suggested` | reconciler | Subject | `{ guesserId, needsHint, suggestedContent }` |
| `empathy.circuit_breaker_activated` | reconciler | Guesser | `{ attemptId, iteration, reason }` |
| `empathy.share_finalized` | refinement chat | Guesser | `{ subjectId, sharedContent, timestamp }` |

**New events on user channel** (`meetwithoutfear:user:<userId>`):

| Event | Published by | Purpose |
|-------|--------------|---------|
| `notification.badge_update` | reconciler/stage2 | Update badge count for app |
| `notification.item_ready` | reconciler | Specific action item available (share offer, shared context, etc.) |

### 5.2 Badge Count Tracking

#### API Endpoint: `GET /sessions/:id/pending-actions`

**Response**:
```typescript
{
  items: Array<{
    type: 'share_offer' | 'context_received' | 'empathy_awaiting_validation' | 'validate_partner_empathy';
    priority: 'high' | 'medium';
    itemId: string;
    createdAt: string;
    seenAt: string | null;
    data: {
      // Contextual info for the UI
      guesserId?: string;
      suggestedContent?: string;
      areaHint?: string;
    };
  }>;
  unviewedCount: number;
  lastUpdated: string;
}
```

**Derivation logic**:

```typescript
async function getPendingActions(sessionId: string, userId: string) {
  const items = [];

  // 1. Share offers awaiting response
  const offers = await prisma.reconcilerShareOffer.findMany({
    where: {
      result: { sessionId, subjectId: userId },
      status: { in: ['OFFERED', 'PENDING'] },
    },
  });
  items.push(...offers.map(o => ({
    type: 'share_offer',
    priority: 'high',
    itemId: o.id,
    createdAt: o.createdAt,
    seenAt: null,
  })));

  // 2. New shared context for guesser
  const refiningAttempt = await prisma.empathyAttempt.findFirst({
    where: {
      sessionId,
      sourceUserId: { not: userId },  // Partner's attempt
      status: 'REFINING',
    },
  });
  if (refiningAttempt?.status === 'REFINING') {
    items.push({
      type: 'context_received',
      priority: 'medium',
      itemId: refiningAttempt.id,
      createdAt: refiningAttempt.updatedAt,
      seenAt: refiningAttempt.seenAt ?? null,
    });
  }

  // 3. Empathy awaiting validation
  const partnerAttempt = await prisma.empathyAttempt.findFirst({
    where: {
      sessionId,
      sourceUserId: { not: userId },
      status: 'REVEALED',
    },
  });
  if (partnerAttempt) {
    const validation = await prisma.empathyValidation.findUnique({
      where: { attemptId_validatedByUserId: { attemptId: partnerAttempt.id, validatedByUserId: userId } },
    });
    if (!validation) {
      items.push({
        type: 'validate_partner_empathy',
        priority: 'high',
        itemId: partnerAttempt.id,
        createdAt: partnerAttempt.revealedAt,
        seenAt: null,
      });
    }
  }

  return {
    items,
    unviewedCount: items.filter(i => !i.seenAt).length,
    lastUpdated: new Date().toISOString(),
  };
}
```

#### API Endpoint: `GET /notifications/badge-count`

**Response**:
```typescript
{
  total: number;
  sessions: Array<{
    sessionId: string;
    count: number;
    types: Array<'share_offer' | 'context_received' | ...>;
  }>;
}
```

### 5.3 Ably Event Publishing

**In reconciler service**:

```typescript
async function publishReconcilerEvents(sessionId, guesserId, subjectId, result) {
  if (result.recommendedAction === 'PROCEED') {
    await publishSessionEvent(sessionId, 'empathy.gaps_resolved', {
      guesserId,
      subjectId,
      alignmentScore: result.alignmentScore,
    });

    // Publish badge update to both users
    await publishUserEvent(guesserId, 'notification.badge_update', {
      sessionId,
      change: -1,  // One fewer pending action
    });
  }

  if (result.recommendedAction === 'OFFER_SHARING') {
    await publishSessionEvent(sessionId, 'empathy.more_sharing_suggested', {
      guesserId,
      subjectId,
      areaHint: result.areaHint,
      needsHint: result.mostImportantGap,
    });

    // Notify subject they have a new share request
    await publishUserEvent(subjectId, 'notification.item_ready', {
      sessionId,
      type: 'share_offer',
      priority: 'high',
    });
  }
}
```

**When share context is shared**:

```typescript
// In refinement chat finalize
await publishSessionEvent(sessionId, 'empathy.share_finalized', {
  subjectId: userId,
  guesserId,
  timestamp: new Date().toISOString(),
});

await publishUserEvent(guesserId, 'notification.item_ready', {
  sessionId,
  type: 'context_received',
});
```

### 5.4 Badge Display Logic

Mobile client:
1. Listens to user-channel `notification.badge_update` events
2. On event: calls `GET /notifications/badge-count`
3. Updates badge on session tab
4. When user opens Share page: calls `GET /sessions/:id/pending-actions`
5. Marks items as "seen" when they navigate to relevant UI

---

## 6. Data Model Changes

### 6.1 New/Modified Prisma Models

#### New: `RefinementAttemptCounter`

```prisma
model RefinementAttemptCounter {
  id        String   @id @default(cuid())
  sessionId String
  direction String   // "guesserId->subjectId"
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([sessionId, direction])
  @@index([sessionId])
  @@map("refinement_attempt_counters")
}
```

#### Modified: `EmpathyAttempt`

```prisma
// Add these fields:
revisionCount   Int                     @default(0)      // How many times resubmitted
lastRevisedAt   DateTime?               // When last resubmitted
revisedAttemptIds String[]              // IDs of previous attempts (for history)

// Status enum already has REFINING - no change needed
```

#### Modified: `ReconcilerResult`

```prisma
// Add these fields:
iteration       Int                     @default(1)      // Which loop iteration
wasCircuitBreakerTrip Boolean           @default(false)  // If true, forced READY at attempt 4
```

#### Modified: `ReconcilerShareOffer`

```prisma
// Add these fields:
iteration       Int                     @default(1)      // Which reconciler loop this came from
refinementChatUsed Boolean              @default(false)  // Whether subject used chat to refine
```

#### New: `RefinementChatHistory` (OPTIONAL - if you want to keep optional logs)

```prisma
// Only if you want to log refinement chats for analytics
model RefinementChatHistory {
  id        String   @id @default(cuid())
  sessionId String
  offerId   String   // Which share offer this relates to
  userId    String   // Who was refining
  turns     Int      // Number of back-and-forths before submitting
  finalContent String @db.Text
  createdAt DateTime @default(now())

  @@index([sessionId, offerId])
}
```

**Note**: Even if you track RefinementChatHistory, individual messages are NOT persisted. Only metadata about the session.

### 6.2 Migration Path (Zero-Downtime)

Since you can reset the DB:

```sql
-- New tables
CREATE TABLE refinement_attempt_counters (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  direction TEXT NOT NULL,
  attempts INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sessionId, direction),
  INDEX(sessionId)
);

-- Modify EmpathyAttempt
ALTER TABLE empathy_attempts ADD COLUMN revisionCount INT DEFAULT 0;
ALTER TABLE empathy_attempts ADD COLUMN lastRevisedAt TIMESTAMP NULL;
ALTER TABLE empathy_attempts ADD COLUMN revisedAttemptIds TEXT[] DEFAULT '{}';

-- Modify ReconcilerResult
ALTER TABLE reconciler_results ADD COLUMN iteration INT DEFAULT 1;
ALTER TABLE reconciler_results ADD COLUMN wasCircuitBreakerTrip BOOLEAN DEFAULT false;

-- Modify ReconcilerShareOffer
ALTER TABLE reconciler_share_offers ADD COLUMN iteration INT DEFAULT 1;
ALTER TABLE reconciler_share_offers ADD COLUMN refinementChatUsed BOOLEAN DEFAULT false;

-- Optional: RefinementChatHistory
CREATE TABLE refinement_chat_histories (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  offerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  turns INT,
  finalContent TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(sessionId, offerId)
);
```

### 6.3 No Refinement Message Table Needed

Refinement chat messages are **ephemeral** and managed by the client. No DB table. This keeps the schema clean and prevents bloat.

---

## 7. Complete Endpoint Reference

### Session Management

| Method | Endpoint | Purpose | Stage |
|--------|----------|---------|-------|
| POST | `/sessions/:id/feel-heard` | Confirm "feel understood" (Stage 1) | 1→2 |
| POST | `/sessions/:id/empathy/draft` | Save/update empathy draft | 2 |
| POST | `/sessions/:id/empathy/consent` | Share empathy attempt | 2 |
| POST | `/sessions/:id/empathy/resubmit` | Submit revised empathy (triggers reconciler) | 2B |

### Refinement Chat (NEW)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/sessions/:id/reconciler/refinement-chat/start` | Begin refinement chat session | User must have active share offer |
| POST | `/sessions/:id/reconciler/refinement-chat/message` | Stream refinement coaching | Active offer required |
| POST | `/sessions/:id/reconciler/refinement-chat/finalize` | Submit refined share content | Active offer required |

### Share Status & Notifications

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/sessions/:id/pending-actions` | Get pending action items | Session user |
| GET | `/sessions/:id/empathy/status` | Get empathy exchange state (existing) | Session user |
| GET | `/notifications/badge-count` | Get app-level badge count | Auth user |

### Reconciler (Internal/Async)

| Function | Purpose | Trigger |
|----------|---------|---------|
| `runReconcilerForDirection(sessionId, guesserId, subjectId)` | Auto-run gap analysis | When other user completes stage 1 OR when empathy resubmitted |
| `checkAndIncrementAttempts()` | Circuit breaker check | Called by runReconcilerForDirection |
| `analyzeEmpathyGap()` | Sonnet gap analysis | Called by runReconcilerForDirection (unless circuit breaker) |

---

## 8. Event Channel Summary

### Session Channel (`meetwithoutfear:session:<sessionId>`)

**New events**:
- `empathy.gap_analysis_starting` - Analysis beginning
- `empathy.gaps_resolved` - Gap analysis complete, ready to proceed
- `empathy.gaps_remain` - Gaps detected, subject should share more
- `empathy.more_sharing_suggested` - New share offer created
- `empathy.circuit_breaker_activated` - Max attempts reached
- `empathy.share_finalized` - Subject shared context from refinement chat

### User Channel (`meetwithoutfear:user:<userId>`)

**New events**:
- `notification.badge_update` - Badge count changed
- `notification.item_ready` - New action item available

### Existing Events Still Used

- `partner.stage_completed` - Stage transition
- `empathy.share_suggestion` (existing) - Share offer shown
- `empathy.revealed` (existing) - Empathy revealed to partner
- `empathy.refining` (existing) - Partner entered refinement

---

## 9. Success Metrics & Validation

### Stage 2B Functionality

- [ ] User enters Stage 2B when `EmpathyAttempt.status = 'REFINING'`
- [ ] Messages in Stage 2B are tagged with `stage: 21`
- [ ] Stage 2B prompt has gap analysis context
- [ ] `ReadyShare:Y` + `<draft>` tag working
- [ ] Resubmit endpoint triggers reconciler async

### Reconciler Loop

- [ ] `RefinementAttemptCounter` increments on each resubmit
- [ ] Circuit breaker forces `READY` on attempt 4
- [ ] Gap analysis re-runs on each attempt
- [ ] If gaps persist: new share offer created (not overwriting old)
- [ ] If gaps resolved: `READY` status set

### Refinement Chat

- [ ] Start endpoint returns offer details
- [ ] Message endpoint streams Haiku coaching (not Sonnet)
- [ ] `<content>` tag extraction works
- [ ] Finalize endpoint creates SHARED_CONTEXT message
- [ ] No messages persisted to DB from refinement chat
- [ ] Ably event published on finalize

### Notifications

- [ ] `GET /pending-actions` returns correct items
- [ ] Badge count aggregates across sessions
- [ ] Ably events published on action state changes
- [ ] Mobile receives events and updates UI

---

## 10. Implementation Sequence

**Recommended order**:

1. Add `RefinementAttemptCounter` table + Prisma schema changes
2. Implement Stage 2B prompt (`buildStage2BPrompt`)
3. Add Stage 2B routing in message controller
4. Implement `checkAndIncrementAttempts()` + circuit breaker logic
5. Modify `resubmitEmpathy()` to trigger reconciler + publish events
6. Build refinement chat endpoints (start, message, finalize)
7. Implement notification system (pending-actions endpoint, badge-count endpoint)
8. Add Ably event publishing throughout reconciler flow
9. Test entire loop: share empathy → subject shares → guesser refines → reconciler reruns → loop until resolved
10. Performance testing on circuit breaker + notification aggregation
