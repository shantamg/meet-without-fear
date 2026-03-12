# Pitfalls Research

**Domain:** AI-guided journaling distillation, topic extraction, and knowledge browsing — added to existing chat-based app
**Researched:** 2026-03-11
**Confidence:** HIGH (integration pitfalls grounded in existing codebase; UX/boundary pitfalls grounded in domain literature)

---

## Critical Pitfalls

### Pitfall 1: Breaking Existing Inner Thoughts Chat While Adding Distillation

**What goes wrong:**
Distillation (post-session summarization, topic extraction, embedding updates) is added to the `POST /inner-thoughts/:id/messages` response path. The existing inner thoughts chat starts timing out or returning errors because distillation calls are now in the critical path. Users lose access to a feature that already worked.

**Why it happens:**
The existing `inner-work.ts` controller already calls `embedInnerWorkSessionContent` and `updateInnerThoughtsSummary` synchronously in the message handler. Distillation feels like "just another step" — developers add it in the same chain. But distillation (theme detection, takeaway extraction, knowledge graph update) is significantly heavier than a summary update. It becomes the slowest operation in the chain.

**How to avoid:**
Distillation must be fire-and-forget, following the `background-classifier.ts` pattern already established in this codebase. The message response returns before distillation starts. Distillation results are surfaced to the user asynchronously (polled or pushed via Ably), never blocking the reply. Treat distillation as a separate lifecycle — triggered after session close, not after each message.

**Warning signs:**
- Message response times in inner thoughts increase above 5s
- Users report "spinner doesn't stop" on sending messages
- `bedrock circuit breaker` opens during inner thoughts sessions
- Distillation errors surface as message send failures in frontend logs

**Phase to address:**
Distillation infrastructure phase. Establish the async contract (fire-and-forget trigger, Ably push for completion) before writing any distillation logic.

---

### Pitfall 2: Over-Categorization That Feels Like a Filing System, Not a Brain

**What goes wrong:**
Topic extraction produces a flat list of tags like: `[anxiety, work, mom, boundaries, work-mom, anxiety-work, conflict, relationship, stress]`. The knowledge base becomes a tag cloud. Users open "Browse by Topic" and see 40+ tags after 10 sessions. Nothing feels meaningfully organized. The UI feels like Gmail's label explosion — technically correct, practically useless.

**Why it happens:**
Haiku is given a message and asked "what topics are covered?" It will faithfully identify every topic mentioned. Without a constraint on cardinality and without a concept of "recurring vs. incidental," every session adds new tags. The system mistakes mention frequency (a topic appeared) for significance (a topic matters to this user).

The existing `globalFacts` system in this codebase already has this ceiling — it caps at 50 facts and uses Haiku to consolidate. Topic tagging needs an equivalent consolidation mechanism, not just extraction.

**How to avoid:**
- Extract topics at session close, not message-by-message
- Constrain extraction to a maximum of 3 primary topics per session, with the prompt explicitly requiring the LLM to choose the most prominent
- Distinguish "recurring theme" (appeared in 3+ sessions) from "session topic" (appeared in 1 session) — only recurring themes surface in the browsable knowledge base
- Apply the same consolidation pattern already used by `global-memory.ts`: merge, deduplicate, prune on a schedule
- Let users promote a session topic to a theme manually rather than auto-promoting everything

**Warning signs:**
- Knowledge base browse view shows more than 8-10 distinct themes after 5 sessions
- Users cannot remember which tag to look under for a specific memory
- Tags appear that the user would not have chosen themselves ("anxiety-work-boundary" vs. "work stress")
- Browsing view requires scrolling to see all topics

**Phase to address:**
Topic extraction phase. Constrain cardinality in the extraction prompt before shipping browse UI. Never extract tags without defining the consolidation strategy first.

---

### Pitfall 3: AI Distillation That Tells Users How They Feel Instead of Organizing What They Said

