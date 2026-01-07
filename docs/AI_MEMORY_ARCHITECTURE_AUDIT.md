# AI Memory & Context Architecture Audit

**Date:** 2026-01-07  
**Scope:** Backend AI memory, context window, RAG, and summarization systems

---

## Executive Summary

Your system has a **sophisticated multi-layered memory architecture** with:

- ✅ **RAG system** using pgvector embeddings for semantic search
- ✅ **Token budget management** to maximize context window usage
- ✅ **Summarization infrastructure** (implemented but **NOT ACTIVELY CALLED** for partner sessions)
- ✅ **Stage-aware memory intent** system that adjusts retrieval depth
- ⚠️ **Critical Gap:** Summarization exists but is **not being invoked** for partner sessions

**Current State:** You're relying on a **sliding window of recent messages** (6-20 turns depending on stage) + **semantic retrieval** when references are detected. Summaries are generated for Inner Thoughts but **not for partner sessions**, meaning long sessions lose older context.

---

## 1. The Context Window

### Where Messages Are Selected

**Primary Selection Point:** `backend/src/controllers/stage1.ts` (lines 276-293)

- Fetches **last 20 messages** (newest first, then reversed)
- This is the **raw history** passed to the orchestrator

**Secondary Selection Point:** `backend/src/services/context-assembler.ts` (lines 236-276)

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

1. **Stage-based buffer sizes** (6-8 turns depending on stage)
2. **Token budget protection** - last 10 turns are always included
3. **Older messages can be included** if token budget allows
4. **RAG retrieval** can pull older messages semantically (see section 2)

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

1. **Reference Detection** (lines 127-175):
   - Uses **Haiku** to detect if user message references past content
   - Detects: people, events, agreements, feelings, time references
   - **Enhanced pattern matching** for implicit commitments:
     - "But I thought...", "I assumed...", "I believed..."
   - Generates **search queries** for semantic retrieval

2. **Semantic Search** (lines 184-451):
   - **Cross-session search:** `searchAcrossSessions()` - finds similar messages from other sessions
   - **Within-session search:** `searchWithinSession()` - finds relevant older messages in current session
   - **Pre-session search:** `searchPreSessionMessages()` - finds unassociated pre-session messages
   - Uses **cosine distance** (`<=>` operator) for similarity matching
   - **Similarity threshold:** Stage-aware (0.45-0.70, higher = more strict)
   - **Max results:** Stage-aware (0-10 cross-session, 5 within-session)

3. **Context Injection** (lines 641-699):
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

### Summarization Infrastructure: ✅ EXISTS BUT NOT ACTIVELY USED

**Schema Support:**

- `UserVessel.conversationSummary` (JSON field)
- `InnerWorkSession.conversationSummary` (JSON field)

**Implementation:** `backend/src/services/conversation-summarizer.ts`

**For Partner Sessions:**

- `updateSessionSummary()` - **EXISTS** but **NOT CALLED** anywhere in partner session flow
- `getSessionSummary()` - **EXISTS** but **NOT CALLED** in context assembly
- `buildSessionSummary()` in `context-assembler.ts` (line 418) - **RETURNS `undefined`** (TODO comment)

**For Inner Thoughts:**

- `updateInnerThoughtsSummary()` - **ACTIVELY CALLED** in `inner-work.ts` (line 647)
- `getInnerThoughtsSummary()` - **ACTIVELY USED** in Inner Thoughts prompts
- Summaries are **injected into prompts** for long conversations

**Summarization Logic:**

- **Threshold:** 30 messages minimum
- **Re-summarization:** Every 20 messages after threshold
- **Keeps recent:** Last 10 messages always in full
- **Summarizes:** Older messages (everything except last 10)
- **Uses Haiku** to generate summaries with:
  - Summary text
  - Key themes
  - Emotional journey
  - Unresolved topics

**The Problem:**

- `buildSessionSummary()` in `context-assembler.ts` has a **TODO comment** and returns `undefined`
- Even though `updateSessionSummary()` exists, it's **never called** after partner session messages
- This means **long partner sessions lose older context** - they rely purely on:
  1. Recent sliding window (6-20 turns)
  2. Semantic retrieval (if references detected)

---

## 4. The "Recall" Logic

### Memory Intent System: `backend/src/services/memory-intent.ts`

**How `recall_commitment` Triggers:**

1. **Explicit patterns** (lines 85-95):
   - "we agreed", "you said", "last time", "we decided", "remember when"
   - These trigger `recall_commitment` with `depth: 'full'`

2. **Stage-based defaults** (lines 326-357):
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
   - Prior themes (from previous sessions - **currently empty**, TODO)
   - Inner Thoughts context (if linked)
   - User memories (always included)

