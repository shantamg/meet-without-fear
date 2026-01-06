# Needs Assessment ("Am I OK?") Implementation Plan

## Overview

A structured self-assessment system that helps users understand which of their 19 core human needs are met, partially met, or unmet. This data becomes the foundation for cross-feature intelligence.

## The 19 Needs Framework

### Category 1: Foundation & Survival (4 needs)
1. **Physical Safety** - Feel physically safe in body and environment
2. **Health & Physical Care** - Basic health needs reasonably supported
3. **Rest & Restoration** - Getting sufficient rest and recovery
4. **Material Security** - Basic material needs are stable

### Category 2: Emotional & Psychological (4 needs)
5. **Emotional Safety** - Can feel emotions without fear of punishment
6. **Self-Compassion** - Treating yourself with kindness
7. **Regulation & Calm** - Experiencing emotional steadiness
8. **Agency / Autonomy** - Having meaningful choice in life

### Category 3: Relational (4 needs)
9. **Being Seen & Understood** - Feeling genuinely understood
10. **Belonging** - Feeling you fit somewhere
11. **Trust** - Relationships where you can rely on others
12. **Contribution** - Meaningfully contributing to others

### Category 4: Integration & Meaning (4 needs)
13. **Purpose / Meaning** - Life has direction or significance
14. **Learning & Growth** - Growing in ways that matter
15. **Integrity / Alignment** - Living aligned with values
16. **Hope** - Sense of possibility about the future

### Category 5: Transcendence (3 needs)
17. **Presence** - Experience of being fully here
18. **Gratitude / Sufficiency** - Feeling "I have enough"
19. **Connection to Something Larger** - Nature, spirit, humanity, larger whole

## Scoring System

- **0** = Not met at all (Red)
- **1** = Somewhat met (Yellow)
- **2** = Fully met (Green)

---

## Database Schema

### New Tables

```prisma
// Reference table for the 19 needs (seeded data)
model Need {
  id          Int      @id
  name        String   // "Physical Safety"
  slug        String   @unique // "physical-safety"
  description String   // Full question text
  category    NeedCategory
  order       Int      // Display order within category

  scores      NeedScore[]
}

enum NeedCategory {
  FOUNDATION
  EMOTIONAL
  RELATIONAL
  INTEGRATION
  TRANSCENDENCE
}

// User's scores over time
model NeedScore {
  id            String   @id @default(cuid())
  userId        String
  needId        Int
  score         Int      // 0, 1, or 2
  clarification String?  // Optional user notes
  createdAt     DateTime @default(now())

  user          User     @relation(fields: [userId], references: [id])
  need          Need     @relation(fields: [needId], references: [id])

  @@index([userId, needId])
  @@index([userId, createdAt])
}

// Track baseline completion and check-in preferences
model NeedsAssessmentState {
  id                    String   @id @default(cuid())
  userId                String   @unique
  baselineCompleted     Boolean  @default(false)
  baselineCompletedAt   DateTime?
  checkInFrequencyDays  Int      @default(7) // 1-10 days
  lastCheckInNeedId     Int?     // Which need was last checked
  nextCheckInAt         DateTime?

  user                  User     @relation(fields: [userId], references: [id])
}
```

### Seed Data

Create migration to seed the 19 needs with their descriptions:

```typescript
const needs = [
  { id: 1, name: "Physical Safety", slug: "physical-safety",
    description: "Do you feel physically safe in your body and environment?",
    category: "FOUNDATION", order: 1 },
  { id: 2, name: "Health & Physical Care", slug: "health-physical-care",
    description: "Are your basic health needs reasonably supported?",
    category: "FOUNDATION", order: 2 },
  // ... all 19
];
```

---

## API Endpoints

### Needs Reference
```
GET /api/v1/needs
Response: { needs: Need[] }
```
Returns all 19 needs with categories for UI rendering.

