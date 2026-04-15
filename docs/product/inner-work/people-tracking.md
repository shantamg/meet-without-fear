# People Tracking Implementation Plan

## Overview

A system to track mentions of people across all Inner Work features (Inner Thoughts, Gratitude, Needs check-ins) and partner sessions. This enables cross-feature intelligence like "you rarely express gratitude about your partner" or "trust issues come up frequently with Sarah."

## Goals

1. **Extract people** from user content automatically
2. **Deduplicate** mentions (Sarah, my friend Sarah, Sarah W. = same person)
3. **Track context** of mentions (gratitude, conflict, needs discussion)
4. **Enable insights** about relationship patterns

---

## Database Schema

### New Tables

```prisma
// A person mentioned by the user
model Person {
  id              String   @id @default(cuid())
  userId          String
  name            String   // Primary name: "Sarah"
  aliases         String[] @default([]) // ["my friend Sarah", "Sarah W."]
  relationship    String?  // "friend", "partner", "family", "coworker", etc.
  firstMentioned  DateTime @default(now())
  lastMentioned   DateTime @default(now())

  // Mention counts by feature
  mentionCountInnerThoughts Int @default(0)
  mentionCountGratitude     Int @default(0)
  mentionCountNeeds         Int @default(0)
  mentionCountConflict      Int @default(0) // Partner sessions

  // Which needs this person relates to (JSON: { "trust": 3, "belonging": 1 })
  needsConnections Json @default("{}")

  user            User     @relation(fields: [userId], references: [id])
  mentions        PersonMention[]

  @@unique([userId, name])
  @@index([userId, lastMentioned])
}

// Individual mention instance
model PersonMention {
  id            String   @id @default(cuid())
  personId      String
  userId        String

  // Source context
  sourceType    MentionSourceType
  sourceId      String   // ID of the source entity
  context       String?  // Surrounding text snippet for reference
  sentiment     Float?   // -1 to 1, sentiment of this mention

  createdAt     DateTime @default(now())

  person        Person   @relation(fields: [personId], references: [id])

  @@index([personId, createdAt])
  @@index([userId, sourceType])
}

enum MentionSourceType {
  INNER_THOUGHTS  // InnerWorkMessage
  GRATITUDE       // GratitudeEntry
  NEEDS_CHECKIN   // NeedScore clarification
  PARTNER_SESSION // Session message
}
```

---

## API Endpoints

### People

```
GET /api/v1/people
Query: { limit?, sortBy?: 'recent' | 'frequent' | 'name' }
Response: {
  people: PersonDTO[]
}
```
Returns user's tracked people with mention counts.

```
GET /api/v1/people/:id
Response: {
  person: PersonDTO,
  recentMentions: PersonMentionDTO[],
  patterns: {
    topContexts: { sourceType: string, count: number }[],
    needsConnections: { needName: string, count: number }[],
    sentimentTrend: number // Average sentiment
  }
}
```
Returns detailed person info with patterns.

```
PATCH /api/v1/people/:id
Body: { name?: string, relationship?: string, aliases?: string[] }
Response: { person: PersonDTO }
```
Update person info (user can rename, set relationship, add aliases).

```
POST /api/v1/people/:id/merge
Body: { mergeIntoId: string }
Response: { person: PersonDTO }
```
Merge two people (combine mentions, keep target).

```
DELETE /api/v1/people/:id
Response: { success: boolean }
```
Delete person (and their mentions).

---

## Extraction Service

### Core Function

```typescript
// people-extractor.ts

export async function extractAndTrackPeople(params: {
  userId: string;
  content: string;
  sourceType: MentionSourceType;
  sourceId: string;
  existingPeople?: Person[];
}): Promise<{ people: string[], newPeople: string[] }> {
  // 1. Get user's existing people for matching
  const existingPeople = params.existingPeople ||
    await prisma.person.findMany({ where: { userId: params.userId } });

  // 2. Extract names using AI
  const extracted = await extractNamesWithAI(params.content, existingPeople);

  // 3. Match to existing or create new people
  const results = { people: [], newPeople: [] };

  for (const name of extracted.names) {
    const match = findMatchingPerson(name, existingPeople);

    if (match) {
      // Update existing person
      await updatePersonMention(match.id, params);
      results.people.push(match.name);
    } else {
      // Create new person
      const person = await createPerson(params.userId, name, extracted.relationships[name]);
      await createMention(person.id, params);
      results.newPeople.push(name);
      results.people.push(name);
    }
  }

  return results;
}
```

