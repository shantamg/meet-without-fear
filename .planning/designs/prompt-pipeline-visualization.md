# Prompt Pipeline Visualization Design

## Table of Contents

1. [Pipeline Flow Diagram](#1-pipeline-flow-diagram)
2. [System Prompt Inspector](#2-system-prompt-inspector)
3. [Context Injection Viewer](#3-context-injection-viewer)
4. [History Management View](#4-history-management-view)
5. [Retrieval Planning Display](#5-retrieval-planning-display)
6. [Response Parsing Viewer](#6-response-parsing-viewer)
7. [Tag Trap Visualization](#7-tag-trap-visualization)
8. [Dispatch Flow](#8-dispatch-flow)
9. [Pipeline Timing Waterfall](#9-pipeline-timing-waterfall)
10. [Prompt Diff Viewer](#10-prompt-diff-viewer)
11. [Data Capture Strategy](#data-capture-strategy)
12. [Implementation Notes](#implementation-notes)

---

## 1. Pipeline Flow Diagram

### Concept: Interactive Sankey-Style Flow

Visualize the orchestration pipeline as a connected node graph where each stage shows data flowing through the system. Nodes are interactive — clicking expands the detail panel for that stage.

### Layout

```
 USER MESSAGE
      |
      v
 +-----------------+       +--------------------+
 | Memory Intent   |------>| Surfacing Policy   |
 | Determination   |       | Decision           |
 +-----------------+       +--------------------+
      |
      v (parallel fan-out)
 +----------+  +----------+  +----------+  +----------+  +----------+
 | Context  |  | Context  |  | Shared   |  | Milestone|  | User     |
 | Assembly |  | Retrieval|  | Content  |  | Context  |  | Prefs    |
 +----------+  +----------+  +----------+  +----------+  +----------+
      |              |             |             |             |
      v              v             v             v             v
 +------------------------------------------------------------+
 |                 CONTEXT MERGE & FORMATTING                  |
 +------------------------------------------------------------+
      |
      v (conditional)
 +-----------------+
 | Retrieval       |  <-- Haiku (only if depth='full' + refs detected)
 | Planning        |
 +-----------------+
      |
      v
 +-----------------+
 | Prompt Builder  |  <-- buildStagePrompt() returns PromptBlocks
 | (Static+Dynamic)|
 +-----------------+
      |
      v
 +-----------------+        +-----------------+
 | Token Budget    |------->| Model Router    |
 | Management      |        | (Sonnet/Haiku)  |
 +-----------------+        +-----------------+
      |                           |
      v                           v
 +-----------------+
 | LLM Call        |  <-- streaming response
 +-----------------+
      |
      v
 +-----------------+      +-----------------+
 | Tag Trap        |----->| Dispatch        |  (if <dispatch> tag found)
 | State Machine   |      | Handler         |
 +-----------------+      +-----------------+
      |                         |
      v                         v
 +-----------------+
 | Response Parse  |  <-- parseMicroTagResponse()
 +-----------------+
      |
      v
 SSE STREAM TO CLIENT
```

### Visual Design

- **Node colors**: Blue for decision nodes, green for data assembly, orange for LLM calls, red for filtering/parsing
- **Edge thickness**: Proportional to token count flowing through that edge
- **Parallel branches**: Rendered side-by-side with a grouping bracket labeled "Promise.all"
- **Conditional nodes**: Dashed borders (e.g., Retrieval Planning only runs when depth='full')
- **Active/Inactive**: Nodes that were skipped in the current turn shown grayed out with "SKIPPED" label

### Interaction

- **Click node**: Opens detail panel on the right (specific visualization for that stage)
- **Hover edge**: Shows token count, data size, and timing tooltip
- **Timeline scrubber**: Bottom of diagram lets you step through turns to see how the flow changed
- **Badge overlays**: Each node shows a small badge with its duration (e.g., "142ms")

### Data Source

The orchestrator already logs timing at key points:
- `decisionTime` (memory intent)
- `parallelTime` (context assembly + retrieval)
- `responseTime` (LLM call)
- `totalDuration` (end-to-end)

**New data needed**: Wrap each pipeline stage with a `PipelineTrace` object:

```typescript
interface PipelineTrace {
  turnId: string;
  stages: PipelineStage[];
  totalDurationMs: number;
}

interface PipelineStage {
  name: string;                    // e.g., 'memory_intent', 'context_assembly'
  startMs: number;                 // offset from turn start
  durationMs: number;
  inputSummary: Record<string, unknown>;  // key inputs
  outputSummary: Record<string, unknown>; // key outputs
  model?: 'haiku' | 'sonnet';     // if LLM call
  tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  skipped?: boolean;
  skipReason?: string;
}
```

---

## 2. System Prompt Inspector

### Concept: Split-Pane Syntax-Highlighted Prompt Viewer

Shows the complete system prompt with clear visual separation between the **static block** (cached) and **dynamic block** (per-turn). Highlights which portions get `cache_control: { type: 'ephemeral' }`.

### Layout

```
+------------------------------------------------------------------+
| SYSTEM PROMPT INSPECTOR                          Turn 7 of 12    |
|------------------------------------------------------------------|
|                                                                  |
| [Static Block]  [Dynamic Block]  [Combined]  [Diff from prev]   |
|                                                                  |
| STATIC BLOCK (CACHED)                         ~1,240 tokens     |
| +--------------------------------------------------------------+|
| | You're here to listen to Sarah and really understand...       ||
| |                                                               ||
| | VOICE & STYLE:                                                ||
| | You sound like a person -- warm, direct, and real...          ||
| |                                                               ||
| | [PINNED CONSTITUTION]  <- collapsible section                 ||
| | [PRIVACY GUIDANCE]     <- collapsible section                 ||
| | [NEUTRALITY GUIDANCE]  <- collapsible section                 ||
| | [STAGE1 LISTENING RULES] <- collapsible section               ||
| | [RESPONSE PROTOCOL]   <- collapsible section                  ||
| +--------------------------------------------------------------+|
|   cache_control: { type: 'ephemeral' }                          |
|                                                                  |
| DYNAMIC BLOCK (NOT CACHED)                     ~180 tokens      |
| +--------------------------------------------------------------+|
| | RIGHT NOW: You have a solid picture now. When it feels        ||
| | right, reflect back what you've heard using Sarah's own       ||
| | words...                                                      ||
| |                                                               ||
| | Emotional intensity: 6/10                                     ||
| | Turn: 7                                                       ||
| +--------------------------------------------------------------+|
|                                                                  |
| TOKEN BREAKDOWN                                                  |
| +----+----------------------------------------------------------+|
| | Static:  ████████████████████████████████████  1,240 (87%)    ||
| | Dynamic: █████                                  180 (13%)    ||
| +----+----------------------------------------------------------+|
+------------------------------------------------------------------+
```

### Visual Elements

1. **Color coding**:
   - Static block: Light blue background (cached content)
   - Dynamic block: Light yellow background (per-turn content)
   - Injected content (transition, post-share): Light green background
   - User names highlighted: Bold orange (shows personalization)

2. **Collapsible sections**: Each major prompt section (CONSTITUTION, NEUTRALITY, LISTENING_RULES, etc.) has a disclosure triangle. Collapsed by default to show structure at a glance.

3. **Token bar**: Horizontal stacked bar showing static vs dynamic token ratio. Goal: static should be ~80-90% for optimal cache hit rates.

4. **Cache indicator**: Green checkmark when the static block matches the previous turn (cache hit), yellow when it changed (cache miss), red when stage changed (full rebuild).

5. **Stage label**: Badge showing which `buildStage*Prompt()` function generated this prompt.

### Prompt Component Breakdown

Show a treemap or stacked bar breaking down the static block by component:

```
STATIC BLOCK COMPOSITION (1,240 tokens)
 +-----------+-----------+--------+---------+----------+---------+
 | Base      | Neutrality| Stage1 | Question| Length   | Response|
 | Guidance  | Guidance  | Rules  | Templates| Rule    | Protocol|
 | 280 tok   | 200 tok   | 340 tok| 80 tok  | 40 tok  | 300 tok |
 +-----------+-----------+--------+---------+----------+---------+
```

### Diff View

When switching to "Diff from prev" tab, show a unified diff highlighting what changed between turns:
- Green: Added content (new dynamic context)
- Red: Removed content (previous dynamic context)
- Gray: Unchanged static block (collapsed to single line showing "1,240 tokens unchanged")

---

## 3. Context Injection Viewer

### Concept: Layered Context Explorer

Shows everything that was assembled and injected into the AI's context window, with clear provenance (where each piece came from) and relevance scores.

### Layout

```
+------------------------------------------------------------------+
| CONTEXT INJECTION                                                |
|------------------------------------------------------------------|
|                                                                  |
| CONTEXT BUNDLE                                    2,340 tokens   |
| +--------------------------------------------------------------+|
| | Conversation (8 turns)          ████████████  1,200 tok       ||
| | Notable Facts (5)               ████           280 tok        ||
| | Session Summary                 ███            180 tok        ||
| | Emotional Thread                ██             120 tok        ||
| | Shared Content History          ████           260 tok        ||
| | Milestone Context               ███            180 tok        ||
| | User Memories                   ██             120 tok        ||
| +--------------------------------------------------------------+|
|                                                                  |
| RETRIEVED CONTEXT (Semantic Search)               860 tokens    |
| +--------------------------------------------------------------+|
| | Cross-session match 1     sim=0.72  ████       240 tok        ||
| |   "I feel like nobody listens..."                             ||
| |   [Session: Feb 12 with Alex]                                 ||
| |                                                               ||
| | Cross-session match 2     sim=0.61  ███        180 tok        ||
| |   "The thing about trust is..."                               ||
| |   [Session: Jan 28 with Alex]                                 ||
| |                                                               ||
| | Current session match     sim=0.68  ████       220 tok        ||
| |   "What really bothered me was..."                            ||
| |   [Turn 3, 14 mins ago]                                      ||
| +--------------------------------------------------------------+|
|                                                                  |
| INJECTION POINT                                                  |
| +--------------------------------------------------------------+|
| | User message (original):                                      ||
| |   "I just feel like she never listens to me"                  ||
| |                                                               ||
| | Injected as:                                                  ||
| |   Context:                                                    ||
| |   [formatted context bundle...]                               ||
| |                                                               ||
| |   User message: I just feel like she never listens to me      ||
| +--------------------------------------------------------------+|
+------------------------------------------------------------------+
```

### Visual Elements

1. **Source badges**: Each context piece tagged with its origin:
   - `DB` for database queries (notable facts, session summary)
   - `VECTOR` for embedding-based retrieval
   - `COMPUTED` for derived data (emotional thread trend)
   - `CACHED` for data from previous turns

2. **Similarity scores**: For retrieved context, show similarity score as a colored bar:
   - Green (0.7+): High relevance
   - Yellow (0.5-0.7): Moderate relevance
   - Red (<0.5): Low relevance (near threshold)

3. **Token budget meter**: Shows how much of the 40K token context budget was used:
   ```
   Context Budget: ████████████░░░░░░░░  3,200 / 40,000 (8%)
   ```

4. **Truncation indicators**: If any context was truncated by `buildBudgetedContext()`, show a warning badge with details:
   - "3 older messages truncated (exceeded 60% conversation budget)"
   - "Retrieved context truncated at section boundary (exceeded 40% RAG budget)"

5. **Reference detection**: Highlighted spans in the user message showing what the retriever detected:
   ```
   "I just feel like [she]^person [never listens]^feeling to me"
   ```

### Notable Facts View

Expandable list showing the categorized facts loaded from UserVessel:

```
NOTABLE FACTS (5)
  emotional_context: "Sarah feels unheard in conversations about finances"
  situational_fact: "They recently moved to a new city for Sarah's job"
  people_relationships: "Sarah's mother-in-law has been staying with them"
  emotional_context: "Alex feels defensive when money comes up"
  situational_fact: "They have a 2-year-old daughter named Emma"
```

---

## 4. History Management View

### Concept: Timeline with Budget Allocation

Visualize which messages from the conversation history were included vs excluded, and why.

### Layout

```
+------------------------------------------------------------------+
| HISTORY MANAGEMENT                                               |
|------------------------------------------------------------------|
|                                                                  |
| CONVERSATION HISTORY (24 messages total)                         |
|                                                                  |
| Summary boundary ───────────────────────── (after turn 4)        |
|                                                                  |
|  Turn  Role   Tokens  Status                                     |
| ┌────┬────────┬──────┬─────────────────────────────────────┐     |
| │  1 │ user   │   45 │ ░░░ EXCLUDED (before summary)       │     |
| │  1 │ assist │   62 │ ░░░ EXCLUDED (before summary)       │     |
| │  2 │ user   │   38 │ ░░░ EXCLUDED (before summary)       │     |
| │  2 │ assist │   71 │ ░░░ EXCLUDED (before summary)       │     |
| │  3 │ user   │   52 │ ░░░ EXCLUDED (before summary)       │     |
| │  3 │ assist │   58 │ ░░░ EXCLUDED (before summary)       │     |
| │  4 │ user   │   44 │ ░░░ EXCLUDED (before summary)       │     |
| │  4 │ assist │   65 │ ░░░ EXCLUDED (before summary)       │     |
| │  5 │ user   │   41 │ ▓▓▓ EVICTABLE (older, included)     │     |
| │  5 │ assist │   67 │ ▓▓▓ EVICTABLE (older, included)     │     |
| │  6 │ user   │   53 │ ▓▓▓ EVICTABLE (older, included)     │     |
| │  6 │ assist │   72 │ ▓▓▓ EVICTABLE (older, included)     │     |
| │  7 │ user   │   49 │ ███ PROTECTED (last 8 turns)        │     |
| │  7 │ assist │   81 │ ███ PROTECTED (last 8 turns)        │     |
| │  8 │ user   │   56 │ ███ PROTECTED (last 8 turns)        │     |
| │  8 │ assist │   63 │ ███ PROTECTED (last 8 turns)        │     |
| │ ...│        │      │                                     │     |
| │ 12 │ user   │   47 │ ███ PROTECTED (last 8 turns)        │     |
| └────┴────────┴──────┴─────────────────────────────────────┘     |
|                                                                  |
| BUDGET ALLOCATION                                                |
| ┌──────────────────────────────────────────────────────────┐     |
| │ System prompt:    ████████████                 4,000 tok │     |
| │ Protected msgs:   ██████████████████████       8,200 tok │     |
| │ Older msgs:       ██████████                   3,800 tok │     |
| │ Retrieved ctx:    ████████                     2,400 tok │     |
| │ Output reserve:   ████                         4,000 tok │     |
| │ Available:        ░░░░░░░░░░░░░░░░░░░░░░░░   17,600 tok │     |
| └──────────────────────────────────────────────────────────┘     |
| Total: 22,400 / 40,000 budget (150K model limit)                |
|                                                                  |
| EVICTION HIERARCHY                                               |
|   1. System/Stage Prompts (NEVER DROP)                          |
|   2. Protected History (last 8 turns, NEVER DROP)               |
|   3. Retrieved Cross-Session (drop first if needed)             |
|   4. Oldest Session History (drop next)                         |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Message status colors**:
   - Dark blue (PROTECTED): Last 8 turns, never evicted
   - Medium blue (EVICTABLE): Older messages, included if budget allows
   - Gray (EXCLUDED): Before summary boundary or evicted
   - Light red (TRUNCATED): Message content was shortened

2. **Summary boundary line**: Horizontal divider showing where the session summary covers. Messages below this line are represented by the summary, not individually included.

3. **Turn count display**: Shows `trimConversationHistory()` result:
   - With summary: 12 turns max (CONTEXT_WINDOW.recentTurnsWithSummary)
   - Without summary: 16 turns max (CONTEXT_WINDOW.recentTurnsWithoutSummary)

4. **Message preview on hover**: Hovering any message row shows the first 200 chars of its content.

5. **Cache marking**: Second-to-last message highlighted with a cache icon (this message gets `cache_control` to cache the history prefix).

---

## 5. Retrieval Planning Display

### Concept: Query Builder Inspector

Shows what Haiku decided to search for, why, and the results.

### Layout

```
+------------------------------------------------------------------+
| RETRIEVAL PLANNING                                               |
|------------------------------------------------------------------|
|                                                                  |
| DECISION                                                         |
| Memory Intent: recall_commitment (full depth)                    |
| Detected References: 2 (person: "Sarah", feeling: "trust")      |
| Retrieval Triggered: YES                                         |
|                                                                  |
| HAIKU PLANNING CALL                              84ms, 120 tok  |
| +--------------------------------------------------------------+|
| | Input:  Stage 2, user asked "But didn't we already talk       ||
| |         about trust last time?"                                ||
| |                                                               ||
| | Reasoning: "User references previous discussion about         ||
| |            trust, need to search prior sessions for context"   ||
| |                                                               ||
| | Queries:                                                       ||
| |   1. { type: 'user_event', vessel: 'user',                   ||
| |         source: 'vector' }                                    ||
| |   2. { type: 'emotional_reading', vessel: 'user',            ||
| |         source: 'structured' }                                ||
| +--------------------------------------------------------------+|
|                                                                  |
| STAGE CONTRACT VALIDATION                                        |
| +--------------------------------------------------------------+|
| |   Query 1: ALLOWED (Stage 2 permits user vessel access)      ||
| |   Query 2: ALLOWED (Stage 2 permits emotional readings)      ||
| |   Violations: 0                                               ||
| +--------------------------------------------------------------+|
|                                                                  |
| SEARCH RESULTS                                                   |
| +--------------------------------------------------------------+|
| |   Query 1 → 3 results (sim: 0.72, 0.61, 0.48)               ||
| |   Query 2 → 2 results (structured data)                       ||
| +--------------------------------------------------------------+|
+------------------------------------------------------------------+
```

### Visual Elements

1. **Decision gate visualization**: Show the three conditions that must be true for retrieval to trigger:
   ```
   depth='full'        ✓
   retrievedContext     ✓  (references detected)
   has references/data  ✓  (2 refs, 3 relevant msgs)
   ```
   All green = retrieval runs. Any red = skipped (with explanation).

2. **Query type badges**: Color-coded by vessel:
   - Blue: User vessel queries
   - Green: Shared vessel queries (Stage 2+)
   - Purple: Global queries (Stage 4 only)
   - Red border: Contract violation (blocked)

3. **Stage contract matrix**: Small matrix showing which query types are allowed at each stage, with the current stage's column highlighted.

4. **Circuit breaker status**: If Haiku was unavailable, show the fallback:
   ```
   ⚠ Circuit breaker OPEN - using mock retrieval plan
   ```

---

## 6. Response Parsing Viewer

### Concept: Syntax-Highlighted Tag Extractor

Shows the raw AI response with color-coded semantic tags, and the parsed output side by side.

### Layout

```
+------------------------------------------------------------------+
| RESPONSE PARSING                                                 |
|------------------------------------------------------------------|
|                                                                  |
| RAW AI RESPONSE                          PARSED OUTPUT           |
| +----------------------------+  +----------------------------+   |
| | <thinking>                 |  | THINKING (hidden)          |   |
| |   Mode: WITNESS            |  |   Mode: WITNESS            |   |
| |   UserIntensity: 6         |  |   UserIntensity: 6         |   |
| |   FeelHeardCheck: N        |  |   FeelHeardCheck: N        |   |
| |   Strategy: Continue       |  |   Strategy: Continue       |   |
| |   gathering, ask about     |  |   gathering...             |   |
| |   timeline                 |  |                            |   |
| | </thinking>                |  | FLAGS                      |   |
| |                            |  |   offerFeelHeardCheck: NO  |   |
| | That sounds really tough.  |  |   offerReadyToShare: NO    |   |
| | How long has this been     |  |                            |   |
| | going on?                  |  | DRAFT                      |   |
| |                            |  |   (none)                   |   |
| |                            |  |                            |   |
| |                            |  | DISPATCH                   |   |
| |                            |  |   (none)                   |   |
| |                            |  |                            |   |
| |                            |  | USER-FACING RESPONSE       |   |
| |                            |  |   "That sounds really      |   |
| |                            |  |    tough. How long has      |   |
| |                            |  |    this been going on?"    |   |
| +----------------------------+  +----------------------------+   |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Tag syntax highlighting**:
   - `<thinking>...</thinking>`: Red background, monospace font
   - `<draft>...</draft>`: Blue background, italic
   - `<dispatch>...</dispatch>`: Orange background, bold
   - Clean response text: White/default background

2. **Flag extraction**: Parsed flags shown as badge-style indicators:
   - `FeelHeardCheck: Y` → Green badge "FEEL HEARD: YES"
   - `ReadyShare: N` → Gray badge "READY TO SHARE: NO"
   - `UserIntensity: 8` → Orange badge "INTENSITY: 8/10"
   - `Mode: WITNESS` → Blue badge "MODE: WITNESS"

3. **Draft preview**: If a draft was extracted (invitation or empathy), show it in a card:
   ```
   EMPATHY DRAFT (Stage 2)
   ┌──────────────────────────────────────────┐
   │ "I think you might be feeling            │
   │ overwhelmed and scared that things       │
   │ won't change. Maybe you're afraid        │
   │ that I don't see how hard this is        │
   │ for you."                                │
   └──────────────────────────────────────────┘
   ```

4. **JSON fallback indicator**: If the response used the legacy JSON parsing path (compatibility), show a yellow warning:
   ```
   ⚠ Legacy JSON format detected (compatibility fallback)
   ```

---

## 7. Tag Trap Visualization

### Concept: Three-Phase State Machine Replay

Shows the tag trap's buffering process as it filters hidden tags from the SSE stream. This is crucial for understanding what the user sees vs what was hidden.

### Layout

```
+------------------------------------------------------------------+
| TAG TRAP STATE MACHINE                                           |
|------------------------------------------------------------------|
|                                                                  |
| PHASE 1: THINKING TRAP                              380ms       |
| ┌──────────────────────────────────────────────────────────┐     |
| │ Buffer: "<thinking>Mode: WITNESS\nUserIntensity: 6\n    │     |
| │          FeelHeardCheck: N\nStrategy: Continue gathering, │     |
| │          ask about timeline</thinking>"                  │     |
| │                                                          │     |
| │ Status: COMPLETE (</thinking> found at char 142)         │     |
| │ Extracted thinking: 142 chars                            │     |
| │ Chunks buffered: 0 sent to client                        │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| PHASE 2: TAG TRAP                                    120ms       |
| ┌──────────────────────────────────────────────────────────┐     |
| │ Buffer: "That sounds really tough. How long has this "   │     |
| │                                                          │     |
| │ Checking: No <draft> or <dispatch> tags found            │     |
| │ Clean text: 52 chars (> 50 threshold)                    │     |
| │ Partial tag scan: No partial tag starts                  │     |
| │ Status: RELEASED (safe to stream)                        │     |
| │ Chunks buffered: 4, all released                         │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| PHASE 3: NORMAL STREAMING                            240ms       |
| ┌──────────────────────────────────────────────────────────┐     |
| │ Remaining text streamed directly                         │     |
| │ Safety buffer: 30 chars (no late tags detected)          │     |
| │ Chunks sent: 3                                           │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| BEFORE / AFTER COMPARISON                                        |
| ┌────────────────────────┐  ┌────────────────────────┐          |
| │ FULL AI OUTPUT         │  │ CLIENT RECEIVED        │          |
| │                        │  │                        │          |
| │ <thinking>             │  │ That sounds really     │          |
| │ Mode: WITNESS          │  │ tough. How long has    │          |
| │ UserIntensity: 6       │  │ this been going on?    │          |
| │ FeelHeardCheck: N      │  │                        │          |
| │ Strategy: Continue...  │  │                        │          |
| │ </thinking>            │  │                        │          |
| │                        │  │                        │          |
| │ That sounds really     │  │                        │          |
| │ tough. How long has    │  │                        │          |
| │ this been going on?    │  │                        │          |
| └────────────────────────┘  └────────────────────────┘          |
|                                                                  |
| HIDDEN: 142 chars (thinking)  SHOWN: 52 chars (response)        |
| Ratio: 73% hidden / 27% visible                                 |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Phase timeline**: Horizontal bar showing the three phases with their durations:
   ```
   [  THINKING TRAP (380ms)  ][TAG TRAP (120ms)][ STREAMING (240ms) ]
   ```

2. **Buffer replay**: Animated replay showing characters arriving and being buffered/released:
   - Red characters: Buffered (hidden from client)
   - Green characters: Released to client
   - Yellow characters: Currently in buffer (uncertain)

3. **Safety limit indicators**: If any phase hit the 2000-char safety limit:
   ```
   ⚠ Phase 1 safety limit triggered: </thinking> not found within 2000 chars
     Buffer flushed at char 2000 (possible tag leak)
   ```

4. **Before/After split view**: Side-by-side comparison with strikethrough on hidden content.

5. **SSE event timeline**: Shows when each `chunk` event was emitted to the client:
   ```
   t=0ms      user_message sent
   t=380ms    (thinking extracted, no chunks sent yet)
   t=500ms    chunk: "That sounds "
   t=520ms    chunk: "really tough. "
   t=540ms    chunk: "How long has "
   t=560ms    chunk: "this been going on?"
   t=580ms    text_complete
   t=600ms    metadata { offerFeelHeardCheck: false }
   t=620ms    complete { messageId: "msg_abc123" }
   ```

---

## 8. Dispatch Flow

### Concept: Decision Tree with Response Routing

Shows when and why dispatches are triggered, and the alternate response path they take.

### Layout

```
+------------------------------------------------------------------+
| DISPATCH FLOW                                                    |
|------------------------------------------------------------------|
|                                                                  |
| TRIGGER DETECTION                                                |
| +--------------------------------------------------------------+|
| | User message: "Why am I even doing this? Shouldn't he be     ||
| |               talking to the AI too?"                         ||
| |                                                               ||
| | AI's <thinking> analysis:                                     ||
| |   "User is questioning the purpose of this step.             ||
| |    Direct process question about empathy purpose."           ||
| |                                                               ||
| | AI's <dispatch> tag: EXPLAIN_EMPATHY_PURPOSE                 ||
| +--------------------------------------------------------------+|
|                                                                  |
| DISPATCH ROUTING                                                 |
| +--------------------------------------------------------------+|
| |                                                               ||
| |   EXPLAIN_EMPATHY_PURPOSE                                    ||
| |   ├── Handler: handleEmpathyPurposeExplanation()             ||
| |   ├── Prompt: buildEmpathyPurposePrompt(context)             ||
| |   ├── Model: Sonnet (512 max tokens)                         ||
| |   ├── Context: 12 recent messages + user/partner names       ||
| |   └── Duration: 1,240ms                                      ||
| |                                                               ||
| +--------------------------------------------------------------+|
|                                                                  |
| RESPONSE FLOW                                                    |
| +--------------------------------------------------------------+|
| |                                                               ||
| |  ┌─────────────────┐                                         ||
| |  │ AI Acknowledgment│  (IGNORED - dispatch replaces)          ||
| |  │ "I understand    │                                         ||
| |  │  your question..." │                                       ||
| |  └────────┬────────┘                                          ||
| |           ↓                                                   ||
| |  ┌─────────────────┐                                         ||
| |  │ Dispatch Response│  (SENT TO CLIENT)                       ||
| |  │ "Great question! │                                         ||
| |  │  Your partner is │                                         ||
| |  │  also doing this │                                         ||
| |  │  right now..."   │                                         ||
| |  └─────────────────┘                                          ||
| |                                                               ||
| +--------------------------------------------------------------+|
|                                                                  |
| AVAILABLE DISPATCHES                                             |
| ┌──────────────────────┬────────────────────┬────────────┐      |
| │ EXPLAIN_PROCESS      │ All stages         │ Sonnet     │      |
| │ EXPLAIN_EMPATHY_     │ Stage 2 only       │ Sonnet     │      |
| │   PURPOSE            │                    │            │      |
| │ HANDLE_MEMORY_       │ All stages         │ Static     │      |
| │   REQUEST            │                    │ (no LLM)   │      |
| └──────────────────────┴────────────────────┴────────────┘      |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Dispatch type indicator**: Large colored badge showing which dispatch was triggered:
   - Blue: EXPLAIN_PROCESS
   - Purple: EXPLAIN_EMPATHY_PURPOSE
   - Gray: HANDLE_MEMORY_REQUEST (static, no LLM)

2. **Two-message flow**: When the AI provides both an acknowledgment AND triggers a dispatch, show both paths:
   ```
   AI Output ──┬── Initial Response (acknowledgment) ── SSE stream 1
               └── Dispatch Response (handler output) ── SSE stream 2
   ```

3. **Background task skipping**: Show that dispatch messages skip background tasks (summary, classifier):
   ```
   ⚡ Background tasks SKIPPED (dispatch message)
   - No summary update
   - No partner-session classifier
   - No embedding generation
   ```

4. **Dispatch history**: Table showing all dispatches in this session:
   ```
   Turn 5: EXPLAIN_EMPATHY_PURPOSE (Stage 2, 1,240ms)
   Turn 8: EXPLAIN_PROCESS (Stage 2, 890ms)
   ```

---

## 9. Pipeline Timing Waterfall

### Concept: Chrome DevTools Network-Style Waterfall

Shows each pipeline step's duration as horizontal bars on a shared timeline, clearly showing parallelism, sequential dependencies, and bottlenecks.

### Layout

```
+------------------------------------------------------------------+
| PIPELINE TIMING WATERFALL                         Turn 7         |
|------------------------------------------------------------------|
|                                                                  |
| Total: 2,847ms                                                   |
|                                                                  |
|  Stage                    0    500   1000  1500  2000  2500  ms  |
|  ─────────────────────── ┼─────┼─────┼─────┼─────┼─────┼─────   |
|  Memory Intent           ██                                      |
|                          12ms                                    |
|                                                                  |
|  ── parallel group ──────────────────────                        |
|  User Prefs              ▓▓▓▓                                    |
|                          45ms                                    |
|  Context Assembly        ▓▓▓▓▓▓▓▓▓▓▓▓                          |
|                          180ms                                   |
|  Context Retrieval       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                    |
|                          320ms                                   |
|  Shared Content          ▓▓▓▓▓▓                                 |
|                          85ms                                    |
|  Milestone Context       ▓▓▓▓▓                                  |
|                          68ms                                    |
|  ── end parallel ────── (wall time: 320ms)                       |
|                                                                  |
|  Surfacing Policy        █                                       |
|                          2ms                                     |
|  Retrieval Planning      ████████████                            |
|    (Haiku call)          180ms                                   |
|  Prompt Building         █                                       |
|                          5ms                                     |
|  Token Budget            █                                       |
|                          3ms                                     |
|  Model Routing           █                                       |
|                          1ms                                     |
|                                                                  |
|  LLM Response            ████████████████████████████████████    |
|    (Sonnet streaming)    2,100ms                                 |
|    ├─ TTFB: 890ms                                                |
|    └─ Streaming: 1,210ms                                         |
|                                                                  |
|  Tag Trap Processing     ████████████████████████████████████    |
|    (overlaps streaming)  1,210ms                                 |
|                                                                  |
|  Response Parsing        █                                       |
|                          8ms                                     |
|                                                                  |
|  DB Save                 ██████                                  |
|                          95ms                                    |
|                                                                  |
|  ── background tasks ──── (non-blocking)                         |
|  Summary Update              ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                   |
|                              450ms                               |
|  Partner Classifier              ▒▒▒▒▒▒▒▒▒▒▒▒▒▒                |
|                                  380ms                           |
|  Embedding                           ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒         |
|                                      520ms                       |
|                                                                  |
|  ─────────────────────── ┼─────┼─────┼─────┼─────┼─────┼─────   |
|                          0    500   1000  1500  2000  2500  ms   |
|                                                                  |
| BOTTLENECK: LLM Response (73.8% of total)                       |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Bar colors**:
   - Blue: Decision/computation (Memory Intent, Surfacing, Routing, Parsing)
   - Green: Data fetching (Context Assembly, Retrieval, DB queries)
   - Orange: LLM calls (Haiku for planning, Sonnet for response)
   - Purple: Streaming/processing (Tag Trap, SSE)
   - Gray: Background tasks (non-blocking, fire-and-forget)

2. **Parallel grouping**: Bracket showing parallel execution group with wall-clock time annotation.

3. **TTFB marker**: Vertical dashed line on the LLM bar showing Time to First Byte (when first token arrived from Sonnet).

4. **Bottleneck highlight**: The longest blocking stage gets a red border and "BOTTLENECK" label.

5. **Latency annotations**:
   - Green text: Under threshold (e.g., <100ms for computation steps)
   - Yellow text: Approaching threshold
   - Red text: Over threshold (e.g., >3s total → logged as slow response)

6. **Turn comparison**: Overlay previous turn's waterfall (semi-transparent) to show changes.

### Cross-Turn Comparison

A multi-turn view showing waterfalls stacked:

```
Turn 5:  [█][▓▓▓▓▓▓▓][████████████████████████████]  2,340ms
Turn 6:  [█][▓▓▓▓▓▓▓▓▓▓][████████████████████████████████]  2,890ms
Turn 7:  [█][▓▓▓▓▓▓▓][████████████████████████████]  2,847ms
Turn 8:  [█][▓▓▓▓][██████████████████]  1,560ms (Haiku routed)
```

---

## 10. Prompt Diff Viewer

### Concept: Git-Style Diff Between Consecutive Turns

Shows exactly what changed in the prompt between consecutive turns, highlighting both structural changes (stage transitions) and contextual changes (turn count, emotional intensity, new facts).

### Layout

```
+------------------------------------------------------------------+
| PROMPT DIFF VIEWER                                               |
|------------------------------------------------------------------|
|                                                                  |
| Comparing: Turn 6 → Turn 7                                      |
| Change summary: Dynamic block updated (static unchanged)         |
|                                                                  |
| [Unified] [Side-by-Side] [Changes Only]                         |
|                                                                  |
| STATIC BLOCK                                                     |
| ┌──────────────────────────────────────────────────────────┐     |
| │ (1,240 tokens unchanged)                          ✓ HIT │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| DYNAMIC BLOCK                                                    |
| ┌──────────────────────────────────────────────────────────┐     |
| │   RIGHT NOW: You have a solid picture now. When it      │     |
| │   feels right, reflect back what you've heard using      │     |
| │   Sarah's own words...                                   │     |
| │                                                          │     |
| │ - Emotional intensity: 5/10                              │     |
| │ + Emotional intensity: 6/10                              │     |
| │                                                          │     |
| │ - Turn: 6                                                │     |
| │ + Turn: 7                                                │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| CONTEXT INJECTION DIFF                                           |
| ┌──────────────────────────────────────────────────────────┐     |
| │ + Notable fact added:                                    │     |
| │ +   "Sarah feels dismissed when Alex checks his phone"  │     |
| │                                                          │     |
| │ + New message in history:                                │     |
| │ +   User: "Every time I try to talk, he just looks at   │     |
| │ +          his phone"                                    │     |
| │ +   AI: "That sounds really frustrating. What happens   │     |
| │ +        after that?"                                    │     |
| │                                                          │     |
| │ ~ Emotional thread trend: stable → de-escalating        │     |
| └──────────────────────────────────────────────────────────┘     |
|                                                                  |
| MAJOR TRANSITIONS                                                |
| (None for this turn)                                             |
|                                                                  |
| Stage transition diffs show as full block replacements:          |
|   Turn 9 → 10: Stage 1 → Stage 2 (full static block change)    |
+------------------------------------------------------------------+
```

### Visual Elements

1. **Diff highlighting**:
   - Green (+): Added lines/sections
   - Red (-): Removed lines/sections
   - Yellow (~): Modified values (e.g., turn count, intensity)
   - Gray: Unchanged (collapsed)

2. **Cache impact indicator**: For each change, show whether it affected caching:
   - Static block unchanged: "✓ CACHE HIT" (green)
   - Static block changed: "✗ CACHE MISS" (red, with reason: "stage transition" or "prompt edit")
   - Dynamic block always changes: No indicator needed

3. **Change categories**: Classify changes into types:
   - `TURN_COUNTER`: Turn number increment
   - `INTENSITY_CHANGE`: Emotional intensity shifted
   - `PHASE_SHIFT`: Gathering → Reflecting transition
   - `NEW_CONTEXT`: Notable facts, new messages
   - `STAGE_TRANSITION`: Full stage change (major event)
   - `GUARD_CHANGE`: Feel-heard/readyShare guard status changed

4. **Turn navigation**: Arrow buttons or dropdown to compare any two turns.

5. **Cross-turn heatmap**: Small heatmap showing how many tokens changed per turn:
   ```
   Turn: 1  2  3  4  5  6  7  8  9  10
          █  █  ░  ░  ░  ░  ░  ░  █  ░
          ↑                       ↑
        First              Stage transition
        turn               (full rebuild)
   ```

---

## Data Capture Strategy

### What Needs to Be Captured

To power all 10 visualizations, the backend needs to emit a `TurnTrace` object for each turn:

```typescript
interface TurnTrace {
  turnId: string;
  sessionId: string;
  userId: string;
  timestamp: string;
  stage: number;
  turnCount: number;

  // Pipeline stages with timing
  pipeline: {
    memoryIntent: {
      durationMs: number;
      result: MemoryIntentResult;
    };
    parallelPreprocessing: {
      wallClockMs: number;
      contextAssembly: { durationMs: number; turnCount: number; factCount: number };
      contextRetrieval: {
        durationMs: number;
        referencesDetected: number;
        searchQueries: string[];
        resultsCount: number;
        topSimilarity: number;
      };
      sharedContent: { durationMs: number; found: boolean };
      milestoneContext: { durationMs: number; found: boolean };
      userPrefs: { durationMs: number };
    };
    surfacingPolicy: {
      durationMs: number;
      shouldSurface: boolean;
      style: string;
    };
    retrievalPlanning?: {
      durationMs: number;
      triggered: boolean;
      queryCount: number;
      queries: unknown[];
      reasoning?: string;
      circuitBreakerTripped?: boolean;
    };
    promptBuilding: {
      durationMs: number;
      stageFn: string;          // e.g., "buildStage1Prompt"
      staticTokens: number;
      dynamicTokens: number;
      transitionInjected: boolean;
    };
    tokenBudget: {
      durationMs: number;
      budget: BudgetedContext;
      truncationDetails: {
        messagesExcluded: number;
        contextTruncated: boolean;
        summaryBoundary?: string;
      };
    };
    modelRouting: {
      durationMs: number;
      decision: { model: string; score: number; reasons: string[] };
    };
    llmResponse: {
      durationMs: number;
      ttfbMs: number;           // time to first byte
      streamingMs: number;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };
    tagTrap: {
      phase1: { durationMs: number; thinkingChars: number; safetyTriggered: boolean };
      phase2: { durationMs: number; draftFound: boolean; dispatchFound: boolean; bufferChars: number };
      phase3: { durationMs: number; chunksStreamed: number };
    };
    responseParsing: {
      durationMs: number;
      parsed: ParsedMicroTagResponse;
    };
    dispatch?: {
      tag: string;
      handler: string;
      durationMs: number;
      model?: string;
    };
    dbSave: { durationMs: number };
    backgroundTasks: {
      skipped: boolean;
      summaryUpdate?: { durationMs: number };
      classifier?: { durationMs: number; factsFound: number };
      embedding?: { durationMs: number };
    };
  };

  // Full prompt content (for inspector/diff)
  prompts: {
    staticBlock: string;
    dynamicBlock: string;
    staticBlockHash: string;    // for cache hit detection
  };

  // Context content (for injection viewer)
  context: {
    formattedBundle: string;
    formattedRetrieved: string;
    notableFacts: Array<{ category: string; fact: string }>;
    emotionalThread: { trend: string; current: number };
    injectedMessage: string;    // the final user message with context prefix
  };

  // Response content (for parsing/tag trap viewers)
  response: {
    rawAiOutput: string;
    cleanResponse: string;
    thinkingContent: string;
    draftContent?: string;
    dispatchTag?: string;
    flags: Record<string, boolean | number>;
  };

  // Totals
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheHitRate: number;
}
```

### Capture Implementation

1. **Instrument `orchestrateResponse()`**: Wrap each stage with timing, capture inputs/outputs.
2. **Instrument `sendMessageStream()`**: Capture tag trap phases, SSE event timing.
3. **Emit via Ably**: Publish `TurnTrace` on a `neural-monitor:${sessionId}` channel.
4. **Store in DB**: Save `TurnTrace` to a `PipelineTrace` table for historical analysis.
5. **Prompt file capture**: Already exists (`logPromptToFile`), extend to include metadata.

### Data Volume Estimate

Per turn: ~5-10KB for the trace object (excluding raw prompt text).
With prompts: ~15-25KB per turn.
At 10 turns per session: ~150-250KB per session.
Manageable for real-time streaming and short-term storage.

---

## Implementation Notes

### Component Architecture

Each visualization should be a self-contained React component that receives a `TurnTrace` object:

```typescript
// Pipeline Flow
<PipelineFlowDiagram trace={currentTrace} />

// System Prompt Inspector
<PromptInspector
  staticBlock={trace.prompts.staticBlock}
  dynamicBlock={trace.prompts.dynamicBlock}
  previousTrace={previousTrace}
/>

// Context Injection Viewer
<ContextInjectionViewer
  bundle={trace.context}
  retrieval={trace.pipeline.contextRetrieval}
  budget={trace.pipeline.tokenBudget}
/>

// History Management View
<HistoryManagementView
  budget={trace.pipeline.tokenBudget}
  conversationLength={trace.pipeline.parallelPreprocessing.contextAssembly.turnCount}
/>

// Retrieval Planning Display
<RetrievalPlanningDisplay
  planning={trace.pipeline.retrievalPlanning}
  memoryIntent={trace.pipeline.memoryIntent}
/>

// Response Parsing Viewer
<ResponseParsingViewer response={trace.response} />

// Tag Trap Visualization
<TagTrapVisualization tagTrap={trace.pipeline.tagTrap} response={trace.response} />

// Dispatch Flow
<DispatchFlowViewer dispatch={trace.pipeline.dispatch} response={trace.response} />

// Pipeline Timing Waterfall
<PipelineWaterfall pipeline={trace.pipeline} totalMs={trace.totalDurationMs} />

// Prompt Diff Viewer
<PromptDiffViewer currentTrace={currentTrace} previousTrace={previousTrace} />
```

### Tab Organization in Neural Monitor

These 10 visualizations should be organized into logical tabs within the Neural Monitor dashboard:

1. **Overview Tab**: Pipeline Flow Diagram + Timing Waterfall (the two highest-level views)
2. **Prompt Tab**: System Prompt Inspector + Prompt Diff Viewer
3. **Context Tab**: Context Injection Viewer + History Management + Retrieval Planning
4. **Response Tab**: Response Parsing + Tag Trap + Dispatch Flow

### Real-Time vs Historical

- **Real-time**: Pipeline Flow, Waterfall, Tag Trap animate as data streams in
- **Historical**: Prompt Diff, History Management work best when browsing across turns
- **Both modes**: All views support both live streaming and historical browsing via turn selector

### Performance Considerations

- Prompt text should be lazy-loaded (only fetch full prompt content when user opens Prompt tab)
- Waterfall chart should use canvas rendering for smooth animation with many turns
- Diff computation should be done worker-side to avoid blocking the UI thread
- TurnTrace objects should be cached client-side with a sliding window (last 50 turns)
