# Gratitude Practice ("See the Positive") Implementation Plan

## Overview

A gratitude journaling feature that helps users notice what's good without bypassing what's hard. Unlike toxic positivity apps, this adapts to the user's emotional state and holds space for difficulty alongside appreciation.

## Core Philosophy

- **Not forced positivity** - Doesn't push gratitude when user is struggling
- **Holds space for pain** - Can appreciate something while acknowledging difficulty
- **Needs-aware prompts** - Adapts based on needs assessment scores (when available)
- **Pattern recognition** - Notices themes over time ("you often mention nature...")
- **Connection to needs** - Links gratitudes to which needs they touch

---

## Database Schema

### New Tables

```prisma
model GratitudeEntry {
  id            String   @id @default(cuid())
  userId        String
  content       String   // The gratitude text
  voiceRecorded Boolean  @default(false)
  createdAt     DateTime @default(now())

  // AI-extracted metadata (populated async)
  extractedPeople     String[] @default([])
  extractedPlaces     String[] @default([])
  extractedActivities String[] @default([])
  extractedEmotions   String[] @default([])
  extractedThemes     String[] @default([])

  // Connections
  linkedNeedIds       Int[]    @default([]) // Which needs this touches
  linkedConflictId    String?  // If mentioned an active conflict
  sentimentScore      Float?   // -1 to 1, for trend tracking

  // Embedding for semantic search
  embedding           Unsupported("vector(1024)")?

  user                User     @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}

// User preferences for gratitude practice
model GratitudePreferences {
  id              String   @id @default(cuid())
  userId          String   @unique
  enabled         Boolean  @default(true)
  frequency       Int      @default(1)      // 0-3 times per day
  preferredTimes  String[] @default(["20:00"]) // Array of HH:MM
  weekdayOnly     Boolean  @default(false)
  quietHoursStart String?  // HH:MM
  quietHoursEnd   String?  // HH:MM

  user            User     @relation(fields: [userId], references: [id])
}
```

---

## API Endpoints

### Entries

```
POST /api/v1/gratitude
Body: { content: string, voiceRecorded?: boolean }
Response: {
  entry: GratitudeEntryDTO,
  aiResponse?: string  // Optional AI acknowledgment
}
```
Creates a new gratitude entry. Triggers async metadata extraction.

```
GET /api/v1/gratitude
Query: { limit?: number, offset?: number, startDate?: string, endDate?: string }
Response: {
  entries: GratitudeEntryDTO[],
  total: number,
  hasMore: boolean
}
```
Lists entries with pagination and date filtering.

```
GET /api/v1/gratitude/:id
Response: { entry: GratitudeEntryDTO }
```
Gets single entry with full metadata.

```
DELETE /api/v1/gratitude/:id
Response: { success: boolean }
```
Deletes an entry.

### Patterns & Insights

```
GET /api/v1/gratitude/patterns
Query: { period?: '7d' | '30d' | '90d' | 'all' }
Response: {
  topPeople: { name: string, count: number }[],
  topPlaces: { name: string, count: number }[],
  topActivities: { name: string, count: number }[],
  topThemes: { theme: string, count: number }[],
  needsConnections: { needId: number, count: number }[],
  sentimentTrend: { date: string, avgScore: number }[],
  totalEntries: number,
  streakDays: number
}
```
Returns aggregated patterns from gratitude entries.

### Preferences

```
GET /api/v1/gratitude/preferences
Response: { preferences: GratitudePreferencesDTO }
```

```
PATCH /api/v1/gratitude/preferences
Body: Partial<GratitudePreferencesDTO>
Response: { preferences: GratitudePreferencesDTO }
```

---

## User Flows

### Flow 1: Creating a Gratitude Entry

**Entry Point Options:**
- Push notification at scheduled time
- Manual: Open Inner Work > "See the Positive"
- Suggested by AI in Inner Thoughts

**UI Components:**

```
GratitudeEntryScreen
├── ContextualPrompt (adapts to user state)
├── TextInput (multiline, generous space)
├── VoiceInputButton (optional)
├── ActionButtons
│   ├── "Share" (saves entry)
│   └── "Not today" (dismisses without saving)
└── AIResponse (after saving, optional)
```

**Contextual Prompts** (AI-selected based on context):

| Context | Prompt |
|---------|--------|
| Needs mostly high | "What's bringing you joy lately?" |
| Needs mixed | "What are you grateful for today, even amid the hard stuff?" |
| Needs mostly low | "How are you doing today? If there's anything - however small - that brought even a moment of ease, I'd love to hear it. But no pressure if that's not where you are." |
| Recent conflict | "I know things have been hard with [person]. Is there anything about them - or about yourself in this situation - you can appreciate, even while working through the difficulty?" |
| First entry | "What's one thing you're grateful for today?" |

