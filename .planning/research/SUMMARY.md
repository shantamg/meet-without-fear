# Project Research Summary

**Project:** Meet Without Fear — Inner Thoughts Journal (v1.2 milestone)
**Domain:** AI-guided therapy-prep journaling with distillation, topic tagging, and browsable knowledge base
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

The Inner Thoughts Journal milestone adds a knowledge layer on top of a fully functional inner thoughts chat system. The existing codebase already contains the core primitives — session embeddings, rolling conversation summaries with `keyThemes`, people extraction, and global fact consolidation — meaning this milestone is primarily a UI and pipeline wiring problem, not a data infrastructure build. The key architectural insight from research is that distillation (extracting user-facing takeaways from a completed session) must be treated as a distinct lifecycle event, entirely separate from the existing message-response path. It reads the already-computed `conversationSummary`, calls Haiku once, and writes to new knowledge-base tables that are explicitly namespaced away from the partner-session context chain.

The recommended approach is to build in five sequential phases: schema first (new models depend on the migration being complete), then shared types, then the distillation service, then knowledge-base browse endpoints, then the mobile UI. Only one new mobile dependency is needed (`@shopify/flash-list@^2.3.0` for the session list), and no new backend services or AI models are required. Every new AI call uses Haiku 4.5, the same model already used for structured extraction throughout the codebase. The build order is dictated by hard dependencies — nothing in phases 3-5 can be tested without the migration from phase 1.

The highest-risk pitfall is namespace pollution: journal distillation data must never flow into `User.globalFacts` or the partner-session context retrieval path. Research confirms this is a privacy-level trust violation, not just a technical mistake. The second-highest risk is tone: LLM distillation defaults to interpretation ("you have an anxious attachment pattern") rather than organization ("you mentioned feeling overlooked in three sessions this week"). Both risks have explicit mitigations — one is a code boundary enforced with a test, the other is a prompt constraint that must be validated against real journaling conversations before shipping.

---

## Key Findings

### Recommended Stack

The backend requires no new services, AI models, or libraries. The distillation pipeline maps directly onto existing patterns: Haiku for structured JSON extraction, Titan Embed v2 for pgvector embeddings, Prisma for all persistence. Two PostgreSQL capabilities are used as new additions — `text[]` array columns with GIN indexes for tag lookup, and `tsvector` GIN indexes for keyword search — but both are native to the existing Postgres instance and require no dependency changes. On mobile, `@shopify/flash-list@^2.3.0` is the single new dependency, required because the inner thoughts session list is unbounded. The project already has `newArchEnabled: true` (Expo 54, RN 0.84), satisfying FlashList v2's new-architecture requirement. All animation, swipe, and pagination needs are covered by libraries already installed.

**Core technologies:**
- `@shopify/flash-list@^2.3.0` (mobile only): Unbounded session list rendering — FlatList degrades at 50+ sessions; FlashList v2 recycles items and maintains 60fps at any scale.
- PostgreSQL `text[]` + GIN index: Tag storage and `@>` containment queries — zero new infrastructure, directly mapped by Prisma `String[]`.
- PostgreSQL `tsvector` GIN: Keyword search fallback alongside pgvector semantic search — must be added via raw migration SQL, not `schema.prisma`.
- AWS Haiku 4.5 (existing): Single distillation call per session — 10-20x cheaper than Sonnet for structured classification; same model as `conversation-summarizer.ts`.
- TanStack Query `useInfiniteQuery` (existing): Cursor-based pagination for session list — already in project at v5.90.21.

See `.planning/research/STACK.md` for schema additions, version compatibility matrix, and installation instructions.

### Expected Features

The milestone adds to an already-working chat surface. Research across Rosebud, Mindsera, Grow Therapy, Reflectly, and clinical literature identifies clear table-stakes expectations and several genuine first-mover differentiators. Three features are explicitly anti-patterns for a therapeutic context: streaks/gamification, real-time theme detection during chat, and automatic therapist sharing.

