# Current Architecture: Prompts, Context Management, and Retrieval

## 1. Model / API Integration

### SDK & Client
- **SDK**: `@aws-sdk/client-bedrock-runtime` (v3.958.0)
- **Client**: Singleton `BedrockRuntimeClient` in `backend/src/lib/bedrock.ts`
- **API**: AWS Bedrock **Converse API** (`ConverseCommand`, `ConverseStreamCommand`, `InvokeModelCommand` for embeddings)
- **Region**: `us-east-1` (configurable via `AWS_REGION`)

### Models Currently Used

| Model | Model ID | Role | Pricing (input/output per 1K tokens) |
|-------|----------|------|--------------------------------------|
| **Sonnet 3.5 v2** | `anthropic.claude-3-5-sonnet-20241022-v2:0` | User-facing empathetic responses | $0.003 / $0.015 |
| **Haiku 3.5** | `anthropic.claude-3-5-haiku-20241022-v1:0` | Mechanics: classification, detection, JSON output | $0.001 / $0.005 |
| **Titan Embed v2** | `amazon.titan-embed-text-v2:0` | Embeddings (1024-dim vectors) | $0.00002 / $0 |

### Key API Functions (`bedrock.ts`)

| Function | Model | Purpose | Max Tokens |
|----------|-------|---------|------------|
| `getCompletion()` | Sonnet (default) | Legacy text completion | 2048 |
| `getModelCompletion(model, opts)` | Haiku or Sonnet | Explicit model selection | 2048 |
| `getHaikuJson<T>(opts)` | Haiku | Structured JSON output | 1024 |
| `getSonnetResponse(opts)` | Sonnet | Empathetic user-facing text | 2048 |
| `getSonnetStreamingResponse(opts)` | Sonnet | SSE streaming for real-time UI | 2048 |
| `getEmbedding(text)` | Titan | 1024-dim vector generation | N/A |

### Extended Thinking
- **NOT supported** on Bedrock Claude 3.5 Sonnet v2 — `thinkingBudget` parameter exists but is **disabled** (`bedrock.ts:425-435`).
- Code has thinking budget support scaffolded (only works with Sonnet, not Kimi).

### Kimi K2.5 Toggle
- `USE_KIMI = false` constant in `bedrock.ts:155`. When enabled, both Haiku and Sonnet calls route to `moonshotai.kimi-k2.5`.
- Kimi pricing: $0.002/$0.01 per 1K tokens.

---

## 2. System Prompts

### Location: `backend/src/services/stage-prompts.ts` (1536 lines)

### Architecture: Stage-Specific System Prompts
Each stage has its own prompt builder function. The system prompt is assembled dynamically based on:
- Current stage (0-4)
- Turn count
- Emotional intensity
- Phase (onboarding, invitation, witnessing, etc.)
- Context bundle data

### Prompt Composition Structure

```
[Stage-specific role + instructions]     ← buildStage1Prompt(), etc.
  ├── buildBaseSystemPrompt()            ← shared base (privacy, style, constitution)
  │     ├── SIMPLE_LANGUAGE_PROMPT       ← "Warm, clear, direct. No jargon."
  │     ├── PINNED_CONSTITUTION          ← Core identity + privacy + dual-track sharing
  │     ├── PRIVACY_GUIDANCE             ← Never claim partner's thoughts
  │     ├── INVALID_MEMORY_GUIDANCE      ← Redirect memory requests
  │     └── PROCESS_OVERVIEW             ← Only if user asks about process (conditional)
  ├── FACILITATOR_RULES                  ← Reflect → validate → one next move
  ├── LATERAL_PROBING_GUIDANCE           ← Widen lens if brief/guarded
  ├── Stage-specific modes/rules
  ├── Transition injection (if stage just changed)
  ├── Post-share context (if user just shared with partner)
  └── buildResponseProtocol()            ← OUTPUT FORMAT with <thinking> tags
```

### Estimated Prompt Sizes (rough character counts)

