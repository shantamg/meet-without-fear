# Architecture Research

**Domain:** AI-guided journal with distillation, tagging, and browsable knowledge base
**Researched:** 2026-03-11
**Confidence:** HIGH — based on direct codebase analysis

---

## Standard Architecture

### System Overview

```
Mobile (React Native)
  InnerThoughtsScreen          KnowledgeBaseScreen       DistillationReviewSheet
       |                             |                            |
  React Query Cache (useInnerThoughts, useKnowledgeBase, useDistillation)
       |
HTTP
       |
Backend (Express + Prisma)
  inner-work controller (existing routes)
    POST /inner-thoughts
    POST /inner-thoughts/:id/messages
    POST /inner-thoughts/:id/distill      [NEW]
    GET  /inner-thoughts/knowledge        [NEW]
    GET  /inner-thoughts/knowledge/topics/:id  [NEW]
    GET  /inner-thoughts/knowledge/themes/:id  [NEW]
    GET  /inner-thoughts/knowledge/takeaways   [NEW]
    PATCH /inner-thoughts/knowledge/takeaways/:id [NEW]
    GET  /inner-thoughts/knowledge/people/:id  [NEW]
       |
  Service Layer
    distillation-service.ts [NEW]
    theme-tracker.ts [NEW]
    conversation-summarizer.ts (existing, read-only)
    people-extractor.ts (existing, unchanged)
    embedding.ts (extend with embedTakeawayContent)
    global-memory.ts (existing, NO changes)
       |
  Database (PostgreSQL + pgvector)
    InnerWorkSession (existing, add distilledAt column)
    InnerWorkMessage (existing, unchanged)
    Person + PersonMention (existing, unchanged)
    Insight (existing, unchanged)
    JournalTakeaway [NEW]
    JournalTopic [NEW]
    SessionTopicLink [NEW]
    TakeawayTopicLink [NEW]
    RecurringTheme [NEW]
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `InnerWorkSession` | Session record with title, theme, summary, contentEmbedding, conversationSummary | Existing |
| `InnerWorkMessage` | Individual chat messages (USER/AI) | Existing |
| `conversationSummary` (JSON field) | Rolling summary including keyThemes, emotionalJourney, unresolvedTopics | Existing |
| `contentEmbedding` (vector) | pgvector embedding for cross-session semantic search | Existing |
| `Person` + `PersonMention` | Tracks people mentioned across all Inner Thoughts sessions | Existing |
| `Insight` | AI-generated cross-feature pattern insights with priority and dismiss | Existing |
| `distillation-service.ts` | Extracts takeaways + topics from a session using Haiku | New service |
| `JournalTakeaway` | User-editable extracted takeaways (per session); core KB content unit | New model |
| `JournalTopic` | Normalized topic tags applied to sessions and takeaways | New model |
| `SessionTopicLink` | Many-to-many join: sessions -> topics | New join table |
| `TakeawayTopicLink` | Many-to-many join: takeaways -> topics | New join table |
| `RecurringTheme` | Aggregated theme records across sessions (organic pattern recognition) | New model |
| `knowledge-base endpoints` | Browse endpoints (by topic, person, theme, time, category) | New routes |

---

## Integration Points with Existing Architecture

### What Already Exists (Do Not Rebuild)

**Rolling summarizer** (`conversation-summarizer.ts`)
- `updateInnerThoughtsSummary()` — fires after every 20+ messages
- Already extracts: `keyThemes`, `emotionalJourney`, `unresolvedTopics`, stores as `conversationSummary` JSON on `InnerWorkSession`
- **Distillation pipeline must read this output as seed data** — do not re-derive from raw messages when summary exists

**Session metadata updater** (`inner-work controller`)
- `updateSessionMetadata()` — fires after every message via fire-and-forget
- Updates `InnerWorkSession.title`, `InnerWorkSession.summary`, `InnerWorkSession.theme`
- The `theme` column is the single-session theme string. `RecurringTheme` aggregates across sessions.

**Content embedding** (`embedding.ts`)
- `embedInnerWorkSessionContent()` — embeds `theme + summary + keyThemes` at session level
- `searchInnerWorkSessionContent()` — vector search across a user's sessions
- New `embedTakeawayContent()` should follow the same pgvector pattern (reuse `vectorToSql()` helper)

**People extractor** (`people-extractor.ts`)
- `extractAndTrackPeople()` already runs on `InnerWorkMessage` with `sourceType = 'INNER_THOUGHTS'`
- The KB "browse by person" view reads `Person` + `PersonMention` directly — no changes needed to this service

**Insight model** (schema.prisma)
- Already has `InsightType.PATTERN`, `CONTRADICTION`, `SUGGESTION` with `priority` and `dismissed`
- Takeaways that span multiple sessions (cross-session patterns) belong in `Insight`
- Single-session extractions belong in `JournalTakeaway`
- These are complementary, not overlapping

**Global facts** (`global-memory.ts`)
- `consolidateGlobalFacts()` pulls from `UserVessel.notableFacts` (partner sessions only)
- Inner Thoughts distillation MUST NOT feed into `User.globalFacts` — that is partner-session context reserved for conflict resolution AI prompts

---

## New Database Models

### JournalTakeaway

Core content unit of the knowledge base. One record per extracted insight from a session. User-editable.

```prisma
model JournalTakeaway {
  id          String           @id @default(cuid())
  session     InnerWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId   String
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String
  content     String           @db.Text       // The takeaway text (user-editable)
  category    TakeawayCategory                // REALIZATION | PATTERN | DECISION | UNRESOLVED
  isEdited    Boolean          @default(false) // True if user modified the AI draft
  isDeleted   Boolean          @default(false) // Soft delete (user removed it)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  // Session-level embedding for knowledge base semantic search
  contentEmbedding Unsupported("vector(1024)")?

  // Topic links (many-to-many via join table)
  topicLinks  TakeawayTopicLink[]

  @@index([userId, sessionId])
  @@index([userId, category])
  @@index([userId, createdAt])
}