**Must have (table stakes):**
- Dated session list with date prominent — every journaling tool shows this; `createdAt` exists, display work only.
- AI-generated session title and summary on close — users refuse to name entries; `title` and `summary` fields exist but need reliable population.
- Post-vent distillation trigger — explicit "want a summary?" step at session end; Grow Therapy, Rosebud, and clinical research validate this as the core therapy-prep primitive.
- Editable takeaways — users must be able to correct AI output; trust is built through control, not accuracy.
- Topic tag per session (AI-generated, user-editable) — `theme` field exists but needs reliable population; needed before browse view is useful.
- Session browse by topic and person — without this, accumulated sessions are inaccessible.
- People mentioned list — extraction infrastructure exists; only aggregation query and UI are new.

**Should have (differentiators):**
- Organic cross-session theme clustering — "work stress has come up in 4 sessions over 3 weeks"; no competitor does cross-session grouping without pre-defined categories.
- Dedicated people view — Rosebud mentions relationship patterns but has no person-centric view; people extraction already runs, making this a first-mover advantage.
- Linked partner session badge in journal — no competitor bridges private journaling to relational conflict prep; infrastructure exists.
- Inline edit UX for takeaways — Grow Therapy found that client autonomy over AI summaries is critical for adoption.

**Defer (v2+):**
- Person profile page with mention timeline and co-occurring themes.
- Export / therapy-prep print view (premature before content is trusted by users).
- Semantic embedding-based theme clustering (string-match grouping is sufficient at launch volume).
- Multiple tags per session (single primary tag is sufficient to validate browse patterns first).

See `.planning/research/FEATURES.md` for prioritization matrix, dependency graph, competitor analysis, and UX principles.

### Architecture Approach

The architecture is an additive layer on top of the existing inner-work system. The distillation pipeline is a new service (`distillation-service.ts`) that reads the already-computed `conversationSummary` from `InnerWorkSession`, makes a single Haiku call to extract takeaways and topics, writes to three new models (`JournalTakeaway`, `JournalTopic`, `RecurringTheme`) in a Prisma transaction, and then fires embedding and theme-detection as background calls. The knowledge base is a set of read-optimized browse endpoints under `/inner-thoughts/knowledge/` that aggregate across the new tables. The mobile layer adds a `KnowledgeBaseScreen` and `DistillationReviewSheet`, both backed by React Query hooks following the existing cache-first pattern.

**Major components:**
1. `distillation-service.ts` (new) — Core pipeline: cooldown guard, summary read, Haiku extraction, Prisma transaction, fire-and-forget enrichment.
2. `JournalTakeaway` model (new) — User-editable extracted insights per session; includes `contentEmbedding` for KB semantic search; soft-delete with `isDeleted`.
3. `JournalTopic` model + join tables (new) — Normalized deduplicatable topic tags; tracks `sessionCount` and `takeawayCount` as denormalized counters updated at write time.
4. `RecurringTheme` model (new) — Cross-session patterns that only emerge after 3+ sessions; distinct from `JournalTopic` (topics are labels, themes are organic patterns).
5. Knowledge base endpoints (new) — `GET /inner-thoughts/knowledge` aggregate, plus per-dimension detail endpoints (topics, themes, people, takeaways); lazy cross-session summary generation on first theme detail request.
6. `KnowledgeBaseScreen` + `DistillationReviewSheet` (new mobile) — Browse with tab navigation; post-distillation inline editing surface.

Five critical patterns govern implementation: (1) always read `conversationSummary` before calling Haiku; (2) fire embedding and theme detection as background calls after returning the response; (3) deduplicate topics via Levenshtein normalization before creating new records; (4) maintain denormalized `sessionCount` on `JournalTopic` at write time; (5) guard all distillation runs with `distilledAt` cooldown for idempotency.

See `.planning/research/ARCHITECTURE.md` for full data models, API contracts, build order, and anti-patterns.

### Critical Pitfalls

1. **Breaking existing inner thoughts chat** — Distillation added to the message response path causes timeouts for existing users. Prevention: distillation must be fire-and-forget from day one; measure message response time before and after; it must be unchanged.

2. **Namespace collision with globalFacts** — Journal distillation data written into `User.globalFacts` causes the partner session AI to reference inner thoughts content. Prevention: audit `context-retriever.ts` and `context-assembler.ts` before writing any journal knowledge storage; write an explicit test that partner session context contains no inner thoughts content.

3. **AI distillation that tells users how they feel** — LLMs default to interpretation ("you have an anxious attachment pattern") when the product needs organization ("you mentioned feeling overlooked"). Prevention: explicit prompt constraints — "quote or closely paraphrase," "use language the user themselves used," "do not infer psychological patterns from a single session." Validate against real venting conversations before shipping.