**What goes wrong:**
The distillation summary reads: "You are struggling with anxiety about your mother's expectations and feel trapped in a cycle of seeking her approval." The user did not say "I feel trapped" or "I'm seeking approval" — they vented about a specific incident. The AI interpreted and reframed. The user's reaction: "That's not what I said. I don't want the AI analyzing me."

This is the single most trust-destroying failure mode for a therapy-prep tool. If distillation feels like diagnosis, users stop venting honestly because they're afraid of how the AI will characterize them.

**Why it happens:**
LLMs are trained to produce insightful, synthesized output. When given a venting conversation and asked to "distill the key takeaways," the model naturally produces interpretation-level output because that is higher quality writing. The distinction between "organizing what was said" and "interpreting what was meant" is not obvious to the model unless explicitly constrained.

**How to avoid:**
The distillation prompt must use the user's own words as raw material, not as input to be interpreted. Specific constraints in the prompt:
- "Quote or closely paraphrase — do not reinterpret"
- "Describe what happened and what was felt, using language the user themselves used"
- "Do not infer unstated psychological patterns from a single session"
- Present takeaways as "what you said" not "what this means"

The distillation output structure should be: events/situation → feelings (user's stated feelings only) → what matters to you (user's stated concerns only) → open questions (things user seemed uncertain about). Never: "pattern observed" or "underlying dynamic" from a single session.

Cross-session theme recognition (recurring patterns) is a separate phase and uses explicit criteria: something must appear in 3+ sessions before the AI surfaces it as a pattern.

**Warning signs:**
- Distillation summaries contain psychological vocabulary not present in the original chat ("attachment pattern," "coping mechanism," "avoidance behavior")
- Users edit or delete all AI-generated takeaways rather than just correcting a few
- Beta users describe distillation as "the AI analyzing me" rather than "the AI organizing my thoughts"
- Takeaways describe emotional states in third person that weren't explicitly stated ("you seem to feel...")

**Phase to address:**
Distillation prompt design phase. The prompt is the product here — test multiple versions against real venting conversations before shipping. This requires user testing, not just LLM unit tests.

---

### Pitfall 4: Crossing the Therapy Boundary Through Accumulating Cross-Session Patterns

**What goes wrong:**
After 10 sessions, the knowledge base includes: "Recurring pattern: conflict with mother centered on autonomy and approval needs." The user's actual therapist sees this on their phone during a session and it creates confusion about whether the app is doing therapy. Or worse: the user starts relying on the AI's cross-session pattern summary as a substitute for discussing these topics in actual therapy.

The app is designed to be "therapy prep" — helping users organize thoughts before seeing a therapist. But accumulated cross-session pattern language starts to sound clinical.

**Why it happens:**
Cross-session synthesis is where the value gets exciting and where the risk is highest. Once you surface a pattern like "recurring anxiety trigger: X," you are making a quasi-clinical observation. The framing matters enormously — "you have an anxious attachment style" (diagnosis) vs. "you've mentioned feeling overlooked in conversations with your mother in 4 sessions" (observation of what was said).

**How to avoid:**
- Frame all cross-session observations in terms of "what you've written" not "what this means about you"
- Avoid category names drawn from clinical frameworks (attachment styles, cognitive distortions, defense mechanisms)
- Include persistent UI copy near pattern cards: "These are patterns in what you've written — bring them to your therapist to explore together"
- Avoid the word "pattern" in output if you can use "recurring topic" instead
- Never generate a pattern from fewer than 3 sessions
- Do not generate cross-session synthesis about crisis-adjacent content (self-harm, suicidal ideation) — route these to crisis resources, not pattern storage

The existing `crisis-detector.ts` in this codebase handles detection. Extend its scope to cover pattern storage: if a session's content triggers crisis detection, do not store the content in the knowledge base for pattern mining.

**Warning signs:**
- Pattern card language starts using clinical vocabulary
- Users describe the knowledge base as "my therapy notes" rather than "my journal summary"
- Patterns are generated from 1-2 sessions
- The "themes" section of the knowledge base looks like a diagnosis

**Phase to address:**
Cross-session theme recognition phase. Require explicit human review of the language used in pattern cards before launch. This is a product/copy problem as much as an engineering problem.