2. **Universal Context Retrieval** (`retrieveContext`):
   - **Full conversation history** (all messages, not limited)
   - **Cross-session messages** (up to 10, similarity >= 0.50)
   - **Within-session older messages** (up to 5, similarity >= 0.50)
   - **Pre-session messages** (if any)
   - **Detected references** (parsed from user message)

3. **Retrieval Planning** (if `depth === 'full'`):
   - Uses **Haiku** to plan structured queries
   - Can query: user events, needs, boundaries, agreements, experiments
   - **Currently mostly mock** - full implementation pending

**Stage-Aware Configuration:**

- **Stage 1:**
  - Threshold: 0.65 (very strict)
  - Max cross-session: 0-3 (only after turn 3)
  - Surface style: `silent` (no pattern observations)

- **Stage 2:**
  - Threshold: 0.55 (moderate)
  - Max cross-session: 5
  - Surface style: `tentative` (gentle pattern hints)

- **Stage 3-4:**
  - Threshold: 0.50 (permissive)
  - Max cross-session: 10
  - Surface style: `explicit` (clear pattern observations with evidence)

---

## Critical Findings

### ✅ What's Working Well

1. **RAG system is robust** - semantic search works across sessions
2. **Token budget management** protects recent context intelligently
3. **Stage-aware memory** adjusts retrieval depth appropriately
4. **Reference detection** catches both explicit and implicit patterns
5. **Data isolation** prevents partner message leakage

### ⚠️ Critical Gaps

1. **Summarization Not Active for Partner Sessions**
   - Code exists but `buildSessionSummary()` returns `undefined`
   - `updateSessionSummary()` is never called
   - **Impact:** Long sessions (>30 messages) lose older context
   - **Fix:** Call `updateSessionSummary()` after messages, use `getSessionSummary()` in context assembly

2. **Prior Themes Empty**
   - `buildPriorThemes()` returns empty themes array (line 409)
   - **Impact:** No continuity between sessions in same relationship
   - **Fix:** Extract themes from UserVessel needs/events

3. **Session Summary Not Used**
   - Even if summaries existed, `buildSessionSummary()` doesn't load them
   - **Impact:** Summaries wouldn't be injected even if generated
   - **Fix:** Load from `UserVessel.conversationSummary` and format for prompt

### 📊 Current Memory Strategy

**For Recent Memory (< 30 messages):**

- ✅ Sliding window (6-20 turns based on stage)
- ✅ Token budget protection (last 10 turns always included)
- ✅ Semantic retrieval when references detected

**For Long Sessions (> 30 messages):**

- ⚠️ **Still using sliding window only** (summarization not active)
- ✅ Semantic retrieval can pull older messages
- ❌ **No summarized long-term memory** (summaries not generated/used)

**For Cross-Session Memory:**

- ✅ Semantic search across all sessions
- ✅ Stage-aware thresholds and limits
- ✅ User preferences control cross-session recall
- ⚠️ Prior themes not populated (would help continuity)

---

## Recommendations

### Immediate Fixes

1. **Activate Summarization for Partner Sessions:**

   ```typescript
   // In stage1.ts, after saving AI message:
   updateSessionSummary(sessionId, userId).catch(console.warn);

   // In context-assembler.ts, buildSessionSummary():
   const summary = await getSessionSummary(sessionId, userId);
   if (summary) {
     return {
       keyThemes: summary.keyThemes,
       emotionalJourney: summary.emotionalJourney,
       currentFocus: summary.text,
       userStatedGoals: summary.unresolvedTopics,
     };
   }
   ```

2. **Populate Prior Themes:**
   - Extract needs/themes from previous sessions' UserVessels
   - Store in a cache or query on-demand
   - Inject into context bundle for continuity

3. **Use Summaries in Prompts:**
   - When `sessionSummary` exists, inject it into system prompt
   - Format: `[Earlier in this session: {summary}]\n\n[Recent conversation: ...]`

### Future Enhancements

1. **Rolling Summarization:**
   - Summarize every 20 messages (not just at 30+)
   - Keep multiple summary "chunks" for very long sessions

2. **Thematic Memory:**
   - Extract recurring themes across sessions
   - Build a "relationship memory" that persists

3. **Agreement Memory:**
   - Track all agreements/experiments across sessions
   - Make them easily retrievable when user references them

---

## Conclusion

Your architecture is **well-designed** with sophisticated RAG and token management. The main gap is **summarization not being active** for partner sessions, which means you're currently relying on:

1. **Recent sliding window** (6-20 turns)
2. **Semantic retrieval** (when references detected)

To maximize recent memory and ensure nothing important is forgotten, you should:

1. ✅ **Activate summarization** - call `updateSessionSummary()` after messages
2. ✅ **Use summaries in prompts** - load and inject `conversationSummary` from UserVessel
3. ✅ **Populate prior themes** - extract themes from previous sessions

This will give you: **Recent full messages + Summarized older context + Semantically retrieved relevant content** = comprehensive memory without token bloat.