**When User Declines:**
```
User: [taps "Not today"]

AI: "That's okay. When everything feels hard, gratitude can feel
    impossible or even wrong to reach for. The hard stuff is real
    and valid. You don't have to feel grateful right now."

[No entry saved, screen dismisses]
```

**After User Shares:**
```
User: "Grateful my friend Sarah called, even though I'm still
      really mad at my partner."

AI: "It sounds like Sarah being there mattered, especially in
    the middle of this hard time. That connection - feeling seen
    by someone - that seems important to you right now."

[Entry saved, tagged: Sarah (person), connection (theme), Being Seen (need)]
```

### Flow 2: Gratitude History View

**UI Layout:**
```
GratitudeHistoryScreen
├── FilterTabs: [This Week] [Month] [All]
├── EntryList (infinite scroll)
│   └── GratitudeCard
│       ├── Timestamp
│       ├── Content (truncated)
│       ├── Tags (people, themes, needs)
│       └── [Expand] action
└── [+ New Entry] FAB
```

**Entry Card Example:**
```
┌───────────────────────────────────┐
│ Today, 8:23 PM                    │
│ "Grateful for the walk. Helped    │
│  me clear my head before our      │
│  conversation tonight."           │
│                                   │
│ 🏷️ Nature • Clarity • Partner    │
└───────────────────────────────────┘
```

### Flow 3: Patterns View

**Shows:**
- Who you mention most
- Common themes/activities
- Which needs your gratitudes connect to
- Sentiment trend over time

**Pattern Recognition Message** (shown periodically):
```
AI: "I'm noticing you often feel grateful for time in nature -
    walks, sitting outside, even just seeing trees from your window.
    It seems like nature helps you feel more present."
```

---

## AI Response Generation

### Gratitude Response Prompt

```typescript
function buildGratitudeResponsePrompt(params: {
  content: string;
  needsScores?: { needId: number; score: number }[];
  recentGratitudes?: string[];
  activeConflicts?: { partnerName: string }[];
}): string {
  return `
You are responding to a gratitude entry in Inner Work.

USER'S GRATITUDE:
"${params.content}"