---

### Pitfall 5: Knowledge Base That Becomes Impossible to Navigate After Month 2

**What goes wrong:**
At 30 sessions (one month of regular journaling), the knowledge base browse view has: 12 themes, 8 people, 30 session summaries, 90 takeaways. Users open "Browse by Topic" and scroll for 30 seconds without finding what they want. The feature that was supposed to make journaling useful for therapy prep has become its own navigation problem.

**Why it happens:**
Knowledge bases are designed for content that is added infrequently and queried often. Journaling adds content daily. Without curation and surfacing mechanisms, the knowledge base becomes a flat archive with no signal about what's important.

PKM research consistently shows that the collection vs. connection problem — tools optimized for storage rather than synthesis — is the primary failure mode of personal knowledge management. The paradox: having more notes makes the system less useful, not more, when navigation doesn't scale.

**How to avoid:**
Design the default view as a curated "highlights" surface, not a flat browse:
- Default view: 3-5 most recently surfaced themes, 3 most recent sessions, any pending "would you like to add this to your therapy notes?" prompts
- Browse-by-theme is a secondary tap, not the default
- Cap displayed sessions per theme at 5 (with "show more" expansion), never show all
- Implement an explicit "pinned for therapy" workflow — users actively designate specific takeaways as "I want to talk about this with my therapist." The default view shows only pinned items.
- Archive old sessions automatically (soft-archive, not delete) after 90 days with no activity

**Warning signs:**
- Session count exceeds 20 and the browse view is still a flat list
- Users report "I can never find what I'm looking for"
- Scroll depth analytics show users reaching end of browse list without tapping anything
- The browse view has more than 3 levels of navigation depth

**Phase to address:**
Browse UI phase. Define the information architecture with a navigation depth limit (max 2 taps to reach any piece of content) before building any browse screens.

---

### Pitfall 6: The Existing Memory System Collides With the New Journal Memory System

**What goes wrong:**
The existing `globalFacts` system stores facts about the user in `User.globalFacts` (categories: People, Logistics, Conflict, Emotional, History). The new journal distillation system starts storing similar facts in a new table. The context assembler now retrieves both. The AI receives duplicate facts: "User's mother is critical" from `globalFacts` and "Recurring theme: conflict with mother" from journal themes. Prompts grow larger than necessary, and the AI behavior in partner sessions starts referencing inner thoughts content that the user did not intend to share in that context.

**Why it happens:**
The embedding system (`embedInnerWorkSessionContent`) already indexes inner thoughts sessions. The context retriever (`context-retriever.ts`) searches across all indexed content unless scoped. If journal distillation adds new records to the same vector space without clear namespace separation, the partner session AI starts drawing on inner thoughts content. This is a privacy violation and a trust violation — the user thinks their inner thoughts are private from the partner session AI.

**How to avoid:**
- Maintain strict namespace separation between inner thoughts content and partner session context
- The context retriever's session-scoping logic must explicitly exclude `InnerWorkSession` embeddings from partner session context assembly (verify this is already the case in `context-retriever.ts` before building)
- Journal distillation facts must not flow into `globalFacts` — they are session-private, not user-global
- Create a separate storage key for journal knowledge (e.g., `User.journalThemes`) that is explicitly excluded from `context-assembler.ts`'s partner session context path
- Write a test: "Partner session context does not contain content from inner thoughts sessions"

The existing `globalFacts` consolidation at 50 facts max is already a good constraint — do not loosen this limit to accommodate journal extraction output.

**Warning signs:**
- Partner session AI references something the user only mentioned in inner thoughts
- Context token counts in partner sessions grow after adding journal distillation
- `context-retriever.ts` queries return `InnerWorkSession` rows during partner session context assembly
- `globalFacts` grows from 50 to 60+ facts after journal distillation is added

**Phase to address:**
Integration architecture phase — must be confirmed before any journal knowledge storage is written. Audit `context-retriever.ts` and `context-assembler.ts` to verify namespace scoping before adding new journal storage.