| Stage | Prompt Builder | Est. Characters | Est. Tokens (~4 chars/token) |
|-------|---------------|-----------------|------------------------------|
| Stage 0: Onboarding | `buildOnboardingPrompt()` | ~1,200 | ~300 |
| Stage 0: Invitation | `buildInvitationPrompt()` | ~1,800 | ~450 |
| Stage 1: Witnessing | `buildStage1Prompt()` | ~2,500 | ~625 |
| Stage 2: Perspective | `buildStage2Prompt()` | ~3,200 | ~800 |
| Stage 3: Needs | `buildStage3Prompt()` | ~2,800 | ~700 |
| Stage 4: Repair | `buildStage4Prompt()` | ~2,600 | ~650 |
| Inner Work | `buildInnerWorkPrompt()` | ~3,500 | ~875 |
| Linked Inner Thoughts | `buildLinkedInnerThoughtsPrompt()` | ~4,000 | ~1,000 |
| Reconciler | `buildReconcilerPrompt()` | ~4,500 | ~1,125 |
| Initial Messages | `buildInitialMessagePrompt()` | ~1,000-2,000 | ~250-500 |

### Key Design Decisions
- **No communication principles prompt**: Removed because "Sonnet 3.5 handles this natively" (`stage-prompts.ts:69`)
- **No memory guidance**: Memory detection feature was removed (`stage-prompts.ts:70`)
- **PROCESS_OVERVIEW is conditional**: Only injected when user asks about process/stages — token optimization (`stage-prompts.ts:213`)
- **Response protocol uses semantic tags** (`<thinking>`, `<draft>`, `<dispatch>`) instead of JSON for faster streaming

### Response Protocol Format (micro-tags)
```
<thinking>
Mode: [WITNESS|PERSPECTIVE|NEEDS|REPAIR|ONBOARDING|DISPATCH]
UserIntensity: [1-10]
FeelHeardCheck: [Y/N]     (Stage 1 only)
ReadyShare: [Y/N]          (Stage 2 only)
Strategy: [brief]
</thinking>
<draft>                     (optional - invitation or empathy statement)
draft text
</draft>
<dispatch>ACTION</dispatch> (optional - off-ramp)

Then plain text response.
```

---

## 3. Conversation History Management

### Turn Buffer Sizes (from `memory-intent.ts:407-431`)

Controlled by stage and memory intent. Notable facts reduce needed history:

| Stage | Turn Buffer (turns × 2 = messages) | Notes |
|-------|-----------------------------------|-------|
| Stage 1 (Witnessing) | 5 turns (10 messages) | "Facts now capture emotional context" |
| Stage 2 (Perspective) | 4 turns (8 messages) | Structured empathy building |
| Stage 3 (Need Mapping) | 4 turns (8 messages) | Procedural |
| Stage 4 (Repair) | 5 turns (10 messages) | "Facts provide relationship/situation context" |
| Avoid Recall | 0 | No history sent |
| Stage Enforcement | 2 turns (4 messages) | Minimal |

### Two-Level Trimming

1. **Context Assembler** (`context-assembler.ts:254-294`): Fetches `bufferSize * 2` most recent messages from DB, filtered to this user's messages + AI responses directed to them.

2. **AI Orchestrator** (`ai-orchestrator.ts:347-355`): Further trims with `trimConversationHistory()`:
   - With session summary: 8 recent turns (16 messages)
   - Without summary: 12 recent turns (24 messages)

3. **Token Budget** (`token-budget.ts:200-286`): Final budget enforcement via `buildBudgetedContext()`:
   - **Protected**: Last 6 turns (12 messages) — NEVER dropped
   - **Evictable**: Older messages — 60% of remaining budget
   - **Retrieved context**: 40% of remaining budget — lowest priority, dropped first

### Summarization (`conversation-summarizer.ts`)