### Name Extraction Prompt

```typescript
function buildNameExtractionPrompt(
  content: string,
  existingPeople: Person[]
): string {
  return `
Extract people mentioned in this text.

EXISTING PEOPLE (match to these if possible):
${existingPeople.map(p =>
  `- ${p.name}${p.aliases.length ? ` (aliases: ${p.aliases.join(', ')})` : ''}${p.relationship ? ` [${p.relationship}]` : ''}`
).join('\n')}

TEXT:
"${content}"

INSTRUCTIONS:
1. Identify all people mentioned by name or relationship reference
2. Match to existing people where confident (Sarah = my friend Sarah)
3. For new people, infer relationship if clear from context
4. Skip generic references ("someone", "people", "they")
5. Include relationship references that clearly refer to a specific person:
   - "my partner" → likely existing partner if one exists
   - "my mom" → specific person even if name unknown
   - "a friend" → too vague, skip

OUTPUT (JSON):
{
  "names": ["Sarah", "my partner"],
  "matchedToExisting": {
    "Sarah": "sarah_id_123",
    "my partner": "partner_id_456"
  },
  "newPeople": ["Tom"],
  "relationships": {
    "Tom": "coworker"
  },
  "sentiment": {
    "Sarah": 0.7,
    "Tom": -0.3
  }
}
`;
}
```

### Matching Logic

```typescript
function findMatchingPerson(
  name: string,
  existingPeople: Person[]
): Person | null {
  const normalized = name.toLowerCase().trim();

  // Exact name match
  const exactMatch = existingPeople.find(
    p => p.name.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  // Alias match
  const aliasMatch = existingPeople.find(
    p => p.aliases.some(a => a.toLowerCase() === normalized)
  );
  if (aliasMatch) return aliasMatch;

  // Partial match (first name only)
  const firstName = normalized.split(' ')[0];
  const partialMatch = existingPeople.find(
    p => p.name.toLowerCase().split(' ')[0] === firstName
  );
  if (partialMatch) return partialMatch;

  return null;
}
```

---

## Integration Points

### With Inner Thoughts

After each message:
```typescript
// In sendInnerWorkMessage controller
const extracted = await extractAndTrackPeople({
  userId: session.userId,
  content: userMessage.content,
  sourceType: 'INNER_THOUGHTS',
  sourceId: userMessage.id,
});
```

### With Gratitude

After each entry:
```typescript
// In createGratitudeEntry controller
const extracted = await extractAndTrackPeople({
  userId,
  content: entry.content,
  sourceType: 'GRATITUDE',
  sourceId: entry.id,
});

// Also store in entry's extractedPeople field
await prisma.gratitudeEntry.update({
  where: { id: entry.id },
  data: { extractedPeople: extracted.people }
});
```

### With Needs Check-ins

If clarification text mentions people:
```typescript
// In checkInNeed controller
if (clarification) {
  await extractAndTrackPeople({
    userId,
    content: clarification,
    sourceType: 'NEEDS_CHECKIN',
    sourceId: needScore.id,
  });
}
```

### With Partner Sessions

Already tracked via Session model's participant relationship. Can backfill PersonMention records:
```typescript
// Link partner session messages to Person
const partnerPerson = await findOrCreatePartnerPerson(userId, session.partnerId);
await createMention(partnerPerson.id, {
  sourceType: 'PARTNER_SESSION',
  sourceId: message.id,
});
```

---

## Use Cases for Cross-Feature Intelligence

### Pattern: Gratitude Frequency by Person
```typescript
// Query: Who does user express gratitude about most/least?
const gratitudeByPerson = await prisma.person.findMany({
  where: { userId },
  orderBy: { mentionCountGratitude: 'desc' },
  take: 10,
});

// Insight: "You've expressed gratitude about Sarah 12 times,
// but rarely about your partner (2 times)"
```

### Pattern: Conflict-Heavy Relationships
```typescript
// Query: Which people appear most in conflicts?
const conflictHeavy = await prisma.person.findMany({
  where: {
    userId,
    mentionCountConflict: { gt: 3 }
  },
  orderBy: { mentionCountConflict: 'desc' },
});
```

