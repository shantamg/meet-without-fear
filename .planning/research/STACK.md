# Stack Research

**Domain:** Inner Thoughts Journal — topic tagging, knowledge base, distillation, browsable insights
**Researched:** 2026-03-11
**Confidence:** HIGH (all new additions verified against existing stack, versions checked against npm)

---

## What the Existing Stack Already Handles

These capabilities are already production-ready in the codebase. Do NOT re-implement or add competing libraries.

| Capability | Existing Solution | Location |
|------------|------------------|----------|
| Session-level semantic search | pgvector + Amazon Titan embeddings | `embedding.ts` — `searchInnerWorkSessionContent()` |
| Session embedding pipeline | `embedInnerWorkSessionContent()` | `embedding.ts` |
| Cross-session rolling summaries | `updateInnerThoughtsSummary()` | `conversation-summarizer.ts` |
| keyThemes extracted per session | Already in `SummarizationResult.keyThemes[]` | `conversation-summarizer.ts` |
| People extraction and tracking | Haiku + `Person` / `PersonMention` models | `people-extractor.ts`, schema.prisma |
| Global fact consolidation | Haiku + `User.globalFacts` | `global-memory.ts` |
| AI JSON extraction (Haiku) | `getHaikuJson<T>()` wrapper | `bedrock.ts` |
| SSE streaming for AI responses | Already in inner-thoughts chat | `stage0.ts` |
| React Query cache-first state | `useInfiniteQuery`, `useQuery`, `setQueryData` | mobile hooks |
| Ably realtime events | Inner work session publishing | `realtime.ts` |
| Circuit breaker for Haiku | `withHaikuCircuitBreaker()` | `circuit-breaker.ts` |
| Prisma migrations | Already established workflow | `backend/prisma/` |

---

## Recommended Stack: New Additions Only

### Core Technologies — No New Additions Needed

The backend AI pipeline (Haiku for extraction, Sonnet for distillation), Prisma/PostgreSQL for storage, and Bedrock embeddings are all present. The feature requirements map onto existing service patterns with schema additions only.

### New Database Capabilities

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL `tsvector` GIN index | (built-in, no version change) | Full-text keyword search across takeaways and tags | Hybrid with pgvector: keyword search for exact tag/topic lookup, vector for semantic. GIN is 3x faster than GiST for read-heavy workloads. Already using PostgreSQL — no new dependency. |
| PostgreSQL `text[]` array with GIN | (built-in) | Tag storage on `InnerWorkSession.tags` | Prisma `String[]` maps directly; GIN index on array enables `@>` containment queries (find sessions with tag "anxiety"). Zero-overhead addition to schema. |

These are SQL features on the existing Postgres instance. No new service or library is required.

### New Mobile Library: List Performance

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@shopify/flash-list` | `^2.3.0` | Browsable sessions list and knowledge base feed | The `InnerWorkSession` list will grow unboundedly. React Native's built-in `FlatList` forces full re-renders on every scroll event. FlashList v2 recycles item components, maintains 60fps on thousands of items, and requires no `getItemLayout`. The project already has `newArchEnabled: true` (Expo 54, RN 0.84) — FlashList v2 requires New Architecture and will work immediately. |

**FlashList v2 compatibility confirmed:** Expo 54 + `newArchEnabled: true` in `mobile/app.json` = New Architecture enabled. FlashList v2.3.0 (latest as of 2026-03-11) runs on new arch only. No native build steps — JS-only library.

### Supporting Libraries — No New Additions Needed

| Requirement | Existing Solution | Rationale |
|-------------|------------------|-----------|
| Swipe-to-delete / swipe actions on insights | `react-native-gesture-handler` `ReanimatedSwipeable` | Already in the project at v2.28.0. Import from `react-native-gesture-handler/ReanimatedSwipeable`. No new package. |
| Animated expand/collapse for distillation UI | `react-native-reanimated` `useAnimatedStyle` + `withSpring` | Already at v4.1.1. Layout animations via `itemLayoutAnimation={LinearTransition}` on FlashList. |
| Infinite scroll pagination | TanStack Query `useInfiniteQuery` | Already in the project (React Query v5.90.21). Cursor-based pagination with `getNextPageParam`. No new package. |
| Date grouping in session list | Standard `Date` JS APIs | Session list groups by date. No library needed — `toLocaleDateString()` with Intl is sufficient. |
| Search input debounce | `useCallback` + `setTimeout` | No library. 300ms debounce before triggering query. Already done elsewhere in the codebase pattern. |

---

## Installation

```bash
# In mobile/ workspace — only new dependency
cd mobile
npm install @shopify/flash-list@^2.3.0