---

### Pitfall 7: Distillation Timing That Rewards Short Sessions Over Long Ones

**What goes wrong:**
Distillation is triggered when the user closes a session. Users who write brief entries (5 messages) get fast, accurate distillation. Users who write long venting sessions (30+ messages) trigger expensive distillation that takes 30-60 seconds, often completing after they've left the app. Those users see "no takeaways yet" when they return, then discover a summary that exists but wasn't surfaced. The feature feels broken for the people who use it most.

**Why it happens:**
The existing conversation summarizer has a 25-message threshold and a 30-message rolling window. Journal distillation that runs post-session must handle the full session, which could be 60+ messages for heavy users. This is qualitatively different from the incremental rolling summary approach.

**How to avoid:**
- Trigger incremental distillation at session milestones (first 10 messages, every 15 after) rather than only at session close
- Store incremental distillation drafts so that "close session" is just a final revision pass, not starting from scratch
- The session detail screen should show whatever distillation state exists ("Summary being updated..." with a partial result) rather than blank until complete
- Cap distillation input at the most recent 30 messages plus the existing summary — do not process the full history on every close

**Warning signs:**
- Distillation completion time exceeds 10s for sessions over 20 messages
- Users report "no takeaways" despite having a completed session
- Bedrock costs spike disproportionately from journal distillation vs. chat
- Users with 40+ message sessions are the ones reporting distillation failures

