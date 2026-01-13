# Inner Thoughts Retrieval Spec - Draft

## Feature Summary
Add retrieval capabilities to Inner Thoughts sessions so the AI can remember things from other sessions (both other Inner Thoughts sessions AND partner sessions).

## Key Decisions Made

### 1. Retrieval Scope
**Decision**: Search BOTH tables (Message and InnerWorkMessage)
- Cross-pollination of insights between solo reflection and partner conversations
- If user talked about a topic with partner, that context surfaces in Inner Thoughts
- If user processed something in Inner Thoughts, it's available when chatting with partner

### 2. Reference Detection
**Decision**: SKIP Haiku detection - always search with high threshold
- Partner sessions use Haiku to detect references before searching (costs ~$0.001/message)
- Inner Thoughts will always do semantic search without detection
- Reasoning:
  - Reduces latency (no LLM call before search)
  - Better recall (vector search captures implicit connections like "she's annoying me" matching "mom" contexts)
  - Use similarity threshold 0.75 to filter noise instead of gating with LLM

### 3. Linked Session Boost
**Decision**: Boost linked partner session content by ~30%
- When Inner Thoughts is linked to a partner session, messages from that session get similarity boost
- Makes reflection more contextually relevant to what triggered the Inner Thoughts

### 4. Context Formatting
**Decision**: Use '[Your reflections, time phrase]' format
- Partner sessions: `[Session with Sarah, a few days ago]`
- Inner Thoughts: `[Your reflections, a few days ago]`
- Consistent pattern, minimal code change

### 5. Architecture
**Decision**: Extend existing `retrieveContext()` function
- Add option to include InnerWorkMessage search
- Single entry point, DRY code
- Keep existing behavior as default

### 6. Initial Trigger
**Decision**: Run retrieval after user's first message (not on session creation)
- More relevant results since we have user content to search against
- Skip retrieval for initial AI greeting

### 7. Current Session Handling
**Decision**: Exclude current Inner Thoughts session from search
- Only retrieve from OTHER Inner Thoughts sessions
- Current conversation is already in context via conversation history

### 8. Retrieval Limits
**Decision**: 15 combined across both sources, sorted by relevance
- No separate limits per table - let relevance determine what surfaces
- Slight increase from 10 to account for new source

### 9. Similarity Threshold
**Decision**: Higher threshold (0.75) since no LLM gating
- Partner sessions use 0.5 threshold with Haiku gating
- Inner Thoughts uses 0.75 threshold without gating
- Higher threshold prevents noise from always-on search

## Performance Optimization (NEW)

### Current Issues Identified
1. **`detectMemoryIntent()` is BLOCKING** - adds 200-500ms after AI response is ready
2. **Pre-LLM operations are sequential** - could be parallelized

### Optimized Flow
```
1. Save user message (DB) ─────────────────────────────────────────
                              │
2. PARALLEL PRE-LLM:          │ ~150ms (longest op wins)
   ├─ getEmbedding + vectorSearch (retrieval)  ~100-150ms
   ├─ getInnerThoughtsSummary (DB)             ~5ms
   ├─ getRecentThemes (DB)                     ~5ms
   └─ fetchLinkedPartnerSessionContext (DB)    ~15ms
                              │
3. Build prompt with retrieved context ────────────────────────────
                              │
4. MAIN LLM CALL (Sonnet) ────────────────────────── ~1-3s ───────
                              │
5. Save AI message + update timestamp (DB) ────────────────────────
                              │
6. SEND RESPONSE TO USER ◄──── USER SEES RESPONSE HERE ───────────
                              │
7. FIRE-AND-FORGET (non-blocking):
   ├─ embedInnerWorkMessage x2 (Titan)
   ├─ updateSessionMetadata (Haiku)
   ├─ updateInnerThoughtsSummary (Haiku)
   └─ detectMemoryIntent (Haiku) ← MOVED FROM BLOCKING
       └─ Push suggestion via Ably when ready
```

### Key Changes
1. **Move `detectMemoryIntent` to non-blocking** - push via Ably when ready
2. **Parallelize pre-LLM operations** - retrieval runs alongside existing DB queries
3. **Net latency impact**: +100-150ms for retrieval, -200-500ms from fixing memory detection = **net improvement**

## Out of Scope
- User preferences UI for controlling retrieval settings
- Proactive surfacing ("I remember you said...") - only passive context in prompt
- Haiku-based detection for Inner Thoughts (using threshold instead)

## In Scope
- Partner session retrieval from Inner Thoughts (context flows both directions)
- Performance optimization (parallelize, non-blocking memory detection)

## Open Questions
- [Gathering more info...]