# No backend dependency changes needed
# No new Prisma schema packages needed
# No new AI model clients needed
```

---

## Schema Additions Required (via Prisma Migration)

These are schema changes, not new libraries. Documented here because they are stack-level decisions that affect every phase.

### `InnerWorkSession` additions

```prisma
model InnerWorkSession {
  // ... existing fields ...

  // New fields for v1.2 Journal feature
  tags              String[]    @default([])         // AI-extracted + user-edited topic tags
  takeaways         Json?                            // DistillationResult: { items: TakeawayItem[] }
  distilledAt       DateTime?                        // When last distillation ran
  sessionDate       DateTime    @default(now())      // Explicit date for "dated journal" display (may differ from createdAt if session spans midnight)
  messageCount      Int         @default(0)          // Denormalized for list queries (avoid COUNT join)
}
```

### New `JournalTakeaway` model (alternative to JSON)

The `takeaways Json?` approach keeps retrieval simple (single row fetch). The alternative normalized table enables user editing of individual takeaways. Use normalized table — it supports the "user can edit, merge, reorganize" requirement without JSON patch gymnastics.

```prisma
model JournalTakeaway {
  id          String           @id @default(cuid())
  session     InnerWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId   String
  content     String           @db.Text         // The takeaway text
  category    String?                           // "insight", "pattern", "action", "question"
  order       Int              @default(0)      // User-controlled ordering
  editedByUser Boolean         @default(false)  // Track if user modified AI output
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@index([sessionId, order])
}
```

### `User` model addition

```prisma
model User {
  // ... existing fields ...
  journalThemes     Json?   // Accumulated theme graph: { [theme: string]: { count: int, lastSeen: string } }
}
```

This single JSON column on User avoids a separate `Theme` table. It accumulates theme frequency across sessions for the "organic recognition" feature. Merged and pruned by the same Haiku consolidation pattern already used in `global-memory.ts`.

### Indexes to add

```sql
-- Fast tag lookup: "show all sessions tagged 'anxiety'"
CREATE INDEX "InnerWorkSession_tags_gin" ON "InnerWorkSession" USING GIN (tags);

-- Fast date-ordered list per user
CREATE INDEX "InnerWorkSession_userId_sessionDate" ON "InnerWorkSession" ("userId", "sessionDate" DESC);