**Phase to address:**
Distillation infrastructure phase. Design the incremental trigger strategy before writing the distillation prompt. The prompt is simpler than the scheduling problem.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Add distillation to the message response path | Simpler code, one endpoint to maintain | Inner thoughts chat gets slow and unreliable; breaks existing users | Never — distillation must be fire-and-forget |
| Store journal themes in globalFacts | Reuses existing data structure | Partner session AI sees inner thoughts content; privacy violation | Never — journals require a separate namespace |
| Run distillation on every message | Freshest possible summaries | Haiku costs explode; circuit breaker opens constantly | Never — trigger at milestones or session close only |
| Use Sonnet for distillation | Higher quality summaries | Costs 5-10x more per session; latency increases | Only for the final session-close summary; use Haiku for incremental |
| Auto-promote all session topics to knowledge base | Richer knowledge graph | Tag explosion; 40+ tags in month 1; navigation breakdown | Never without a consolidation gate (minimum 3 sessions before promotion) |
| Store full session transcripts in knowledge base | Easy to re-summarize later | Storage costs grow linearly; privacy exposure surface increases | Store summaries and takeaways only; not raw messages |
| Skip user editing of AI takeaways in MVP | Faster to build | Users cannot correct mischaracterizations; trust breaks | Never — edit-in-place must ship with distillation in v1 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Existing `embedding.ts` / pgvector | Adding journal theme embeddings to the same query namespace as partner session facts | Add a `sourceType` filter to all embedding queries; `InnerWorkSession` embeddings excluded from partner session context retrieval |
| Existing `globalFacts` on User model | Writing journal distillation output into `globalFacts` | Create separate `User.journalThemes` or equivalent; never mix with the partner session context chain |
| Existing `conversation-summarizer.ts` | Treating journal distillation the same as the rolling summary | Rolling summary = context window management (internal to AI). Distillation = user-facing takeaways. Different purposes, different prompts, different triggers |
| Existing `people-extractor.ts` | Running people extraction on every inner thoughts message (already done during chat) | People extraction from journals should deduplicate against already-tracked people; don't create duplicate Person records |
| Existing `crisis-detector.ts` | Not running crisis detection on journal content before storing in knowledge base | Crisis-flagged content must not flow into theme/pattern storage; route to existing crisis resource flow instead |
| Ably realtime | Expecting distillation completion to be available before the user returns to the app | Push a `journal.distillation-complete` Ably event; mobile polls or listens rather than expecting synchronous availability |
| React Query cache-first | Invalidating the inner thoughts session cache during distillation (while user may have optimistic updates in-flight) | Use `setQueryData` to merge distillation results into existing session cache; never `invalidateQueries` on an inner thoughts session key |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full session transcript passed to distillation prompt every time | Distillation latency grows with session length; Bedrock token costs climb | Cap input at last 30 messages + existing summary; use incremental drafts | Sessions exceeding 30 messages (~day 3 for heavy users) |
| Embedding all journal content on session close | Embedding call adds 2-4s to session close; embeddingCircuitBreaker opens | Embed asynchronously, not in session close response path | Immediately — embedding should never be synchronous with user action |
| Querying all journal themes for every knowledge base render | Browse view latency grows with session count | Paginate themes; cache browse results in React Query with a 5-minute TTL | After 20+ sessions |
| People extraction running against full people list on every distillation | N+1 queries as person count grows | Batch people lookup once per distillation run, not per mention | After user has 20+ tracked people |
| Generating cross-session patterns on every new session | Pattern generation cost grows quadratically with session count | Run pattern recognition on a schedule (weekly or triggered by N new sessions), not on every session close | After 10 sessions |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Journal content flowing into globalFacts without explicit namespace separation | Partner session AI reveals inner thoughts content to partner session context; user loses private venting space | Strict namespace enforcement in context-assembler.ts; test this boundary explicitly |
| Storing user-corrected takeaways without validating length/content | Prompt injection via takeaway content if it flows into future LLM calls | Sanitize user-edited takeaway text using existing `input-sanitizer.ts` before storing; validate max length |
| Crisis-flagged journal content stored in knowledge base | Pattern mining on crisis content could surface distressing summaries in browse view | Before storing any session content in knowledge base, run through crisis-detector.ts; skip storage for flagged content |
| Knowledge base browse API returning all users' themes | Missing userId scope on theme/pattern queries | All journal knowledge queries must include `where: { userId }` scope; add tests for cross-user data isolation |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "no takeaways yet" with no indication distillation is running | Users think the feature is broken; they close and reopen; nothing changes | Show "Organizing your thoughts..." with a progress indicator; surface partial results as they arrive |
| Displaying AI-generated themes without a "this came from your journal" framing | Users feel surveilled or characterized; the AI seems to be reading their mind | Label all AI-generated content with "Based on what you wrote in X sessions"; make the source visible |
| Making knowledge base the default view when user opens Inner Thoughts | Returning users see their accumulated history before they can start a new session | Default to "Start a new session" or "Continue most recent session"; knowledge base is always a secondary tap |
| Requiring users to review/confirm every distillation before it saves | High friction; users stop completing sessions | Show distillation in read-only mode immediately after session; offer inline editing but don't require it |
| Surfacing patterns from 1-2 sessions as "recurring themes" | User sees "pattern: conflict with mom" after 2 sessions; feels like over-analysis | Require a minimum of 3 sessions before surfacing any cross-session pattern |
| Edit UI that requires rebuilding a takeaway from scratch | If the AI's phrasing is close but wrong, users give up rather than rewriting | Inline edit with the AI text pre-populated; user makes small corrections rather than starting blank |

---

## "Looks Done But Isn't" Checklist