- **Trigger**: After 30 messages OR when total tokens > 3,500
- **Model**: Haiku (fast, structured JSON output)
- **Re-summarize**: Every 20 new messages after initial summary
- **Recent messages kept**: 15 most recent (not summarized)
- **Summary target**: ~500 words
- **Storage**: `UserVessel.conversationSummary` (JSON)
- **Pattern**: Fire-and-forget (non-blocking, runs after response sent)
- **Output**: Narrative summary + keyThemes + emotionalJourney + unresolvedTopics + agreedFacts + userNeeds + partnerNeeds + openQuestions + agreements

### Inner Thoughts Summarization
- Similar strategy, lower thresholds: trigger at 20 messages, keep 12 recent, re-summarize every 15

---

## 4. Retrieval / RAG Architecture

### "Fact-Ledger" Architecture
The system uses **session-level content embeddings** rather than message-level embeddings. Facts + summary are embedded at the session level for retrieval.

### Embedding Flow
1. **Facts Extraction** (`partner-session-classifier.ts`): After each AI response, Haiku extracts notable facts → stored in `UserVessel.notableFacts` (max 20 per session)
2. **Session Content Embedding** (`embedding.ts:117-208`): Facts + summary → combined into embeddable text → Titan generates 1024-dim vector → stored in `UserVessel.contentEmbedding`
3. **Semantic Search** (`embedding.ts:220-277`): Query text → Titan embedding → pgvector cosine similarity search on `contentEmbedding`

### Notable Facts ("Running List of Facts")
- **Extraction**: Haiku-based, fire-and-forget after AI response
- **Format**: `[{ category: "Emotional" | "People" | "Logistics" | "Conflict" | "History", fact: "..." }]`
- **Max per session**: 20 facts
- **Diff-based updates**: Facts have stable UUIDs; Haiku outputs `{ upsert: [...], delete: [...] }` for incremental updates
- **Injected into prompt**: As `--- Notable facts ---` section in formatted context

### Global Memory (`global-memory.ts`)
- **Purpose**: Cross-session user profile (consolidated from all sessions)
- **Max**: 50 facts (~500 tokens)
- **Consolidation**: Haiku merges session facts into global profile (simple merge if < 50, AI-assisted if > 50)
- **Current status**: **DISABLED** — `loadGlobalFacts` call commented out in `context-assembler.ts:211` ("disabled until consent UI is implemented")

### Context Retrieval Pipeline (`context-retriever.ts`)

Per-message flow:
1. **Reference Detection** (`detectReferences()`): Haiku analyzes user message for past references → with circuit breaker protection
   - Currently **SKIPPED** for partner sessions (`skipDetection: true` in orchestrator) — detection moved to fire-and-forget
   - Still active for Inner Thoughts sessions
2. **Conversation History**: Raw DB query (not vector store) — avoids "async blind spot" where recent messages aren't embedded yet
3. **Cross-Session Search**: Session-level content search via pgvector — **currently DISABLED** (`shouldSearchCrossSession = false` in `context-retriever.ts:519`)
4. **Inner Thoughts Search**: Session-level search with 30% boost for linked sessions

### Retrieval Depth by Stage (`memory-intent.ts`)

| Stage | Default Depth | Cross-Session | Similarity Threshold |
|-------|--------------|---------------|---------------------|
| 0 (Onboarding) | minimal | No | 0.60 |
| 1 (Witness) | minimal → light | No | 0.65 |
| 2 (Perspective) | light | No (disabled) | 0.55 |
| 3 (Need Mapping) | full | No (disabled) | 0.50 |
| 4 (Repair) | full | No (disabled) | 0.50 |
| High distress (≥9) | none | No | N/A |
| Commitment reference | full | Yes (override) | stage default |

---

## 5. Context Window Budget

### Configuration (`token-budget.ts`)

```typescript
MODEL_LIMITS = {
  maxInputTokens: 150_000,        // Conservative limit (model supports 200K)
  systemPromptBudget: 4_000,      // Reserved for system prompt
  outputReservation: 4_000,       // Reserved for AI response
  contextBudget: 40_000,          // Target max for context injection
};

CONTEXT_LIMITS = {
  maxConversationMessages: 24,
  maxMessageLength: 2_000,
  maxCrossSessionMessages: 10,
  maxCurrentSessionRetrieved: 5,
  maxPreSessionMessages: 10,
};
```

