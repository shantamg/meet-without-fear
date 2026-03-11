# Meet Without Fear - AI Prompting System Audit

## Executive Summary

The Meet Without Fear AI system uses a sophisticated multi-model pipeline to deliver empathetic, therapeutically-informed responses while maintaining strong privacy boundaries and context awareness. The system processes user messages through several layers before generating responses.

---

## Architecture Overview

### Model Stratification

The system uses two Claude models with distinct purposes:

| Model | Use Case | Latency Priority |
|-------|----------|------------------|
| **Claude Haiku** | Fast mechanics: reference detection, retrieval planning, classification, summarization | Sub-100ms critical |
| **Claude Sonnet** | Empathetic user-facing responses, reconciler analysis, therapeutic dialogue | Quality over speed |

---

## Conversation Context Pipeline

### 1. Memory Intent Layer (`memory-intent.ts`)

**Purpose:** Before any retrieval, the system determines what kind of "remembering" is appropriate.

**Memory Intents:**
- `emotional_validation` - Stay present, minimal recall
- `stage_enforcement` - No recall, enforce stage rules
- `recall_commitment` - Full retrieval (e.g., "we agreed...")
- `offer_continuity` - Light summary of last session
- `avoid_recall` - Safety mode, no retrieval

**Stage-Aware Configuration:**

| Stage | Threshold | Max Cross-Session | Allow Cross-Session | Surface Style |
|-------|-----------|-------------------|---------------------|---------------|
| 1 (Witness) | 0.65 | 0-3 (turn-based) | false | silent |
| 2 (Perspective) | 0.55 | 5 | true | tentative |
| 3 (Needs) | 0.50 | 10 | true | explicit |
| 4 (Repair) | 0.50 | 10 | true | explicit |

### 2. Context Assembly (`context-assembler.ts`)

**What Gets Assembled (in parallel):**
- Recent conversation turns (stage-aware buffer size)
- Emotional thread tracking (intensity, trend, notable shifts)
- Prior session themes (only for `light` or `full` depth)
- Session summary (for long sessions)
- Inner Thoughts context (if linked)
- User memories ("Things to Always Remember")

**Turn Buffer Sizes:**
- Minimal depth: 4 turns
- Light depth: 8 turns
- Full depth: 12 turns

### 3. Context Retrieval (`context-retriever.ts`)

**Retrieval Flow:**
1. **Reference Detection** (Haiku) - Detect implicit references like "But I thought...", "I assumed..."
2. **Embedding Generation** (Titan) - Generate query embedding for semantic search
3. **Vector Search** (pgvector) - Search across sessions, within session, and Inner Thoughts
4. **Result Formatting** - Include time context and recency guidance

**Data Isolation Rules:**
- Only returns user's own messages
- Only AI responses directed TO this user
- Partner's messages NEVER leak through retrieval

**Similarity Thresholds:** 0.45-0.70 based on stage configuration

### 4. Token Budget Management (`token-budget.ts`)

**Model Limits:**
- Max input tokens: 150,000 (of 200k available)
- System prompt budget: 4,000 tokens
- Output reservation: 4,000 tokens
- Context budget: 100,000 tokens

**Context Limits:**
- Max conversation messages: 50
- Max message length: 2,000 chars
- Max cross-session messages: 10
- Max current session retrieved: 5
- Max pre-session messages: 10

---

## Embedding System

### Where Embeddings Are Generated

**Model:** Amazon Titan Text Embeddings v2 (1024 dimensions)

**What Gets Embedded:**
1. **Messages** - Every user and AI message in sessions
2. **Inner Thoughts Messages** - Private reflection content
3. **Session Vessels** - Session summary for semantic search
4. **Pre-session Messages** - Messages before session creation

### Embedding Storage

All embeddings stored in PostgreSQL using pgvector extension:
- `Message.embedding` - Partner session messages
- `InnerWorkMessage.embedding` - Inner Thoughts messages
- `UserVessel.embedding` - Session context
- `PreSessionMessage.embedding` - Pre-session content