enum TakeawayCategory {
  REALIZATION   // "I realized that..."
  PATTERN       // "I keep noticing that..."
  DECISION      // "I've decided to..."
  UNRESOLVED    // "I still need to figure out..."
}
```

### JournalTopic

Normalized topic tags. User-visible labels. Created during distillation. Deduplicated across sessions.

```prisma
model JournalTopic {
  id           String   @id @default(cuid())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String
  name         String   // "work stress", "relationship with mom", "anxiety"
  aliases      String[] @default([]) // Alternate phrasings that have matched to this topic
  sessionCount Int      @default(0)  // Denormalized; updated at distillation time
  takeawayCount Int     @default(0)  // Denormalized
  firstSeenAt  DateTime @default(now())
  lastSeenAt   DateTime @default(now())

  sessions   SessionTopicLink[]
  takeaways  TakeawayTopicLink[]

  @@unique([userId, name])
  @@index([userId, sessionCount])
  @@index([userId, lastSeenAt])
}

model SessionTopicLink {
  session   InnerWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId String
  topic     JournalTopic     @relation(fields: [topicId], references: [id], onDelete: Cascade)
  topicId   String
  createdAt DateTime         @default(now())

  @@id([sessionId, topicId])
}

model TakeawayTopicLink {
  takeaway   JournalTakeaway @relation(fields: [takeawayId], references: [id], onDelete: Cascade)
  takeawayId String
  topic      JournalTopic    @relation(fields: [topicId], references: [id], onDelete: Cascade)
  topicId    String
  createdAt  DateTime        @default(now())

  @@id([takeawayId, topicId])
}
```

### RecurringTheme

Aggregated pattern across sessions. Distinct from JournalTopic. Topics are labels; themes are organic patterns that emerge from multiple sessions.

```prisma
model RecurringTheme {
  id           String   @id @default(cuid())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String
  name         String   // "fear of abandonment", "work-life balance"
  sessionIds   String[] // Contributing InnerWorkSession IDs
  sessionCount Int      @default(0)
  summary      String?  @db.Text // AI-generated cross-session synthesis
  lastSeenAt   DateTime @default(now())
  firstSeenAt  DateTime @default(now())
  trending     Boolean  @default(false) // 2+ occurrences in last 14 days

  @@unique([userId, name])
  @@index([userId, sessionCount])
  @@index([userId, lastSeenAt])
}
```

### InnerWorkSession change

Add `distilledAt` to guard against double-distillation:

```prisma
// Add to InnerWorkSession model:
distilledAt DateTime? // When distillation was last run for this session
```

---

## Distillation Pipeline

### When Does Distillation Run?

**Two triggers — both supported:**

1. **On-demand (user-initiated)**: User taps "Distill this session". Runs synchronously and returns results for an edit/review UI.

2. **Automatic on session close**: When `InnerWorkSession.status` transitions to `COMPLETED`, background distillation fires as fire-and-forget. Results appear in the knowledge base when the user next browses.

**Decision rationale:** Do NOT run distillation after every message. Takeaways need session-level perspective — mid-session extraction produces noisy, premature results and wastes Haiku calls. The `distilledAt` guard prevents double-runs if both triggers fire in close succession (5-minute cooldown).

### Pipeline Steps

```
User taps "Distill" (or session closes with status=COMPLETED)
  |
  v