### Token Estimation
- **Method**: Character-based heuristic — `Math.ceil(text.length / 4)` (`token-budget.ts:68-72`)
- **No tokenizer library** — uses conservative 4 chars/token estimate

### Eviction Hierarchy (Strict Priority, drop from bottom up)

1. **System/Stage Prompts** — NEVER DROP (highest priority)
2. **Recent History (last 6 turns / 12 messages)** — PROTECT (never dropped)
3. **Older Conversation History** — 60% of remaining budget
4. **Retrieved/RAG Context** — 40% of remaining budget (DROP FIRST)

### How Context Gets Cut

```
Available budget = 40,000 - systemPromptTokens - 4,000 (output reservation)
├── Protected messages (last 12 messages) → always included
├── Remaining budget split:
│   ├── 60% → older conversation messages (drop oldest first)
│   └── 40% → retrieved context (truncate intelligently at section boundaries)
└── If still over budget → drop oldest messages from evictable pool
```

### Intelligent Truncation
When retrieved context exceeds its budget, `truncateContextIntelligently()` tries to break at `===` section headers rather than mid-section.

---

## 6. Full Context Assembly Pipeline

### What Gets Sent to the Model (per turn)

```
SYSTEM PROMPT:
  ├── Stage-specific prompt (600-1,000 tokens)
  └── Base guidance (privacy, constitution, style)

MESSAGES ARRAY:
  ├── [Conversation history — recent 8-24 messages]
  └── [Current user message, prefixed with context]:
        Context:
        ├── Intensity: 6/10 (stable) | Turn 7
        ├── --- Rolling summary --- (if exists)
        │     Current focus, themes, needs, open questions
        ├── --- User preferences to honor ---
        │     - [memory items, max 5]
        ├── --- Notable facts --- (max 5)
        │     - [categorized facts from this session]
        ├── --- Private reflections --- (max 2)
        │     - [Inner Thoughts content, if relevant]
        ├── --- Shared/consent state ---
        │     [what was shared between partners]
        ├── --- Milestones ---
        │     [milestone context]
        ├── [Retrieved context from other sessions]
        │     [MEMORY CONTEXT GUIDANCE: ...]
        │     [Earlier in this conversation] ...
        │     [Related content from previous sessions] ...
        └── User message: "actual message text"
```

### Context Formatting (`context-formatters.ts`)
The `formatContextForPrompt()` function builds a compact context string from the `ContextBundle`:
- Intensity + trend + turn count (1 line)
- Rolling summary (if exists)
- User preferences (max 5 items)
- Notable facts (max 5 items)
- Inner Thoughts reflections (max 2 items)
- Shared content history
- Milestone context

---

## 7. LLM Calls Per User Turn

### Main Response Pipeline (`ai-orchestrator.ts`)

For a typical Stage 1 turn:

| # | Call | Model | When | Blocking? |
|---|------|-------|------|-----------|
| 1 | Memory intent determination | **None** (rule-based) | Always | Yes (instant) |
| 2 | Context assembly + retrieval | DB queries + 1 Titan embedding | Always | Yes (parallel) |
| 3 | Reference detection | Haiku (skipped for partner sessions) | When not skipped | Was blocking, now skipped |
| 4 | Retrieval planning | Haiku | Only for `full` depth + detected refs | Yes |
| 5 | **Main response** | **Sonnet or Haiku** (via model router) | Always | Yes (streaming) |
| 6 | Background fact extraction | Haiku | Fire-and-forget after response | No |
| 7 | Session summary update | Haiku | Fire-and-forget, after 30+ msgs | No |
| 8 | Session content embedding | Titan | Fire-and-forget, after facts update | No |

### Model Router (`model-router.ts`)

The main response can be routed to either Sonnet or Haiku based on a scoring system:

| Factor | Score Impact | Notes |
|--------|-------------|-------|
| Mediation response | +4 | Most partner sessions |
| High intensity (≥8) | +3 | De-escalation needs empathy |
| Ambiguous message | +2 | Needs nuance |
| Long message (>500 chars) | +1 | Complex input |
| Draft/rewrite/classify | -1 | Mechanical task |
| **Threshold** | **≥4 → Sonnet** | Otherwise Haiku |

In practice: nearly all partner session responses go to **Sonnet** (mediation=+4 alone triggers threshold).

### Additional LLM Call Sites (outside main pipeline)

| Service | Model | Purpose | File |
|---------|-------|---------|------|
| Reconciler | Sonnet + Haiku | Gap analysis between empathy statements | `reconciler.ts` |
| Witnessing | Sonnet | Witnessing responses | `witnessing.ts` |
| Attacking language detection | Haiku | Safety check | `attacking-language.ts` |
| Memory formatter | Haiku | Format memory for storage | `memory-formatter.ts` |
| Memory validator | Haiku | Validate memory requests | `memory-validator.ts` |
| People extractor | Haiku | Extract person names | `people-extractor.ts` |
| Gratitude | Haiku | Gratitude feature | `gratitude.ts` |
| Meditation | Sonnet | Guided meditation | `meditation.ts` |
| Inner work | Sonnet | Solo reflection responses | `inner-work.ts` |
| Stage 2 | Sonnet | Perspective stretch responses | `stage2.ts` |
| Chat router | Haiku + Sonnet | Pre-session routing | `chat-router/` |
| Dispatch handler | Sonnet | Off-ramp responses (process explanation) | `dispatch-handler.ts` |

---

## 8. Cost Tracking

### BrainService (`brain-service.ts`)
All LLM calls go through BrainService for telemetry:
- `startActivity()` → logs model, input, operation type
- `completeActivity()` → logs output, token counts, duration, cost
- `failActivity()` → logs errors
- Pricing calculated from hardcoded `PRICING` table in `bedrock.ts:31-41`

### LLM Telemetry (`llm-telemetry.ts`)
Tracks per-turn metrics:
- `recordContextSizes()` — pinned/summary/recent/rag token sizes
- `recordLlmCall()` — individual call stats
- `finalizeTurnMetrics()` — aggregates all calls in a turn

---

## 9. Key Optimization Opportunities Observed

1. **Sonnet 3.5 v2 → Sonnet 4/Haiku 4.5**: Current models are from Oct 2024. Newer models may be faster/cheaper/better.

2. **No prompt caching**: The Bedrock Converse API is used without any prompt caching mechanism. System prompts and context are re-sent every turn.

3. **Context budget is generous (40K tokens)** but actual usage is likely much lower:
   - System prompts: ~600-1,000 tokens
   - Recent history: ~2,000-5,000 tokens (8-24 messages)
   - Retrieved context: ~500-2,000 tokens
   - **Total typical input: ~4,000-8,000 tokens** — well under the 40K budget

4. **Cross-session retrieval disabled**: Both cross-session search and global facts are disabled "until consent UI is implemented", reducing retrieval costs but also reducing context quality.

5. **Two summarization triggers**: Both message count (30) and token threshold (3,500) can trigger summarization — the token threshold is very low and may trigger too early.

6. **Character-based token estimation**: No actual tokenizer — using 4 chars/token heuristic. Could be more accurate with `@anthropic-ai/tokenizer` or similar.

7. **Extended thinking disabled**: The code scaffolds thinking budget support but it's commented out because Bedrock Sonnet 3.5 v2 doesn't support it.

8. **Reference detection skipped**: For partner sessions, Haiku reference detection is now skipped (`skipDetection: true`), reducing one blocking Haiku call per turn.

9. **Model router almost always selects Sonnet**: For partner session mediation (score ≥ 4), the router always picks Sonnet. The Haiku path is mostly used for drafts and classifications.

10. **Stage prompts are relatively compact**: The largest stage prompt (Stage 2 with empathy draft) is ~800 tokens, well within the 4,000-token system prompt budget.
