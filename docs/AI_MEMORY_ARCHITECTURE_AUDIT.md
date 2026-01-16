# AI Memory & Context Architecture Audit

**Date:** 2026-01-15 (Updated)
**Scope:** Backend AI memory, context window, RAG, and summarization systems

---

## Executive Summary

Your system has a **sophisticated multi-layered memory architecture** with:

- ✅ **RAG system** using pgvector embeddings for semantic search
- ✅ **Token budget management** to maximize context window usage
- ✅ **Summarization** actively called for partner sessions (30+ messages)
- ✅ **Stage-aware memory intent** system that adjusts retrieval depth
- ⚠️ **Minor Gap:** Prior themes from previous sessions not yet populated

**Current State:** You use a **stage-aware sliding window** (6-20 turns) + **semantic retrieval** when references are detected + **rolling summarization** for long sessions (30+ messages). Summaries are generated and injected for both partner sessions and Inner Thoughts.

---

## 1. The Context Window

### Where Messages Are Selected

**Primary Selection Point:** `backend/src/services/context-assembler.ts` (lines 230-269)

- `buildConversationContext()` uses **stage-aware buffer sizes**:
  - Stage 1: **6 turns** (12 messages)
  - Stage 2: **4 turns** (8 messages)
  - Stage 3: **4 turns** (8 messages)
  - Stage 4: **8 turns** (16 messages)
- Fetches `bufferSize * 2` messages (to account for user + AI pairs)
- **Takes last N turns** from chronological order

**Final Selection Point:** `backend/src/utils/token-budget.ts` (lines 175-261)

- `buildBudgetedContext()` applies **token budget management**
- **Protects last 10 turns** (20 messages) - these are NEVER dropped
- Older messages are included if budget allows
- Retrieved context (from RAG) is **lowest priority** and gets truncated first

### Is It a Strict Sliding Window?

**No** - it's more sophisticated:

1. **Stage-based buffer sizes** (4-8 turns depending on stage)
2. **Token budget protection** - last 10 turns are always included
3. **Older messages can be included** if token budget allows
4. **RAG retrieval** can pull older messages semantically (see section 2)
5. **Summarization** condenses older content when sessions exceed 30 messages

### Token Counting

**Yes** - comprehensive token management in `backend/src/utils/token-budget.ts`:

- **Estimates:** ~4 characters per token (conservative)
- **Model limits:** 150k input tokens (leaving headroom from 200k)
- **System prompt budget:** 4k tokens reserved
- **Output reservation:** 4k tokens
- **Context budget:** 100k tokens available
- **Protection hierarchy:**
  1. System prompts (never dropped)
  2. Last 10 turns (protected)
  3. Older conversation (60% of remaining budget)
  4. Retrieved context (40% of remaining budget, truncated first)

**Logging:** When truncation occurs, you'll see:

```
[TokenBudget] Truncated: X conversation messages, retrieved context | Protected: 20 messages (last 10 turns)
```

---

## 2. Retrieval / RAG

### RAG System Status: ✅ FULLY IMPLEMENTED

**Vector Database:** PostgreSQL with `pgvector` extension

- **Embedding dimensions:** 1024 (Titan v2 embeddings)
- **Storage:** Messages, Inner Work messages, Pre-session messages, User vessels, Gratitude entries all have `embedding vector(1024)` columns

**RAG Flow:** `backend/src/services/context-retriever.ts`

1. **Reference Detection** (lines 144-199):
   - Uses **Haiku** to detect if user message references past content
   - Detects: people, events, agreements, feelings, time references
   - **Enhanced pattern matching** for implicit commitments:
     - "But I thought...", "I assumed...", "I believed..."
   - Generates **search queries** for semantic retrieval
   - Protected by **circuit breaker** - graceful fallback if Haiku fails

2. **Semantic Search** (lines 208-347):
   - **Cross-session search:** `searchAcrossSessions()` - finds similar messages from other sessions
   - **Within-session search:** `searchWithinSession()` - finds relevant older messages in current session
   - **Pre-session search:** `searchPreSessionMessages()` - finds unassociated pre-session messages
   - **Inner Thoughts search:** `searchInnerWorkMessages()` - finds relevant private reflections
   - Uses **cosine distance** (`<=>` operator) for similarity matching
   - **Similarity threshold:** Stage-aware (0.50-0.65, higher = more strict)
   - **Max results:** Stage-aware (0-10 cross-session, 5 within-session)

3. **Context Injection** (lines 822-892):
   - Retrieved messages are **formatted and injected** into the prompt
   - Format: `[Context for this turn:\n{formattedContext}]\n\n{currentMessage}`
   - Includes time context ("yesterday", "last week") for natural phrasing
   - **Recency guidance** tells AI how to reference old content

**When RAG Triggers:**