1. GUARD: Check InnerWorkSession.distilledAt
   If distilledAt within 5 minutes: return existing takeaways, skip pipeline

  |
  v
2. READ session context:
   - InnerWorkSession.conversationSummary (keyThemes, emotionalJourney, unresolvedTopics)
   - InnerWorkSession.theme
   - If no conversationSummary: last 30 InnerWorkMessages (fallback)

  |
  v
3. HAIKU CALL: Extract takeaways + topics
   Input: existing summary text + keyThemes (or fallback messages)
   Output JSON: {
     takeaways: [{ content: string, category: "REALIZATION|PATTERN|DECISION|UNRESOLVED" }],
     topics: [string]  // normalized lowercase short phrases
   }
   Estimated cost: ~1-2 Haiku calls, ~500-800 tokens total

  |
  v
4. PRISMA TRANSACTION:
   a. Create JournalTakeaway records (one per extracted takeaway)
   b. For each extracted topic name:
      - Normalize: lowercase, trim
      - Fuzzy match against existing user JournalTopics (Levenshtein <= 2)
      - If match: update sessionCount, lastSeenAt; add to aliases if new phrasing
      - If no match: create new JournalTopic
   c. Create SessionTopicLink records (session -> matched/created topics)
   d. Create TakeawayTopicLink records (takeaway -> relevant topics)
   e. Update InnerWorkSession.distilledAt = now()

  |
  v
5. FIRE-AND-FORGET (non-blocking):
   a. embedTakeawayContent(takeawayId) for each new takeaway
   b. updateRecurringThemes(userId, sessionTheme) — checks if theme appears in 3+ sessions

  |
  v
6. RETURN to client:
   { takeaways: JournalTakeaway[], topics: JournalTopic[] }
   → User sees distillation review sheet with edit/delete controls
```

### Haiku Prompt Design for Distillation

Uses Haiku 4.5, same model as `conversation-summarizer.ts` and `updateSessionMetadata()`. The prompt should draw from existing summary, not raw messages, when available:

```
System: You extract concise takeaways from a private journaling session.
These are for the user's personal knowledge base — be concrete and personal.

Input: {summary text} plus {keyThemes list}

Extract:
1. 2-5 takeaways the user would want to remember
   - REALIZATION: something they understood or saw differently
   - PATTERN: a recurring behavior, trigger, or reaction they noticed
   - DECISION: something they've resolved to do or stop doing
   - UNRESOLVED: a question or tension they're still sitting with

2. 2-4 topic tags for this session (short phrases, lowercase, specific not generic)
   Good: "resentment toward mom", "perfectionism at work"
   Bad: "emotions", "thoughts", "journal"