### Assessment State
```
GET /api/v1/needs/state
Response: {
  baselineCompleted: boolean,
  baselineCompletedAt?: string,
  checkInFrequencyDays: number,
  currentScores: { needId: number, score: number, updatedAt: string }[],
  nextCheckInNeed?: Need,
  nextCheckInAt?: string
}
```
Returns user's current assessment state and latest scores.

### Initial Baseline Assessment
```
POST /api/v1/needs/baseline
Body: { scores: { needId: number, score: number, clarification?: string }[] }
Response: { success: boolean, summary: NeedsSummary }
```
Saves all 19 scores at once after initial assessment.

### Individual Need Check-in
```
POST /api/v1/needs/:needId/check-in
Body: { score: number, clarification?: string }
Response: { success: boolean, previousScore?: number, trend: 'up' | 'down' | 'stable' }
```
Updates a single need score during rotating check-ins.

### Score History
```
GET /api/v1/needs/:needId/history
Query: { limit?: number }
Response: { history: { score: number, clarification?: string, createdAt: string }[] }
```
Returns score history for a single need.

### Update Preferences
```
PATCH /api/v1/needs/preferences
Body: { checkInFrequencyDays?: number }
Response: { success: boolean }
```

---

## User Flows

### Flow 1: Initial Baseline Assessment

**When:** First time user opens "Am I OK?"

**UI Components:**
1. **Welcome Screen** - Explains the 19 needs framework, ~10-15 min estimate
2. **Assessment Screen** - Steps through each need:
   - Category header (e.g., "Foundation & Survival")
   - Need name and question
   - Three radio options: Not met / Somewhat met / Fully met
   - Optional clarification text input
   - Progress indicator (e.g., "5 of 19")
   - Previous / Next / Pause buttons
3. **Completion Screen** - Summary with category breakdown

**Mobile Implementation:**
```
NeedsAssessmentScreen
├── WelcomeView (first time only)
├── AssessmentView
│   ├── CategoryHeader
│   ├── NeedQuestion
│   ├── ScoreRadioGroup
│   ├── ClarificationInput (collapsible)
│   └── NavigationButtons
├── PausedView (if user pauses)
└── CompletionView
    └── NeedsSummary (category breakdown)
```

**State Management:**
- Track current need index locally
- Save progress periodically (every 5 needs or on pause)
- Allow resume if user leaves mid-assessment

### Flow 2: Needs Wheel Dashboard

**When:** After baseline completed, user opens "Am I OK?"

**UI Components:**
1. **Needs Wheel** - Circular visualization with 19 segments
   - Color-coded by score (red/yellow/green)
   - Tap segment to see details
   - Time filter: Now / 1 Month / 3 Months
2. **Category Summary** - Count of needs by score level
3. **Quick Actions:**
   - "Check In Now" - Start a check-in conversation
   - "View History" - Detailed timeline

**Visualization Options:**
- Use `react-native-svg` for custom wheel
- Or `victory-native` for charting
- Consider accessibility: provide text alternative view

### Flow 3: Rotating Check-in Conversation

**When:** User opens "Check In Now" or notification triggers

**Logic for selecting next need:**
1. Find needs not checked in longest (by `lastReviewedAt`)
2. Prioritize low-scoring needs (0 or 1) if multiple are stale
3. But still cycle through high-scoring needs to celebrate what's working
4. User can override: "I want to talk about [different need]"

**Conversation Pattern (AI-guided):**
```
AI: "Let's check in on [Need Name]. You marked it as [score] [X days] ago.
     [Previous clarification if any]
     How does it feel now? Has anything shifted?"

[User responds freely in chat]

AI: [Validates, explores, asks follow-ups based on score level]
    - Low score (0-1): Lead with validation, explore gently
    - High score (2): Celebrate what's working

AI: "Based on what you've shared, does [previous score] still feel accurate,
     or has it moved?"

[User confirms or updates score]

[Score saved with timestamp and conversation summary as clarification]
```