4. **Tag explosion from over-categorization** — Unconstrained topic extraction produces 40+ tags after one month of journaling, making the browse view unusable. Prevention: cap extraction to 3 primary topics per session; require 3+ session recurrence before promoting a topic to the knowledge base; apply the same consolidation pattern used by `global-memory.ts`.

5. **Distillation timing broken for long sessions** — Users who vent for 30+ messages wait 30-60 seconds for distillation and see "no takeaways yet" when they return. Prevention: cap distillation input at last 30 messages plus existing summary; trigger incremental distillation at session milestones (10 messages, then every 15), not only on close.

6. **Crossing the therapy boundary via accumulated pattern language** — Cross-session synthesis starts using clinical vocabulary ("attachment style," "avoidance behavior"), making the app feel like a diagnosis tool. Prevention: frame all cross-session observations as "what you've written"; require 3+ sessions before surfacing any pattern; include persistent UI copy framing patterns as "bring these to your therapist to explore."

See `.planning/research/PITFALLS.md` for full prevention strategies, recovery costs, and a verification checklist.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Schema, Migration, and Integration Audit

**Rationale:** Every subsequent phase depends on the migration being complete. More critically, the namespace isolation audit (verifying `context-retriever.ts` excludes `InnerWorkSession` from partner session context) must happen before any journal knowledge storage is written. This phase has zero user-visible output but maximum downstream impact.

**Delivers:** Prisma migration with `JournalTakeaway`, `JournalTopic`, `SessionTopicLink`, `TakeawayTopicLink`, `RecurringTheme` models; `distilledAt` on `InnerWorkSession`; GIN indexes on tags; shared DTO types in `shared/src/dto/journal.ts`; confirmed namespace isolation with a passing test.

**Addresses:** Dated session list (add `sessionDate` display field), reliable title/summary population (wire `updateSessionMetadata` to fire consistently on session close).

**Avoids:** Namespace collision pitfall (Pitfall 6 in PITFALLS.md), breaking existing chat (Pitfall 1) — both verified at this phase before any logic is written.

**Research flag:** Standard patterns. Prisma migration workflow, pgvector indexing, and context-scoping are all well-documented in the existing codebase. The integration audit is a code-read task, not a research task.

---

### Phase 2: Distillation Service and Post-Session Trigger

**Rationale:** The distillation service is the core new capability and the prerequisite for all knowledge-base content. Without it, the browse views have nothing to show. The prompt design requires testing against real venting conversations — this phase should not be considered complete until real data has been used to validate that takeaway tone is organizational, not interpretive.

**Delivers:** `distillation-service.ts` with Haiku extraction, topic deduplication, and Prisma transaction; `POST /inner-thoughts/:id/distill` endpoint; `PATCH /inner-thoughts/knowledge/takeaways/:id` for user edits; auto-distill trigger on session close; incremental distillation milestones (10-message threshold, 15-message cadence); fire-and-forget embedding of takeaways.

**Addresses:** Post-vent distillation trigger (P1), editable takeaways (P1), topic tags per session (P1), reliable AI-generated title/summary (P1).

**Avoids:** AI tone pitfall — prompt must be validated; distillation timing pitfall — incremental triggers required; tag explosion — 3-topic cardinality cap enforced in prompt.

**Research flag:** The distillation prompt design is the highest-risk element of this phase. It needs testing against real journaling conversations before launch. No additional research tool call needed, but plan for iteration cycles on the prompt before calling this phase done.

---

### Phase 3: Knowledge Base Browse Backend

**Rationale:** Once distillation is writing data, browse endpoints can be built against real records. Building browse endpoints before distillation exists means building against empty tables. Recurring theme detection logic also belongs here because it reads accumulated topic data from phase 2.

**Delivers:** `GET /inner-thoughts/knowledge` aggregate endpoint; topic, theme, and people browse endpoints; people aggregation query (`Person` + `PersonMention` scoped to inner thoughts); lazy cross-session summary generation for theme detail; `RecurringTheme` creation from `updateRecurringThemes()` fire-and-forget.