Output JSON only:
{
  "takeaways": [
    { "content": "...", "category": "REALIZATION" }
  ],
  "topics": ["work stress", "fear of failure"]
}
```

### Recurring Theme Detection

Runs as fire-and-forget after distillation. Simple threshold logic — no additional Haiku call needed for detection:

```typescript
async function updateRecurringThemes(userId: string, newSessionTheme: string | null) {
  if (!newSessionTheme) return;

  // Count sessions with this theme (or near-match)
  const matchingSessions = await prisma.innerWorkSession.findMany({
    where: { userId, theme: { contains: newSessionTheme.split(' ')[0] } },
    select: { id: true }
  });

  if (matchingSessions.length >= 3) {
    await prisma.recurringTheme.upsert({
      where: { userId_name: { userId, name: newSessionTheme } },
      create: { userId, name: newSessionTheme, sessionIds: matchingSessions.map(s => s.id), sessionCount: matchingSessions.length },
      update: { sessionIds: matchingSessions.map(s => s.id), sessionCount: matchingSessions.length, lastSeenAt: new Date() }
    });
  }
}
```

Cross-session summary for a `RecurringTheme` is generated lazily on first request to the theme detail endpoint — not at detection time.

---

## Knowledge Base Structure

### Browse Dimensions

The knowledge base is a single screen with filter tabs. Not separate screens per dimension — keeps navigation shallow.

| Dimension | Data Source | Sort Default | API |
|-----------|-------------|--------------|-----|
| Time (default) | `InnerWorkSession` | `updatedAt DESC` | `GET /inner-thoughts?status=COMPLETED` |
| Topic | `JournalTopic` | `sessionCount DESC` | `GET /inner-thoughts/knowledge/topics` |
| Person | `Person` (mentionCountInnerThoughts > 0) | `mentionCount DESC` | `GET /inner-thoughts/knowledge/people` |
| Theme | `RecurringTheme` | `sessionCount DESC` | `GET /inner-thoughts/knowledge/themes` |
| Takeaways | `JournalTakeaway` | `createdAt DESC`, filterable by category | `GET /inner-thoughts/knowledge/takeaways` |

### API Endpoints (New)

```
POST   /inner-thoughts/:id/distill
  Body: (none)
  Returns: { takeaways: JournalTakeawayDTO[], topics: JournalTopicDTO[] }
  Note: idempotent — returns existing results if distilledAt within 5 min

GET    /inner-thoughts/knowledge
  Returns: {
    recentSessions: InnerWorkSessionSummaryDTO[],  // last 5
    topTopics: JournalTopicDTO[],                  // top 8 by sessionCount
    recurringThemes: RecurringThemeDTO[],           // top 4 by sessionCount
    topPeople: PersonDTO[],                        // top 6 by mentionCountInnerThoughts
    takeawayCount: number
  }

GET    /inner-thoughts/knowledge/topics
  Returns: JournalTopicDTO[] sorted by sessionCount DESC

GET    /inner-thoughts/knowledge/topics/:id
  Returns: { topic, sessions: InnerWorkSessionSummaryDTO[], takeaways: JournalTakeawayDTO[] }

GET    /inner-thoughts/knowledge/themes
  Returns: RecurringThemeDTO[]

GET    /inner-thoughts/knowledge/themes/:id
  Returns: { theme, sessions: InnerWorkSessionSummaryDTO[], crossSessionSummary: string | null }
  Note: generates crossSessionSummary lazily on first request via Haiku

GET    /inner-thoughts/knowledge/takeaways
  Query: category? topicId? personName? limit? offset?
  Returns: JournalTakeawayDTO[] (paginated)

PATCH  /inner-thoughts/knowledge/takeaways/:id
  Body: { content?: string; isDeleted?: boolean }
  Returns: JournalTakeawayDTO

GET    /inner-thoughts/knowledge/people
  Returns: PersonDTO[] where mentionCountInnerThoughts > 0, sorted by count

GET    /inner-thoughts/knowledge/people/:id
  Returns: {
    person: PersonDTO,
    sessions: InnerWorkSessionSummaryDTO[],  // sessions with mentions
    takeaways: JournalTakeawayDTO[]          // takeaways containing person name (text search)
  }
```

---

## Architectural Patterns

### Pattern 1: Read Existing Summary Before Calling Haiku

**What:** Distillation reads `conversationSummary.text + keyThemes` already stored on `InnerWorkSession` rather than reprocessing all messages.
**When to use:** Always — `updateInnerThoughtsSummary()` already ran. Avoid duplicate LLM work.
**Trade-offs:** If no summary exists (session < 20 messages), fall back to last 30 messages.

```typescript
const session = await prisma.innerWorkSession.findUnique({
  where: { id: sessionId },
  include: { messages: { orderBy: { timestamp: 'asc' }, take: 30 } }
});

const summaryData = session.conversationSummary
  ? JSON.parse(session.conversationSummary as string)
  : null;