- **Always runs** on every message (universal context retrieval)
- **Searches only if** `detectReferences()` finds references OR user preferences allow cross-session recall
- **Stage-aware:** Stage 1 blocks cross-session by default (unless explicit reference)

**Data Isolation:**

- Only returns user's own messages + AI responses **to them**
- Uses `forUserId` field to ensure partner's Stage 1 messages aren't leaked

---

## 3. Summarization & Long-term Memory

### Summarization Status: ✅ ACTIVE FOR BOTH PARTNER SESSIONS AND INNER THOUGHTS

**Schema Support:**

- `UserVessel.conversationSummary` (JSON field) - for partner sessions
- `InnerWorkSession.conversationSummary` (JSON field) - for Inner Thoughts

**Implementation:** `backend/src/services/conversation-summarizer.ts`

### Partner Session Summarization

**Configuration** (lines 56-68):

```typescript
SUMMARIZATION_CONFIG = {
  minMessagesForSummary: 30,      // Kicks in at 30 messages
  recentMessagesToKeep: 15,       // Always keeps 15 recent in full
  targetSummaryTokens: 500,       // Target summary length
  resummaryInterval: 20,          // Re-summarize every 20 new messages
}
```

**Where It's Called:**

`updateSessionSummary()` is called fire-and-forget after AI messages in:
- `backend/src/controllers/messages.ts` (lines 690, 2027)
- `backend/src/controllers/sessions.ts` (line 1047)
- `backend/src/controllers/stage2.ts` (lines 573, 719, 2009)
- `backend/src/services/chat-router/session-processor.ts` (line 263)
- `backend/src/services/chat-router/handlers/session-creation.ts` (line 307)

**Where Summaries Are Used:**

`buildSessionSummary()` in `context-assembler.ts` (lines 412-429):
- Calls `getSessionSummary(sessionId, userId)`
- Formats summary data into `SessionSummary` structure
- Injected into context bundle and prompts

### Inner Thoughts Summarization

**Configuration** (lines 388-400):

```typescript
INNER_THOUGHTS_SUMMARIZATION_CONFIG = {
  minMessagesForSummary: 20,      // Lower threshold for private reflection
  recentMessagesToKeep: 12,       // Fewer recent messages kept
  targetSummaryTokens: 500,
  resummaryInterval: 15,
}
```

**Summarization Output:**

Both types generate structured summaries with:
- `summary.text` - 2-3 paragraph narrative
- `keyThemes[]` - Array of themes
- `emotionalJourney` - One sentence emotional arc
- `unresolvedTopics[]` - Topics needing follow-up

---

## 4. The "Recall" Logic

### Memory Intent System: `backend/src/services/memory-intent.ts`

**How `recall_commitment` Triggers:**

1. **Explicit patterns** (lines 85-95):
   - "we agreed", "you said", "last time", "we decided", "remember when"
   - These trigger `recall_commitment` with `depth: 'full'`

2. **Stage-based defaults** (lines 285-369):
   - **Stage 2:** Default intent is `recall_commitment` (light depth)
   - **Stage 3:** Default intent is `recall_commitment` (full depth)
   - **Stage 4:** Default intent is `recall_commitment` (full depth)

3. **Implicit detection** (in `context-retriever.ts`):
   - Haiku detects implicit patterns: "But I thought...", "I assumed..."
   - This sets `needsRetrieval: true` which triggers semantic search

**What Data Gets Fetched:**

When `recall_commitment` triggers with `depth: 'full'`:

1. **Context Bundle** (`assembleContextBundle`):
   - Recent turns (stage-based buffer: 4-8 turns)
   - Emotional thread (intensity tracking)
   - Session summary (if exists, from long sessions)
   - Inner Thoughts context (if linked)
   - User memories (always included)
   - Prior themes (from previous sessions - **currently empty**, TODO)

2. **Universal Context Retrieval** (`retrieveContext`):
   - **Full conversation history** (all messages, not limited)
   - **Cross-session messages** (up to 10, similarity >= 0.50)
   - **Within-session older messages** (up to 5, similarity >= 0.50)
   - **Pre-session messages** (if any)
   - **Detected references** (parsed from user message)

3. **Retrieval Planning** (if `depth === 'full'`):
   - Uses **Haiku** to plan structured queries
   - Can query: user events, needs, boundaries, agreements, experiments

**Stage-Aware Configuration:**

| Stage | Threshold | Max Cross-Session | Allow Cross-Session | Surface Style |
|-------|-----------|-------------------|---------------------|---------------|
| 1 | 0.65 | 0-3 (after turn 3) | false | silent |
| 2 | 0.55 | 5 | true | tentative |
| 3 | 0.50 | 10 | true | explicit |
| 4 | 0.50 | 10 | true | explicit |

---

## 5. Full Orchestration Flow

**File:** `backend/src/services/ai-orchestrator.ts`