### Semantic Search

Vector similarity search using cosine distance (`<=>` operator):
```sql
SELECT ... FROM "Message" m
WHERE m.embedding <=> ${queryVector}::vector < threshold
ORDER BY distance ASC
```

---

## Summarization System

### When Summarization Triggers (`conversation-summarizer.ts`)

**Configuration:**
- Min messages for summary: 30
- Recent messages to keep (full): 15
- Target summary tokens: 500
- Re-summarize interval: 20 new messages

### Summary Structure

```json
{
  "summary": "2-3 paragraph narrative",
  "keyThemes": ["theme1", "theme2"],
  "emotionalJourney": "One sentence on emotional evolution",
  "unresolvedTopics": ["topic1", "topic2"]
}
```

### Storage

Summaries stored in `UserVessel.conversationSummary` as JSON.

---

## Stage Prompts (`stage-prompts.ts` - 2,211 lines)

### Base Guidance (All Stages)

Every prompt includes:
1. **Communication Principles** - Reading the room, meeting people where they are
2. **Simple Language Prompt** - Plain conversational English, no jargon
3. **Privacy Guidance** - NEVER fabricate cross-user information
4. **Memory Guidance** - How to honor user memories
5. **Invalid Memory Guidance** - Handle rejected memory requests therapeutically
6. **Process Overview** - For explaining how it works to users

### Stage-Specific Prompts

| Stage | Purpose | Key Features |
|-------|---------|--------------|
| 0: Onboarding | Pre-compact signing | Answer questions, don't dive deep |
| 0: Invitation | Craft partner invitation | 1-2 sentence warm message |
| 1: Witnessing | Deep listening, validation | No problem-solving, reflect back |
| 2: Perspective | Empathy building | Understanding partner's view |
| 3: Need Mapping | Crystallize needs | NO solutions yet |
| 4: Strategic Repair | Experiments, agreements | Small testable changes |

### JSON Output Structure

All stages return structured JSON:
```json
{
  "response": "User-facing message",
  "offerFeelHeardCheck": true/false,
  "offerReadyToShare": true/false,
  "invitationMessage": "...",
  "proposedEmpathyStatement": "..."
}
```

---

## Side Processes (Haiku-Powered)

### 1. Background Classifier (`background-classifier.ts`)

**Purpose:** Fire-and-forget analysis after response is sent

**What It Detects:**
- Memory intent (explicit "remember" requests only)
- Theme extraction
- Session metadata (title, mood, topics)
- Rolling summary updates

**Trigger:** Runs asynchronously after Inner Thoughts responses

### 2. Partner Session Classifier (`partner-session-classifier.ts`)

**Purpose:** Similar to background classifier but for partner sessions

**What It Detects:**
- Memory intent detection + validation
- Topic context extraction
- Whether memory is therapeutically appropriate

**Trigger:** Runs asynchronously after partner session responses

### 3. Reference Detection (in `context-retriever.ts`)

**Purpose:** Detect when user references past content

**Patterns Detected:**
- Explicit: "we agreed", "you said", "last time"
- Implicit: "But I thought...", "I assumed...", "I was under the impression..."

**Model:** Haiku with circuit breaker protection (fallback if timeout)

### 4. Retrieval Planning (`retrieval-planner.ts`)

**Purpose:** Plan structured queries for context retrieval

**Query Types:**
- Metadata queries (Stage 0+)
- User Vessel queries (Stage 1+)
- Shared Vessel queries (Stage 2+) - only consented content
- Global queries (Stage 4 only)

**Stage Contract Enforcement:**
- Stage 1: User's own data only, NO shared vessel
- Stage 2: User data + consented shared content
- Stage 3-4: Full access including experiments

### 5. Reconciler Analysis (`reconciler.ts`)

**Purpose:** Compare empathy guess vs actual feelings