**Implementation:**
- Can reuse existing chat interface
- Create `buildNeedsCheckInPrompt()` in stage-prompts.ts
- Score update happens via special message type or inline UI

---

## Prompt Engineering

### Check-in Conversation Prompt

```typescript
function buildNeedsCheckInPrompt(params: {
  need: Need;
  currentScore: number;
  previousClarification?: string;
  scoreHistory: { score: number; date: string }[];
  // Cross-feature context (Phase 2)
  relatedConflicts?: string[];
  relatedGratitudes?: string[];
}): string {
  return `
You are conducting a needs check-in within Inner Work.

NEED: ${params.need.name}
CATEGORY: ${params.need.category}
QUESTION: ${params.need.description}

CURRENT SCORE: ${params.currentScore} (${scoreLabel(params.currentScore)})
LAST CHECKED: ${params.scoreHistory[0]?.date || 'Never'}
${params.previousClarification ? `PREVIOUS NOTES: ${params.previousClarification}` : ''}

SCORE TREND: ${describeTrend(params.scoreHistory)}

YOUR APPROACH:
${params.currentScore === 0 ? `
- This need is NOT MET. Lead with validation and empathy.
- Acknowledge how hard it is to have this need unmet.
- Explore gently: "What would it take for this to feel even slightly more met?"
- Don't try to fix or solve.
` : params.currentScore === 1 ? `
- This need is SOMEWHAT MET. Explore the nuance.
- What's working? What's still missing?
- Is there movement toward more met or less met?
` : `
- This need is FULLY MET. Celebrate and explore.
- What's supporting this sense of fulfillment?
- Help them appreciate what's working.
`}

CONVERSATION FLOW:
1. Open with reflection on their current score and any previous notes
2. Ask how it feels now - has anything shifted?
3. Listen and reflect, using therapeutic techniques
4. When appropriate, ask if the score still feels accurate
5. Accept their updated score without judgment

OUTPUT FORMAT:
Respond conversationally. When user indicates they're ready to update score,
acknowledge and confirm the new score.
`;
}
```

---

## Mobile Implementation

### New Files

```
mobile/src/
├── screens/
│   ├── NeedsAssessmentScreen.tsx      # Baseline assessment flow
│   ├── NeedsWheelScreen.tsx           # Dashboard with wheel visualization
│   └── NeedsCheckInScreen.tsx         # Chat-based check-in
├── components/
│   └── needs/
│       ├── NeedsWheel.tsx             # SVG wheel visualization
│       ├── NeedScoreSelector.tsx      # Radio group for 0/1/2
│       ├── NeedCard.tsx               # Individual need display
│       └── NeedsSummary.tsx           # Category breakdown
└── hooks/
    └── useNeeds.ts                    # React Query hooks
```

### Hooks

```typescript
// useNeeds.ts
export function useNeeds() {
  return useQuery(['needs'], fetchNeeds);
}

export function useNeedsState() {
  return useQuery(['needs', 'state'], fetchNeedsState);
}

export function useSubmitBaseline() {
  return useMutation(submitBaseline, {
    onSuccess: () => queryClient.invalidateQueries(['needs'])
  });
}

export function useCheckInNeed() {
  return useMutation(checkInNeed, {
    onSuccess: () => queryClient.invalidateQueries(['needs'])
  });
}

export function useNeedHistory(needId: number) {
  return useQuery(['needs', needId, 'history'], () => fetchNeedHistory(needId));
}
```

---

## Backend Implementation

### New Files

```
backend/src/
├── controllers/
│   └── needs.ts                       # All needs endpoints
├── services/
│   └── needs-check-in.ts              # Check-in conversation logic
└── routes/
    └── needs.ts                       # Route definitions
```

### Controller Structure