// Prefer existing summary — avoids duplicate Haiku call
const contextForDistillation = summaryData
  ? `Session theme: ${session.theme}\nSummary: ${summaryData.text}\nKey themes: ${summaryData.keyThemes?.join(', ')}`
  : session.messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
```

### Pattern 2: Fire-and-Forget for Embedding and Theme Detection

**What:** Non-critical enrichment (embedding takeaways, updating recurring themes) fires after the primary response is returned.
**When to use:** Any enrichment that doesn't affect the immediate response.
**Trade-offs:** Knowledge base search degrades gracefully until embeddings populate (~200-500ms each). Theme detection may lag by one session.

Follows the same pattern already used throughout `inner-work controller`:
```typescript
// After distillation writes to DB and returns response:
embedTakeawayContent(takeawayId, turnId).catch(err =>
  logger.warn('[Distillation] Failed to embed takeaway:', err)
);
updateRecurringThemes(userId, session.theme).catch(err =>
  logger.warn('[Distillation] Failed to update recurring themes:', err)
);
```

### Pattern 3: Topic Deduplication via String Normalization First

**What:** Before creating a new `JournalTopic`, normalize the extracted name and compare against existing user topics.
**When to use:** Every distillation run — prevents "work", "work stress", "stress at work" fragmentation.
**Trade-offs:** Levenshtein for short strings is fast in JS. Only escalate to Haiku fuzzy matching if collision rate is high.

```typescript
function normalizeTopic(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findMatchingTopic(
  normalized: string,
  existing: JournalTopic[]
): JournalTopic | null {
  // Exact match
  const exact = existing.find(t => t.name === normalized);
  if (exact) return exact;

  // Levenshtein <= 2 for short topics (< 15 chars)
  if (normalized.length < 15) {
    return existing.find(t => levenshtein(t.name, normalized) <= 2) ?? null;
  }

  return null;
}
```

### Pattern 4: Denormalized Counts on JournalTopic

**What:** Keep `sessionCount` and `takeawayCount` updated at write time rather than COUNT() at read time.
**When to use:** Any list sorted by count — avoids slow aggregate queries.
**Trade-offs:** Requires increment on every distillation write. Same pattern used by `Person.mentionCountInnerThoughts`.

```typescript
await prisma.journalTopic.update({
  where: { id: topicId },
  data: { sessionCount: { increment: 1 }, lastSeenAt: new Date() }
});
```

### Pattern 5: distilledAt Guard for Idempotency

**What:** Check `InnerWorkSession.distilledAt` before running distillation. Return cached results if distilled within 5 minutes.
**When to use:** Both explicit user trigger and auto-distill on session close may fire close together.
**Trade-offs:** User will see stale takeaways if they tap "distill again" within 5 min. That is acceptable — distillation is not real-time.

```typescript
const session = await prisma.innerWorkSession.findUnique({ where: { id: sessionId } });
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

if (session.distilledAt && session.distilledAt > fiveMinutesAgo) {
  // Return existing takeaways without re-running pipeline
  const existing = await prisma.journalTakeaway.findMany({
    where: { sessionId, isDeleted: false },
    orderBy: { createdAt: 'asc' }
  });
  return existing;
}
```

---

## Data Flow

### Distillation Flow (User-Initiated)

```
User taps "Distill this session"
  |
  POST /inner-thoughts/:id/distill
  |
  [distillation-service.ts]
    1. Guard: check distilledAt cooldown
    2. Load conversationSummary or fallback messages
    3. Haiku call: extract takeaways + topics
    4. Prisma transaction:
       - Create JournalTakeaway records
       - Match or create JournalTopic records
       - Create link records (SessionTopicLink, TakeawayTopicLink)
       - Update JournalTopic counts
       - Set InnerWorkSession.distilledAt = now()
    5. Fire-and-forget: embed takeaways, update RecurringThemes
  |
  Return { takeaways, topics } to client
  |
  Mobile: DistillationReviewSheet opens
  User edits/deletes → PATCH /inner-thoughts/knowledge/takeaways/:id
```

### Knowledge Base Browse Flow

```
User opens Knowledge Base tab
  |
  GET /inner-thoughts/knowledge  (one aggregation call)
  |
  Backend:
    - 5 recent sessions (updatedAt DESC, status=COMPLETED)
    - 8 top topics (sessionCount DESC)
    - 4 recurring themes (sessionCount DESC)
    - 6 top people (mentionCountInnerThoughts DESC)
    - Total takeaway count
  |
  Mobile renders knowledge base home grid
  |
  User taps a topic/theme/person:
    GET /inner-thoughts/knowledge/topics/:id
    GET /inner-thoughts/knowledge/themes/:id
    GET /inner-thoughts/knowledge/people/:id
```

---

## Build Order (Dependencies)

Build in this sequence to respect dependencies:

**Phase 1: Schema and migration** (no logic dependencies)
1. Add `distilledAt DateTime?` to `InnerWorkSession`
2. Add `JournalTakeaway` model with `TakeawayCategory` enum
3. Add `JournalTopic` model
4. Add `SessionTopicLink` and `TakeawayTopicLink` join tables
5. Add `RecurringTheme` model
6. Add `BrainActivityCallType.DISTILLATION` to enum
7. Update `User` model to add `journalTakeaways` + `journalTopics` + `recurringThemes` relations
8. Run: `npx prisma migrate dev --name add_journal_knowledge_base`

**Phase 2: Shared types** (depends on schema decisions)
1. `shared/src/dto/journal.ts` — `JournalTakeawayDTO`, `JournalTopicDTO`, `RecurringThemeDTO`
2. `shared/src/contracts/inner-thoughts.ts` — distillation endpoint request/response schemas
3. Export from `shared/src/contracts/index.ts`

**Phase 3: Distillation service** (depends on schema + shared types)
1. `backend/src/services/distillation-service.ts`:
   - `distillSession(sessionId, userId, turnId)` — core pipeline
   - `matchOrCreateTopics(userId, topicNames[])` — topic deduplication
2. Extend `backend/src/services/embedding.ts`:
   - Add `embedTakeawayContent(takeawayId, turnId)`
3. Wire into `inner-work controller`:
   - Add `POST /inner-thoughts/:id/distill` handler
   - Add auto-distill call when `PATCH /inner-thoughts/:id` sets `status = COMPLETED`

**Phase 4: Knowledge base endpoints** (depends on distillation service)
1. All `GET /inner-thoughts/knowledge/*` endpoints
2. `PATCH /inner-thoughts/knowledge/takeaways/:id`
3. Lazy theme summary generation in `GET /inner-thoughts/knowledge/themes/:id`

**Phase 5: Mobile UI** (depends on all backend)
1. Add query keys to `mobile/src/hooks/queryKeys.ts`:
   - `journalKeys.knowledge()`, `journalKeys.topics()`, `journalKeys.takeaways()`
2. `mobile/src/hooks/useDistillation.ts` — mutation hook
3. `mobile/src/hooks/useKnowledgeBase.ts` — React Query hooks for KB screens
4. `mobile/src/hooks/useJournalTakeaways.ts` — CRUD for takeaways
5. `mobile/src/screens/KnowledgeBaseScreen.tsx` — browse screen with tabs
6. `mobile/src/components/DistillationReviewSheet.tsx` — post-distillation edit UI

---

## Anti-Patterns

### Anti-Pattern 1: Re-Summarizing at Distillation Time

**What people do:** Call `updateInnerThoughtsSummary()` again during distillation to get "fresh" context.
**Why it's wrong:** The summarizer already ran and stored `conversationSummary` on the session. This wastes a Haiku call and adds 500-1000ms latency to an interactive user action.
**Do this instead:** Read `session.conversationSummary` JSON and pass it as context to the distillation Haiku call. Fall back to last 30 raw messages only if no summary exists.

### Anti-Pattern 2: Topics as Free-Form Strings Without Deduplication

**What people do:** Insert each extracted topic as a new `JournalTopic` record immediately.
**Why it's wrong:** "work stress", "stress at work", and "workplace stress" become three separate topics. The user sees a fragmented knowledge base.
**Do this instead:** Normalize (lowercase, trim) then Levenshtein match against existing topics before creating. Match to existing if distance <= 2. Log the alias so the match improves over time.

### Anti-Pattern 3: Blocking Response on Takeaway Embedding

**What people do:** Await `embedTakeawayContent()` for all takeaways before returning the distillation response.
**Why it's wrong:** 5 takeaways * 300ms each = 1.5s of loading before the user sees results.
**Do this instead:** Return distillation results immediately. Fire embedding as `.catch()`-wrapped background calls. Knowledge base semantic search degrades gracefully (falls back to text search) until embeddings populate.

### Anti-Pattern 4: Per-Message Distillation

**What people do:** Extract takeaways after every AI response to keep the KB "live."
**Why it's wrong:** Takeaways need session-level perspective. Mid-session fragments are low quality. Every message would cost a Haiku call.
**Do this instead:** Distill only at session close or explicit user request. Guard with `distilledAt` cooldown.

### Anti-Pattern 5: Conflating Topics and Themes

**What people do:** Use a single model for both session-level tags ("work stress" from one session) and cross-session patterns ("recurring fear of abandonment").
**Why it's wrong:** Topics are labels applied at distillation time per session. Themes emerge from multiple sessions over time. Mixing them creates confusion in the browse UI.
**Do this instead:** Keep `JournalTopic` and `RecurringTheme` as separate models. A topic becomes a theme candidate when it appears in 3+ sessions — that graduation is a separate computed step.

### Anti-Pattern 6: Feeding Inner Thoughts Distillation into globalFacts

**What people do:** After extracting takeaways, add key insights to `User.globalFacts` for cross-feature context.
**Why it's wrong:** `globalFacts` is consumed by partner session AI prompts. Injecting personal journal insights into conflict resolution sessions would be confusing and boundary-violating for the user.
**Do this instead:** Keep Inner Thoughts distillation isolated in `JournalTakeaway` and `RecurringTheme`. Cross-feature intelligence (if ever added) should go through the explicit `Insight` table with user visibility.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AWS Bedrock (Haiku 4.5) | Single call per distillation; JSON output | Same model as conversation-summarizer.ts; JSON output mode |
| AWS Titan Embed v2 | Fire-and-forget per takeaway via getEmbedding() | Same function as embedInnerWorkSessionContent() |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| distillation-service ↔ inner-work controller | Direct import | Controller calls service; service owns Prisma + Bedrock calls |
| knowledge-base routes ↔ inner-thoughts routes | Same Express router file | Mount at `/inner-thoughts/knowledge/` prefix — careful about route ordering vs `/:id` |
| JournalTakeaway ↔ Person | Soft text match, no FK | Person linkage resolved at query time via content search; not stored |
| RecurringTheme ↔ JournalTopic | No FK — themes aggregate independently | Theme creation is a background step; no synchronous dependency on topics |
| distillation-service ↔ global-memory.ts | No integration | Inner Thoughts distillation must NOT touch globalFacts |
| distillation-service ↔ conversation-summarizer.ts | Read-only | Reads existing output; does not call summarizer functions |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 sessions/user | Synchronous topic deduplication with in-memory Levenshtein; no optimization needed |
| 100-500 sessions/user | Add index on `JournalTopic.name` (already in model); paginate knowledge base APIs with `limit/offset` |
| 500+ sessions/user | pgvector ANN index on `JournalTakeaway.contentEmbedding`; consider denormalized KB stats per user |

### Scaling Priorities

1. **First bottleneck:** Knowledge base home query issues 5+ independent DB calls. Fix: combine into a single CTE or add a cached "knowledge stats" JSON column on the `User` record (updated async after each distillation).
2. **Second bottleneck:** Topic deduplication Levenshtein check across 100+ topics slows distillation. Fix: move topic matching into DB with `pg_trgm` similarity index instead of in-memory JS loop.

---

## Sources

- Direct analysis of `backend/prisma/schema.prisma` (2026-03-11)
- Direct analysis of `backend/src/services/conversation-summarizer.ts`
- Direct analysis of `backend/src/services/embedding.ts`
- Direct analysis of `backend/src/services/people-extractor.ts`
- Direct analysis of `backend/src/services/global-memory.ts`
- Direct analysis of `backend/src/controllers/inner-work.ts`
- Direct analysis of `docs/architecture/backend-overview.md`
- Direct analysis of `docs/architecture/structure.md`
- Project context from `.planning/PROJECT.md`

---

*Architecture research for: Inner Thoughts Journal — distillation, tagging, knowledge base*
*Researched: 2026-03-11*