**Flow:**
1. User A submits empathy statement about User B
2. User B completes Stage 1 (feels heard)
3. Reconciler compares A's guess vs B's actual content
4. Generate share suggestion if gaps exist
5. B can accept/refine/decline sharing
6. A gets context to refine their empathy

---

## Unified Chat Router (`chat-router/`)

The unified chat router handles all chat entry points with intent-based routing.

### Intent Detection (`intent-detector.ts`)

**Purpose:** Haiku-powered detection of user intent from natural language

**Intents Detected:**
- `CREATE_SESSION` - User wants to start a new partner session
- `CONTINUE_CONVERSATION` - Continue existing session
- `ASK_QUESTION` - General question about the app
- `START_INNER_THOUGHTS` - Begin solo reflection
- `UNKNOWN` - Fallback for unclear intent

**Model:** Haiku (fast, sub-100ms)

### Response Generator (`response-generator.ts`)

**Purpose:** Generate conversational responses with templates and AI fallback

**Response Types:**
- Template-based responses for common intents
- AI-generated responses for complex/unclear requests
- Maintains conversational tone across all interactions

### Conversation Handler (`handlers/conversation.ts`)

**Purpose:** Handle messages in active sessions

**Flow:**
1. Detect if user is in active session
2. Route to appropriate stage handler
3. Maintain session context across turns

---

## Memory Services

### Memory Detection (`memory-detector.ts`)

**Purpose:** Detect when users want to save something to memory

**Used In:** Inner Thoughts (solo reflection) sessions

**Detection Types:**
- Explicit: "Remember that...", "Don't forget..."
- Implicit: Important relationship insights worth preserving

**Model:** Haiku

### Memory Validation (`memory-validator.ts`)

**Purpose:** Validate memory content against therapeutic guidelines

**Validation Rules:**
- No harmful content
- Appropriate for long-term storage
- Therapeutically beneficial

### Memory Formatting (`memory-formatter.ts`)

**Purpose:** AI-assisted memory formatting and categorization

**Features:**
- Categorizes memories by type
- Formats for clarity and consistency
- Suggests improvements

**Model:** Haiku

### Global Memory (`global-memory.ts`)

**Purpose:** Consolidate session facts into global user profile

**Status:** ⚠️ PARTIALLY DISABLED

- Consolidation runs after Stage 1 completion
- Context injection disabled pending consent UI implementation
- Facts stored but not surfaced to AI responses

---

## Pre-Session Services

### Witnessing Service (`witnessing.ts`)

**Purpose:** Stage 1-style witnessing for pre-session conversations

**Use Case:** When user vents before creating a formal session

**Features:**
- Deep listening responses
- No problem-solving
- Reflection and validation
- Smooth transition to session creation

---

## Cross-Feature Intelligence

### People Extractor (`people-extractor.ts`)

**Purpose:** Extract and track people mentions from content

**Features:**
- Identifies people mentioned in conversations
- Tracks relationships across sessions
- Enables cross-feature context (e.g., "your partner Alex")

---

## Prompt File Locations

Key prompt files that construct AI responses:

```
backend/src/services/
├── stage-prompts.ts              # Main stage prompts (2,211 lines)
├── needs-prompts.ts              # Needs assessment prompts
├── ai-orchestrator.ts            # Response orchestration
├── context-assembler.ts          # Context bundle construction
├── context-retriever.ts          # Retrieval with reference detection
├── memory-intent.ts              # Memory intent determination
├── retrieval-planner.ts          # Retrieval query planning
├── reconciler.ts                 # Empathy reconciliation prompts
├── conversation-summarizer.ts    # Summarization prompts
├── background-classifier.ts      # Background classification prompts
├── partner-session-classifier.ts # Partner session classification
├── surfacing-policy.ts           # Pattern surfacing decisions
│
├── chat-router/                  # Unified chat entry point
│   ├── index.ts                  # Main router orchestration
│   ├── intent-detector.ts        # Haiku-powered intent detection
│   ├── response-generator.ts     # Conversational response generation
│   └── handlers/
│       └── conversation.ts       # Active session message handling
│
├── memory-detector.ts            # Inner Thoughts memory detection
├── memory-validator.ts           # Memory content validation
├── memory-formatter.ts           # AI-assisted memory formatting
├── global-memory.ts              # Global fact consolidation (partial)
│
├── witnessing.ts                 # Pre-session witnessing service
├── people-extractor.ts           # Cross-feature people tracking
└── embedding.ts                  # Embedding generation (Titan)

backend/src/lib/
└── bedrock.ts                    # AWS Bedrock client + prompt logging
```