**Addresses:** Session browse by topic (P1), people mentioned list (P1), cross-session theme clustering (P2), linked partner session badge (P2).

**Avoids:** Knowledge base navigation collapse — define information architecture with max-2-tap depth before building screens; therapy boundary pitfall — 3-session minimum for `RecurringTheme` creation enforced here.

**Research flag:** Standard REST patterns. The aggregation queries are straightforward Prisma queries. Lazy theme summary generation follows the established `withHaikuCircuitBreaker` pattern.

---

### Phase 4: Mobile UI — Session List and Distillation Review

**Rationale:** The distillation review sheet and updated session list are the first things users will see. Ship these together — the dated session list is table-stakes, and users who tap into a session need the distillation review immediately available.

**Delivers:** `@shopify/flash-list` installed; dated session list with visible date header grouping; `DistillationReviewSheet` component with inline editing; `useDistillation` mutation hook; `useJournalTakeaways` CRUD hook; query keys added to `queryKeys.ts`; React Query cache updated via `setQueryData` on distillation completion (no `invalidateQueries`).

**Addresses:** Dated session list (P1), distillation trigger and review UI (P1), editable takeaways UI (P1).

**Avoids:** Cache invalidation race condition (use `setQueryData`, not `invalidateQueries`); UX pitfall of "no takeaways yet" with no progress indicator; broken inline edit (edit must ship with distillation in v1 — never ship a read-only distillation view).

**Research flag:** Standard patterns. FlashList v2 integration, React Query mutation patterns, and `ReanimatedSwipeable` for swipe-to-delete are documented and the project already satisfies compatibility requirements.

---

### Phase 5: Mobile UI — Knowledge Base Browse Screen

**Rationale:** The browse screen depends on real data accumulated from phases 2-3 and on the session list UI patterns established in phase 4. It should ship after the distillation flow is stable so the browse UI reflects accurate data from the start.

**Delivers:** `KnowledgeBaseScreen` with tab navigation (Time / Topic / Person / Theme); topic detail screen; people list; theme detail screen; `useKnowledgeBase` React Query hooks; FlashList-based lists with sticky tab headers; "pinned for therapy" workflow for designating specific takeaways; curated default view (3-5 themes, 3 recent sessions) rather than flat browse.

**Addresses:** Browse by topic/date (P1), people view (P1), cross-session theme view (P2), linked partner session badge display (P2), keyword search (P2 — add after validation of browse patterns).

**Avoids:** Knowledge base navigation collapse — curated default view rather than flat browse; surveillance feel — all AI-generated content labeled "Based on what you wrote in X sessions"; knowledge base not as default view (default is new/continue session).

**Research flag:** The information architecture of the browse screen is the design decision most likely to need iteration. The 2-tap depth limit is a hard constraint. Consider a lightweight wireframe review before building the full screen. No research tool call needed.

---

### Phase Ordering Rationale

- Schema must precede all other phases because `JournalTakeaway`, `JournalTopic`, and `RecurringTheme` have no fallback representations.
- The integration audit belongs in Phase 1 because retrofitting namespace isolation after distillation data is written is a HIGH recovery cost (schema migration + backfill script + partner session testing).
- Distillation service precedes browse backend because all browse queries depend on `JournalTakeaway` and `JournalTopic` records existing.
- Mobile session list ships before the full knowledge base because it is table-stakes and can be validated immediately with real user data.
- Full knowledge base browse ships last because it benefits from real accumulated data and from the session list patterns being stable.

### Research Flags

Phases likely needing validation during planning or implementation:
- **Phase 2 (distillation prompt):** Not a research tool call, but a mandatory testing gate. The distillation prompt must be tested against real venting conversations before phase 2 is considered complete. No standard reference resolves this — it requires empirical iteration.
- **Phase 5 (browse information architecture):** The 2-tap depth constraint and curated default view design benefit from lightweight wireframe review before implementation. Low cost to prototype, high cost to restructure after mobile screens are built.