### Pattern: Needs Connections
```typescript
// Query: Which people relate to trust issues?
const trustRelated = await prisma.person.findMany({
  where: {
    userId,
    needsConnections: {
      path: ['trust'],
      gte: 2
    }
  }
});
```

### Pattern: Sentiment Trajectory
```typescript
// Query: How has sentiment about a person changed?
const mentions = await prisma.personMention.findMany({
  where: { personId },
  orderBy: { createdAt: 'asc' },
  select: { sentiment: true, createdAt: true }
});

const sentimentTrend = calculateTrend(mentions);
```

---

## Mobile Implementation

### UI: People List (Optional)

Could show in settings or dedicated screen:
```
PeopleScreen
├── PersonCard
│   ├── Name + Relationship badge
│   ├── Last mentioned date
│   ├── Mention counts by type (icons)
│   └── [Edit] action
└── PersonDetailModal
    ├── Edit name/relationship
    ├── Manage aliases
    ├── Merge with another person
    └── Delete
```

### Hooks

```typescript
export function usePeople() {
  return useQuery(['people'], fetchPeople);
}

export function usePerson(personId: string) {
  return useQuery(['people', personId], () => fetchPerson(personId));
}

export function useUpdatePerson() {
  return useMutation(updatePerson, {
    onSuccess: () => queryClient.invalidateQueries(['people'])
  });
}

export function useMergePeople() {
  return useMutation(mergePeople, {
    onSuccess: () => queryClient.invalidateQueries(['people'])
  });
}
```

---

## Privacy Considerations

1. **User Control** - Users can rename, merge, delete people
2. **No External Sharing** - People data never leaves the app
3. **Transparent** - Users can see who is tracked and why
4. **Opt-out** - Could add setting to disable people tracking

---

## Backend Implementation

### New Files

```
backend/src/
├── controllers/
│   └── people.ts               # CRUD endpoints
├── services/
│   └── people-extractor.ts     # Extraction + tracking
└── routes/
    └── people.ts               # Route definitions
```

### Integration into Existing Controllers

```typescript
// In inner-work.ts sendInnerWorkMessage
import { extractAndTrackPeople } from '../services/people-extractor';

// After saving user message
extractAndTrackPeople({
  userId: session.userId,
  content: userMessage.content,
  sourceType: 'INNER_THOUGHTS',
  sourceId: userMessage.id,
}).catch(err => console.warn('People extraction failed:', err));
// Non-blocking
```

---

## Testing Strategy

### Unit Tests
- Name extraction parsing
- Matching logic (exact, alias, partial)
- Mention count updates

### Integration Tests
- Create person from extraction
- Match to existing person
- Merge people

### Edge Cases
- Same first name, different people
- Relationship references without names ("my partner")
- Non-person entities (pets, companies)

---

## Implementation Phases

### Phase 1: Data Model (0.5 day)
- [ ] Create Prisma schema
- [ ] Run migration
- [ ] Add DTOs to shared/

### Phase 2: Extraction Service (1 day)
- [ ] Create extraction prompt
- [ ] Implement matching logic
- [ ] Create extractAndTrackPeople function
- [ ] Test with sample content

### Phase 3: Integration (1 day)
- [ ] Wire into Inner Thoughts controller
- [ ] Wire into Gratitude controller (when built)
- [ ] Wire into Needs check-in controller (when built)
- [ ] Test end-to-end extraction

### Phase 4: API Endpoints (0.5 day)
- [ ] List people endpoint
- [ ] Get person detail endpoint
- [ ] Update person endpoint
- [ ] Merge endpoint
- [ ] Delete endpoint

### Phase 5: Mobile UI (Optional, 1 day)
- [ ] Create PeopleScreen
- [ ] PersonCard component
- [ ] Edit/merge/delete flows

---

## Open Questions

1. **Automatic vs. Confirmed?**
   - Auto-create people or ask user to confirm?
   - Recommendation: Auto-create, let user clean up

2. **Relationship Reference Handling**
   - How to handle "my partner" when we don't know name?
   - Recommendation: Create person with relationship as name, user can rename

3. **Retroactive Extraction**
   - Should we backfill from existing Inner Thoughts messages?
   - Recommendation: Yes, run once as migration

4. **Visibility in UI**
   - How prominent should People management be?
   - Recommendation: Low-key, in settings, mostly automatic

---

[Back to Inner Work Plans](./index.md)