### Unused Files (Not Currently Integrated)

- **`cross-feature-context.ts`** - Cross-feature intelligence service that aggregates data from Needs, Gratitude, Meditation, and Conflict features. Detects contradictions (e.g., high need score but negative behavior patterns), correlations (e.g., meditation frequency vs conflict occurrence), and gaps (e.g., partner in conflict but no gratitude expressed). Provides `formatCrossFeatureContextForPrompt()` for AI prompt injection. **Currently not imported or called anywhere** - built for future integration.

---

## Data Flow Summary

```
User Message
    │
    ▼
┌─────────────────┐
│ Memory Intent   │ ← Determines retrieval depth
│ Determination   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Context Assembly│────▶│ Reference Detect │ (Haiku)
│ (Parallel)      │     │ & Retrieval Plan │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│ Token Budget    │◀────│ Embedding Search │ (Titan + pgvector)
│ Management      │     │                  │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐
│ Stage Prompt    │ ← Build stage-specific prompt
│ Construction    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Sonnet Response │ ← Generate user-facing response
│ Generation      │
└────────┬────────┘
         │
         ├──────────────────────────────────┐
         ▼                                  ▼
┌─────────────────┐                ┌──────────────────┐
│ User Response   │                │ Background Tasks │ (Fire & Forget)
│ Delivered       │                │ - Summarization  │
└─────────────────┘                │ - Classification │
                                   │ - Embedding      │
                                   └──────────────────┘
```

---

## One-Liner: Concat All Prompt Files

**All prompt files (comprehensive):**
```bash
cat backend/src/services/stage-prompts.ts \
    backend/src/services/needs-prompts.ts \
    backend/src/services/ai-orchestrator.ts \
    backend/src/services/context-assembler.ts \
    backend/src/services/context-retriever.ts \
    backend/src/services/memory-intent.ts \
    backend/src/services/retrieval-planner.ts \
    backend/src/services/reconciler.ts \
    backend/src/services/conversation-summarizer.ts \
    backend/src/services/background-classifier.ts \
    backend/src/services/partner-session-classifier.ts \
    backend/src/services/surfacing-policy.ts \
    backend/src/services/chat-router/index.ts \
    backend/src/services/chat-router/intent-detector.ts \
    backend/src/services/chat-router/response-generator.ts \
    backend/src/services/chat-router/handlers/conversation.ts \
    backend/src/services/memory-detector.ts \
    backend/src/services/memory-validator.ts \
    backend/src/services/memory-formatter.ts \
    backend/src/services/global-memory.ts \
    backend/src/services/witnessing.ts \
    backend/src/services/people-extractor.ts | pbcopy
```

**Core prompt files only (smaller):**
```bash
cat backend/src/services/stage-prompts.ts \
    backend/src/services/needs-prompts.ts \
    backend/src/services/reconciler.ts \
    backend/src/services/conversation-summarizer.ts \
    backend/src/services/background-classifier.ts \
    backend/src/services/chat-router/intent-detector.ts \
    backend/src/services/memory-detector.ts | pbcopy
```

---

## Audit Metadata

**Last Updated:** 2025-01-19
**Files Verified:** All imports traced to active routes/controllers
**Dead Code Identified:** `cross-feature-context.ts` (unused)