```
User Message Arrives
        ↓
┌─────────────────────────────────────────┐
│ 1. determineMemoryIntent() [rules-based, ~0ms]
│    → Returns intent, depth, thresholds
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 2. PARALLEL PRE-PROCESSING (~200-500ms)
│    ├─ getUserMemoryPreferences()
│    ├─ assembleContextBundle()
│    │   └─ buildSessionSummary() ← loads summary if exists
│    ├─ retrieveContext() [includes Haiku detection]
│    └─ getSharedContentContext()
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 3. decideSurfacing() [rules-based]
│    → Determines how to surface patterns
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 4. planRetrieval() [Haiku, only if depth=full]
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 5. buildStagePrompt()
│    → Inject context bundle + retrieved context
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 6. buildBudgetedContext()
│    → Apply token budget, truncate if needed
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 7. getSonnetResponse() [~1-3s]
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ 8. FIRE-AND-FORGET (non-blocking)
│    └─ updateSessionSummary()
└─────────────────────────────────────────┘
```

---

## 6. What Gets Injected Into Prompts

### Context Bundle (from `context-assembler.ts:537-599`)

```
EMOTIONAL STATE:
Current intensity: 7/10
Trend: escalating
Notable shifts: 5 → 8

SESSION SUMMARY: (if exists, for long sessions)
Key themes: trust, communication
Current focus: [narrative summary from Haiku]
Emotional journey: [one-sentence arc]
Topics that may need follow-up: [list]

FROM USER'S PRIVATE REFLECTIONS: (if Inner Thoughts linked)
- "[reflection content]" [linked to this session]

USER MEMORIES (Always Honor These):
- [preference] Never call me by my full name
```

### Retrieved Context (from `context-retriever.ts:822-892`)

```
[MEMORY CONTEXT GUIDANCE: This content is from several months ago...]

[Related content from previous sessions]
[Session with Partner, last month]
User: [message]
AI: [response]

[Your reflections, last week]
User: [inner thoughts message]

[Related content from earlier in this session]
User: [message]

[Detected references in user message]
- agreement: "we agreed" (high confidence)
```

---

## Critical Findings

### ✅ What's Working Well

1. **RAG system is robust** - semantic search works across sessions
2. **Token budget management** protects recent context intelligently
3. **Stage-aware memory** adjusts retrieval depth appropriately
4. **Reference detection** catches both explicit and implicit patterns
5. **Data isolation** prevents partner message leakage
6. **Summarization is active** - called after AI messages for long sessions
7. **Summaries are used** - injected into context bundle for prompts

### ⚠️ Remaining Gaps

1. **Prior Themes Empty**
   - `buildPriorThemes()` returns empty themes array (line 400-406)
   - **Impact:** No extracted theme continuity between sessions in same relationship
   - **Fix:** Extract themes from previous sessions' UserVessel data

### 📊 Current Memory Strategy

**For Recent Memory (< 30 messages):**

- ✅ Sliding window (6-16 messages based on stage)
- ✅ Token budget protection (last 10 turns always included)
- ✅ Semantic retrieval when references detected

**For Long Sessions (> 30 messages):**

- ✅ Rolling summarization (every 20 messages after threshold)
- ✅ Keeps 15 recent messages in full
- ✅ Summary injected into prompts with key themes, emotional journey
- ✅ Semantic retrieval can still pull specific older messages

**For Cross-Session Memory:**

- ✅ Semantic search across all sessions
- ✅ Stage-aware thresholds and limits
- ✅ User preferences control cross-session recall
- ⚠️ Prior themes not populated (would help continuity)

---

## Recommendations

### Remaining Enhancement

1. **Populate Prior Themes:**

   In `context-assembler.ts`, `buildPriorThemes()` currently returns empty themes:

   ```typescript
   // Current (line 400-406):
   return {
     themes: [], // TODO: Extract from UserVessel
     lastSessionDate: previousSessions[0].updatedAt.toISOString(),
     sessionCount: previousSessions.length,
   };
   ```

   **Fix:** Extract themes/needs from previous sessions' UserVessels and include in context bundle.

### Future Enhancements

1. **Thematic Memory:**
   - Extract recurring themes across sessions
   - Build a "relationship memory" that persists

2. **Agreement Memory:**
   - Track all agreements/experiments across sessions
   - Make them easily retrievable when user references them

---

## Conclusion

Your architecture is **well-designed and fully operational** with:

1. **Stage-aware sliding window** (4-8 turns based on stage)
2. **Token budget protection** (last 10 turns never dropped)
3. **Semantic retrieval** (when references detected)
4. **Rolling summarization** (active for sessions > 30 messages)

The system provides: **Recent full messages + Summarized older context + Semantically retrieved relevant content** = comprehensive memory without token bloat.

**One remaining enhancement:** Populate prior themes from previous sessions to improve cross-session continuity.