Phases with standard patterns (skip additional research):
- **Phase 1 (schema/migration):** Prisma migration workflow and pgvector indexing are established patterns in this codebase.
- **Phase 3 (browse backend):** Prisma aggregation queries and Haiku JSON extraction follow patterns already present in `conversation-summarizer.ts` and `global-memory.ts`.
- **Phase 4 (mobile session list + distillation sheet):** FlashList v2 and React Query mutation patterns are documented and the project already satisfies all compatibility requirements.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Single new dependency (FlashList v2) verified against `mobile/app.json`; all other decisions grounded in direct codebase inspection. No speculative library choices. |
| Features | HIGH | Competitor analysis covers major players (Rosebud, Mindsera, Grow Therapy, Reflectly); clinical research sources cited; anti-feature reasoning grounded in domain literature and research studies. |
| Architecture | HIGH | Grounded in direct analysis of existing schema, services, and controllers. Build order reflects actual code dependencies, not inference. |
| Pitfalls | HIGH | Integration pitfalls grounded in existing codebase and actual code boundaries. UX and boundary pitfalls corroborated by clinical literature and domain research. |

**Overall confidence:** HIGH

### Gaps to Address

- **Distillation prompt tone validation:** Research identifies the interpretive-vs-organizational risk clearly, but the correct prompt formulation can only be validated empirically against real journaling content. Plan for 2-3 prompt iterations before phase 2 ships.
- **Incremental distillation milestone thresholds:** Research recommends 10-message first trigger, 15-message cadence, but optimal values depend on actual user session lengths in production. Start with research values; adjust after first week of data.
- **Topic deduplication quality at scale:** Levenshtein distance 2 is the recommended strategy for fewer than 100 topics per user. If users accumulate significantly more, `pg_trgm` similarity indexing in the database is the upgrade path. Monitor topic fragmentation rate in the first month.
- **Knowledge base default view curation:** Research recommends curated highlights over flat browse, but the exact composition (3 themes vs. 5, recent vs. most-mentioned people) needs product validation. Build with configurable limits rather than hardcoded values.

---

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `backend/prisma/schema.prisma` — existing models, relations, and fields
- `backend/src/services/conversation-summarizer.ts` — `SummarizationResult` type, `keyThemes`, triggers
- `backend/src/services/embedding.ts` — `embedInnerWorkSessionContent`, `searchInnerWorkSessionContent`, `vectorToSql`
- `backend/src/services/people-extractor.ts` — `extractAndTrackPeople`, `sourceType` filter pattern
- `backend/src/services/global-memory.ts` — `globalFacts` consolidation pattern, 50-fact cap
- `backend/src/services/crisis-detector.ts` — crisis detection scope
- `backend/src/controllers/inner-work.ts` — existing message handler, fire-and-forget pattern
- `mobile/app.json` — `newArchEnabled: true` confirmed (Expo 54, RN 0.84)

### Secondary (MEDIUM confidence — official product and library documentation)
- [@shopify/flash-list npm](https://www.npmjs.com/package/@shopify/flash-list) — v2.3.0 latest, new arch requirement
- [FlashList v2 Shopify Engineering blog](https://shopify.engineering/flashlist-v2) — JS-only, auto-sizing, no `estimatedItemSize` required
- [Grow Therapy AI reflections announcement](https://growtherapy.com/blog/grow-therapy-unveils-ai-powered-between-session-reflections-to-deepen-therapy-insights/) — client autonomy over AI summaries finding
- [Journaling with LLMs (Frontiers 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12234568/) — decouple journaling from AI; no real-time analysis during venting
- [TanStack Query infinite queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) — cursor-based pagination pattern

### Tertiary (MEDIUM confidence — domain and research literature)
- [Gamification backfire (Consumer Psychology Review 2026)](https://myscp.onlinelibrary.wiley.com/doi/10.1002/arcp.70004) — therapeutic context gamification harm
- [PKM over-tagging patterns (Forte Labs)](https://fortelabs.com/blog/a-complete-guide-to-tagging-for-personal-knowledge-management/) — collection vs. connection problem
- [Hidden dangers of AI therapy tools (Healio 2025)](https://www.healio.com/news/psychiatry/20250915/the-hidden-dangers-of-ai-therapy-tools-what-clinicians-need-to-know) — clinical boundary risks
- [Contextual AI Journaling: MindScape (PMC/NCBI)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11275533/) — reflective vs. prescriptive AI design
- [PostgreSQL GIN indexes for arrays (pganalyze)](https://pganalyze.com/blog/gin-index) — `@>` containment query pattern

---

*Research completed: 2026-03-11*
*Ready for roadmap: yes*