- [ ] **Distillation is async:** Verify distillation is not in the message response path. Check that `POST /inner-thoughts/:id/messages` response time is unchanged after adding distillation.
- [ ] **Namespace isolation verified:** Confirm that `context-retriever.ts` and `context-assembler.ts` do not return `InnerWorkSession` content in partner session context. Write an explicit test.
- [ ] **Crisis content excluded from knowledge base:** Confirm crisis-detector.ts runs before any journal content is stored in knowledge base tables.
- [ ] **Edit is possible on day 1:** Distillation UI allows user to edit any AI-generated takeaway inline before the knowledge base is surfaced.
- [ ] **Cardinality is bounded:** Topic extraction prompt explicitly limits output to 3 primary topics per session. Knowledge base promotion requires minimum 3-session recurrence.
- [ ] **Old inner thoughts chat still works:** Run the existing inner thoughts chat flow after all distillation changes; confirm message roundtrip is not slower.
- [ ] **People deduplication works:** Running people extraction on journal content does not create duplicate Person records for people already tracked from partner sessions.
- [ ] **Therapy boundary framing is present:** Every pattern/theme card in the knowledge base includes copy that frames it as "what you wrote" not "what this means."

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Distillation added to message response path; inner thoughts chat broken | MEDIUM | Extract distillation call to fire-and-forget background function; no schema changes needed; deploy hotfix |
| Tag explosion (40+ tags after month 1) | HIGH | Requires schema migration to add recurrence count; re-consolidation pass via Haiku on all existing tags; UX change to hide single-session topics |
| AI distillation using interpretive language; user trust broken | MEDIUM | Prompt update only; re-run distillation on existing sessions (background job); no schema change needed |
| globalFacts contaminated with journal content | HIGH | Schema migration to separate journal knowledge; back-fill script to identify and remove journal-sourced entries from globalFacts; test partner session context |
| Knowledge base too dense after 30 sessions; navigation broken | MEDIUM | UX redesign (no schema change); implement default curated view with pinned content; archive threshold |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Breaking existing inner thoughts chat | Distillation infrastructure (Phase 1) | Measure message response time before and after; must be unchanged |
| Over-categorization / tag explosion | Topic extraction (Phase 2) | After 5 test sessions, knowledge base has fewer than 8 themes |
| AI telling users how they feel | Distillation prompt design (Phase 2) | User testing: participants describe distillation as "organizing" not "analyzing" |
| Crossing therapy boundary via cross-session patterns | Cross-session theme recognition (Phase 3) | Pattern language audit before launch; no clinical vocabulary in output |
| Knowledge base navigation collapse | Browse UI (Phase 3) | With 20 sessions loaded, user can reach any content in 2 taps |
| Namespace collision with existing memory system | Integration architecture (Phase 1, must precede all other phases) | Explicit test: partner session context contains no inner thoughts content |
| Distillation timing broken for long sessions | Distillation infrastructure (Phase 1) | 40-message session distillation completes within 15s; incremental drafts visible during session |

---

## Sources

- Existing codebase: `backend/src/services/embedding.ts`, `global-memory.ts`, `conversation-summarizer.ts`, `people-extractor.ts`, `crisis-detector.ts`, `context-assembler.ts` — architecture grounded in code
- Existing codebase: `backend/prisma/schema.prisma` (InnerWorkSession model, Insight model, globalFacts column) — integration risks identified from actual schema
- Existing codebase: `docs/architecture/concerns.md` — known fragile areas and tech debt patterns
- [The hidden dangers of AI therapy tools (Healio, 2025)](https://www.healio.com/news/psychiatry/20250915/the-hidden-dangers-of-ai-therapy-tools-what-clinicians-need-to-know) — clinical boundary risks
- [Exploring the Dangers of AI in Mental Health Care (Stanford HAI)](https://hai.stanford.edu/news/exploring-the-dangers-of-ai-in-mental-health-care) — safety failure modes
- [A Complete Guide to Tagging for Personal Knowledge Management (Forte Labs)](https://fortelabs.com/blog/a-complete-guide-to-tagging-for-personal-knowledge-management/) — PKM over-tagging anti-patterns
- [The PKM paradox / collection vs. connection problem](https://www.turnwall.com/articles/personal-knowledge-management-pkm/) — knowledge base navigation failure
- [AI Summarization limitations (Enago Read)](https://www.read.enago.com/blog/exploring-the-limitations-of-ai-summarization-in-research/) — emotional content misinterpretation, over-summarization
- [Contextual AI Journaling: MindScape App (PMC/NCBI)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11275533/) — reflective vs. prescriptive AI design research
- [pgai namespace collision issue (GitHub #375)](https://github.com/timescale/pgai/issues/375) — vector namespace collision pattern

---

*Pitfalls research for: AI-guided journaling distillation added to existing chat app (Meet Without Fear v1.2)*
*Researched: 2026-03-11*