-- Full-text on tags + theme for keyword search (optional, pgvector handles semantic)
CREATE INDEX "InnerWorkSession_tags_tsvector" ON "InnerWorkSession" USING GIN (to_tsvector('english', array_to_string(tags, ' ')));
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@shopify/flash-list` v2 | `react-native` FlatList | FlatList degrades with 50+ sessions (blank frames, re-renders on scroll). FlashList v2 handles thousands. |
| `@shopify/flash-list` v2 | FlashList v1 (1.x) | v1 requires `estimatedItemSize` tuning and has known blank-space issues. v2 is JS-only, auto-sizes, and is the maintained path. |
| PostgreSQL `text[]` + GIN | Separate `Tag` table with FK | Separate table adds joins for every list query. Array column + GIN index is a well-established Postgres pattern for this scale. |
| `User.journalThemes` JSON column | Separate `JournalTheme` table | Separate table with upserts per tag is correct at high volume but adds complexity at this scale (single user, <1000 sessions). JSON column is simpler, adequate, and consistent with `globalFacts` pattern already in use. |
| Haiku for tag extraction | Sonnet for tag extraction | Haiku is 10-20x cheaper for short structured extraction tasks. Tag extraction is classification, not generation — Haiku is sufficient. |
| `ReanimatedSwipeable` (existing) | `react-native-swipeable-item` | An additional dependency when the existing gesture handler already provides this. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ElasticSearch / OpenSearch | External service, operational overhead, not needed at this scale. pgvector + PostgreSQL FTS handles semantic + keyword search in the existing database. | pgvector (existing) + PostgreSQL `tsvector` GIN index |
| Redis for tag caching | Overkill. Tag/theme queries on indexed Postgres will be <10ms at any realistic journal size. | Direct Prisma queries with GIN indexes |
| GraphQL / DataLoader for knowledge base | Introduces new API layer. Existing REST + React Query patterns are sufficient. | Existing Express REST + `useInfiniteQuery` |
| `fuse.js` for client-side search | Client-side search of unbounded session history is unreliable. Server-side pgvector + FTS is correct. | Server-side search endpoint |
| `react-native-calendars` for date navigation | Heavy dependency for what amounts to a date-grouped section list. FlatList + section headers or FlashList with sticky headers handles this. | FlatList `SectionList` or FlashList with sticky header support |

---

## Stack Patterns for This Feature

**If rendering a list of past journal sessions (browsable knowledge base):**
- Use `@shopify/flash-list` with `estimatedItemSize` omitted (v2 auto-sizes)
- Backend: cursor pagination via `useInfiniteQuery`, cursor = `sessionDate` ISO string
- Group by date in `getNextPageParam` response or client-side section extraction
- Filter by tag: `WHERE tags @> ARRAY['anxiety']::text[]` — uses GIN index

**If rendering distilled takeaways for a single session:**
- Use a simple `FlatList` (short list, no perf concern) with `ReanimatedSwipeable` for swipe-to-edit/delete
- Backend: `GET /inner-work/sessions/:id/takeaways` returning `JournalTakeaway[]` ordered by `order`

**If searching across all sessions:**
- Backend: hybrid query — pgvector cosine similarity (`searchInnerWorkSessionContent`) merged with PostgreSQL `tsvector` keyword match
- RRF (Reciprocal Rank Fusion) scoring unnecessary at this scale; prefer vector results, fall back to keyword if vector returns empty
- Mobile: single `useQuery` on debounced search string, show results in FlashList

**If displaying the "themes/people" knowledge graph:**
- Read from `User.journalThemes` JSON (theme frequencies) + `Person` records (already populated by `people-extractor.ts`)
- No separate endpoint — append to existing user profile response or add lightweight `/inner-work/knowledge-base` endpoint
- Mobile: simple `FlatList` (bounded data, no infinite scroll needed)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@shopify/flash-list@^2.3.0` | Expo 54 (`newArchEnabled: true`), RN 0.84 | New Architecture only. Project already enabled. Confirmed compatible. |
| `@shopify/flash-list@^2.3.0` | `react-native-reanimated@4.1.1` | FlashList v2 integrates with Reanimated for `itemLayoutAnimation`. Official guide documented. |
| `@shopify/flash-list@^2.3.0` | `react-native-gesture-handler@2.28.0` | No direct dependency, but both work together in list + swipe patterns. |
| PostgreSQL `tsvector` GIN | Prisma 6.19.2 | Prisma does not manage raw GIN indexes for computed columns — must be in migration SQL directly (not via `schema.prisma`). Established pattern in this codebase (see `$executeRaw` in `embedding.ts`). |

---

## Sources

- `mobile/app.json` — `newArchEnabled: true` confirmed (Expo 54, RN 0.84)
- [FlashList v2 blog post](https://shopify.engineering/flashlist-v2) — v2 new arch requirement, JS-only, no size estimates
- [@shopify/flash-list npm](https://www.npmjs.com/package/@shopify/flash-list) — v2.3.0 latest as of 2026-03-11
- [Expo FlashList docs](https://docs.expo.dev/versions/latest/sdk/flash-list/) — MEDIUM confidence (confirms Expo compatibility)
- [ReanimatedSwipeable docs](https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable/) — existing package, no new install
- [TanStack Query infinite queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) — `useInfiniteQuery` cursor pattern
- [PostgreSQL GIN indexes for arrays](https://pganalyze.com/blog/gin-index) — MEDIUM confidence (indexing arrays pattern)
- [Hybrid search pgvector + FTS](https://dev.to/lpossamai/building-hybrid-search-for-rag-combining-pgvector-and-full-text-search-with-reciprocal-rank-fusion-6nk) — MEDIUM confidence (RRF not needed at this scale)
- Existing codebase: `embedding.ts`, `people-extractor.ts`, `global-memory.ts`, `conversation-summarizer.ts` — HIGH confidence (directly inspected)

---

*Stack research for: Inner Thoughts Journal — topic tagging, knowledge base, distillation, browsable insights*
*Researched: 2026-03-11*