```typescript
// controllers/needs.ts
export async function getNeeds(req, res) { /* Return all 19 needs */ }
export async function getNeedsState(req, res) { /* Return user's state + scores */ }
export async function submitBaseline(req, res) { /* Save 19 scores */ }
export async function checkInNeed(req, res) { /* Update single need */ }
export async function getNeedHistory(req, res) { /* Return score history */ }
export async function updatePreferences(req, res) { /* Update check-in frequency */ }

// Chat-based check-in (reuses chat infrastructure)
export async function startNeedsCheckIn(req, res) { /* Start check-in chat */ }
export async function sendNeedsCheckInMessage(req, res) { /* Process message */ }
```

---

## Integration Points

### With Existing Memory System
- When user completes baseline, optionally create a memory: "Completed needs assessment"
- Low-scoring needs could trigger memory suggestions: "Would you like to remember that trust feels unmet right now?"

### With Inner Thoughts (Talk it Out)
- If user discusses a need in Inner Thoughts, AI can reference their score
- "I notice you're talking about trust. You marked that as 'not met' - is that still accurate?"

### With Partner Sessions (Future)
- Needs scores inform mediation approach
- AI knows which needs are vulnerable for this user

### With Gratitude (When Built)
- Connect gratitudes to needs being met
- "This gratitude touches on your belonging need"

---

## Testing Strategy

### Unit Tests
- Score validation (only 0, 1, 2 allowed)
- Need rotation logic (selects correct next need)
- Trend calculation (up/down/stable)

### Integration Tests
- Baseline submission saves all 19 scores
- Check-in updates correct need
- History returns chronologically

### E2E Tests
- Complete baseline assessment flow
- Check-in conversation updates score
- Wheel visualization reflects current scores

---

## Implementation Phases

### Phase 1: Core Data Model (1-2 days)
- [ ] Create Prisma schema for Need, NeedScore, NeedsAssessmentState
- [ ] Create and run migration
- [ ] Seed 19 needs with descriptions
- [ ] Add relations to User model

### Phase 2: API Endpoints (1-2 days)
- [ ] Implement all endpoints in controllers/needs.ts
- [ ] Add route definitions
- [ ] Create Zod validation schemas in shared/
- [ ] Test with Postman/curl

### Phase 3: Mobile - Baseline Assessment (2-3 days)
- [ ] Create NeedsAssessmentScreen
- [ ] Build NeedScoreSelector component
- [ ] Implement progress tracking
- [ ] Handle pause/resume
- [ ] Create completion summary

### Phase 4: Mobile - Needs Wheel Dashboard (2-3 days)
- [ ] Create NeedsWheelScreen
- [ ] Build NeedsWheel SVG component
- [ ] Implement time filtering
- [ ] Add need detail view on tap
- [ ] Create accessible text alternative

### Phase 5: Check-in Conversations (2-3 days)
- [ ] Create buildNeedsCheckInPrompt() in stage-prompts.ts
- [ ] Create NeedsCheckInScreen (chat interface)
- [ ] Implement score update within conversation
- [ ] Add need selection/override option

### Phase 6: Notifications (1 day)
- [ ] Add check-in reminder logic
- [ ] Implement push notification trigger
- [ ] Respect quiet hours

---

## Open Questions

1. **Inline vs. Chat Check-in?**
   - Spec shows conversational check-ins
   - Could also offer quick "just update the score" option
   - Recommendation: Offer both - quick update OR start conversation

2. **Score Update UI in Chat**
   - How does user confirm new score during conversation?
   - Option A: Special message type with score buttons
   - Option B: AI asks, user types, AI confirms
   - Recommendation: Option A for clarity

3. **Baseline Pacing**
   - Spec suggests breaks after 5 minutes
   - Should we enforce or just offer?
   - Recommendation: Offer after every 5 needs, don't force

4. **History Granularity**
   - How much score history to keep?
   - Recommendation: Keep all scores indefinitely, but limit UI display

---

[Back to Inner Work Plans](./index.md)