YOUR ROLE:
- Respond warmly and genuinely (1-3 sentences)
- Notice connections to needs if relevant
- Don't over-process - sometimes just witness
- Never force positivity or add toxic optimism
- NO follow-up questions (keep it simple, they're done sharing)

${params.needsScores ? `
USER'S NEEDS CONTEXT:
${formatNeedsContext(params.needsScores)}

If their gratitude touches a need that's been low, gently acknowledge
that this moment of appreciation matters.
` : ''}

${params.activeConflicts?.length ? `
CONFLICT CONTEXT:
User has active conflicts with: ${params.activeConflicts.map(c => c.partnerName).join(', ')}
If they mention anything related, acknowledge the complexity of holding
gratitude alongside difficulty.
` : ''}

OUTPUT:
- Short, warm acknowledgment (1-3 sentences)
- Optionally note which need this touches (naturally, not clinically)
- End there - don't ask questions or extend the conversation

ALSO EXTRACT (as JSON):
{
  "people": ["names mentioned"],
  "places": ["locations mentioned"],
  "activities": ["activities mentioned"],
  "emotions": ["emotions expressed"],
  "themes": ["gratitude themes: nature, connection, growth, etc."],
  "linkedNeeds": [need IDs this gratitude connects to],
  "sentiment": 0.0 to 1.0
}
`;
}
```

### Metadata Extraction

Run async after save (non-blocking, like Inner Thoughts):
1. Send to Haiku for extraction
2. Update entry with extracted metadata
3. Embed content for semantic search

---

## Mobile Implementation

### New Files

```
mobile/src/
├── screens/
│   ├── GratitudeEntryScreen.tsx    # Create new entry
│   └── GratitudeHistoryScreen.tsx  # View history + patterns
├── components/
│   └── gratitude/
│       ├── GratitudeCard.tsx       # Single entry display
│       ├── GratitudeTags.tsx       # People/theme tags
│       ├── GratitudePrompt.tsx     # Contextual prompt
│       └── PatternsView.tsx        # Patterns visualization
└── hooks/
    └── useGratitude.ts             # React Query hooks
```

### Hooks

```typescript
export function useGratitudeEntries(filters?: GratitudeFilters) {
  return useInfiniteQuery(['gratitude', filters], fetchGratitudeEntries);
}

export function useCreateGratitude() {
  return useMutation(createGratitude, {
    onSuccess: () => queryClient.invalidateQueries(['gratitude'])
  });
}

export function useGratitudePatterns(period: string) {
  return useQuery(['gratitude', 'patterns', period], () => fetchPatterns(period));
}

export function useGratitudePreferences() {
  return useQuery(['gratitude', 'preferences'], fetchPreferences);
}

export function useUpdateGratitudePreferences() {
  return useMutation(updatePreferences, {
    onSuccess: () => queryClient.invalidateQueries(['gratitude', 'preferences'])
  });
}
```

---

## Backend Implementation

### New Files

```
backend/src/
├── controllers/
│   └── gratitude.ts                # All gratitude endpoints
├── services/
│   └── gratitude-extractor.ts      # Metadata extraction service
└── routes/
    └── gratitude.ts                # Route definitions
```

### Extraction Service

```typescript
// gratitude-extractor.ts
export async function extractGratitudeMetadata(
  entryId: string,
  content: string,
  userId: string
): Promise<void> {
  // 1. Get user context (needs, conflicts) for better extraction
  const context = await getUserContext(userId);

  // 2. Call Haiku for extraction
  const extracted = await callHaiku(buildExtractionPrompt(content, context));

  // 3. Update entry with metadata
  await prisma.gratitudeEntry.update({
    where: { id: entryId },
    data: {
      extractedPeople: extracted.people,
      extractedPlaces: extracted.places,
      extractedActivities: extracted.activities,
      extractedEmotions: extracted.emotions,
      extractedThemes: extracted.themes,
      linkedNeedIds: extracted.linkedNeeds,
      sentimentScore: extracted.sentiment,
    }
  });

  // 4. Create embedding for semantic search
  await embedGratitudeEntry(entryId, content);

  // 5. Track people mentions (if People Tracking is implemented)
  await trackPeopleMentions(userId, extracted.people, 'gratitude', entryId);
}
```

---

## Integration Points

### With Needs Assessment
- Prompt selection based on needs scores
- Link gratitudes to needs they touch
- Pattern: "Your gratitudes often touch belonging - a need you marked as only somewhat met"

### With Inner Thoughts
- AI can reference recent gratitudes: "I notice you were grateful for your friend yesterday..."
- Suggest gratitude practice: "Would it help to notice what's going well, even amid this?"

### With Memory System
- Pattern insights can become memories: "Nature helps me feel grounded"
- User can save specific gratitudes as memories

### With People Tracking
- Extract people mentioned in gratitudes
- Track gratitude frequency per person
- Pattern: "You rarely express gratitude about your partner" (used carefully in cross-feature intelligence)

---

## Notifications

### Scheduled Reminders

Based on user preferences:
- Respect frequency setting (0-3x/day)
- Respect preferred times
- Respect quiet hours
- Respect weekday-only setting

**Notification Content:**
```
Title: "See the Positive"
Body: [Contextual prompt based on user state]
Action: Opens GratitudeEntryScreen
```

### Adaptive Frequency
- If user dismisses 3+ times in a row, reduce frequency
- Offer to adjust: "I notice you've been skipping gratitude prompts. Want to adjust the frequency?"

---

## Testing Strategy

### Unit Tests
- Metadata extraction parsing
- Pattern aggregation calculations
- Prompt selection logic

### Integration Tests
- Entry creation + async extraction
- History pagination
- Pattern calculation from entries

### E2E Tests
- Create entry flow
- View history flow
- Settings update flow

---

## Implementation Phases

### Phase 1: Core Data Model (0.5 day)
- [ ] Create Prisma schema
- [ ] Run migration
- [ ] Add DTOs to shared/

### Phase 2: Basic CRUD (1 day)
- [ ] Create entry endpoint
- [ ] List entries endpoint
- [ ] Get/Delete endpoints
- [ ] Preferences endpoints

### Phase 3: Mobile Entry Screen (1-2 days)
- [ ] Create GratitudeEntryScreen
- [ ] Implement contextual prompts
- [ ] Add voice input option
- [ ] Show AI response after save

### Phase 4: Mobile History Screen (1-2 days)
- [ ] Create GratitudeHistoryScreen
- [ ] Build GratitudeCard component
- [ ] Implement infinite scroll
- [ ] Add date filtering

### Phase 5: Metadata Extraction (1 day)
- [ ] Create extraction service
- [ ] Build extraction prompt
- [ ] Wire up async extraction
- [ ] Add embedding generation

### Phase 6: Patterns View (1 day)
- [ ] Implement patterns aggregation
- [ ] Build PatternsView component
- [ ] Add visualization (charts/lists)

### Phase 7: Notifications (0.5 day)
- [ ] Add scheduled notification logic
- [ ] Implement adaptive frequency

---

## Open Questions

1. **AI Response Always or Optional?**
   - Spec shows AI always responds
   - Could be overwhelming if entering multiple per day
   - Recommendation: Show response, but make it dismissible

2. **Voice Input Implementation**
   - Use device speech-to-text?
   - Store audio or just transcribe?
   - Recommendation: Transcribe only, don't store audio

3. **Pattern Notifications**
   - How often to surface patterns?
   - Recommendation: Weekly summary or when significant pattern emerges

4. **Integration with Needs**
   - Require needs assessment before gratitude?
   - Recommendation: No, works standalone but enhanced with needs data

---

[Back to Inner Work Plans](./index.md)
