---
title: AI Prompt Templates
sidebar_position: 1
description: Prompt templates for Meet Without Fear AI interactions. Each prompt is designed for specific stage contexts and follows strict retrieval contracts.
slug: /backend/prompts
---
# AI Prompt Templates

Prompt templates for Meet Without Fear AI interactions. Each prompt is designed for specific stage contexts and follows strict retrieval contracts.

## Model Stratification

Meet Without Fear uses Claude models via AWS Bedrock:

| Task | Model | Rationale |
|------|-------|-----------|
| Retrieval planning (`planRetrieval`) | Claude Haiku 4.5 | Structured output, no creativity |
| Memory intent detection (`determineMemoryIntent`) | Claude Haiku 4.5 | Fast, deterministic gate on retrieval depth |
| Intent / reference detection (`detectIntent`, `detectReferences`) | Claude Haiku 4.5 | Quick pattern matching |
| Session distillation / takeaway extraction | Claude Haiku 4.5 | Bulk summarization |
| Language rewrite suggestions (attacking-language coach) | Claude Haiku 4.5 | Rule-assisted rewriting |
| **User-facing responses (default)** | **Claude Sonnet 4.5** | Empathy, nuance, safety |
| User-facing responses (low-signal turns) | Claude Haiku 4.5 via `routeModel()` | Cost/latency optimization |
| Reconciler / empathy-gap analysis | Claude Sonnet 4.5 | Complex reasoning over partner state |
| Need / need-mapping responses | Claude Sonnet 4.5 | Integrated into Stage 3 prompt |
| Content transformation (consent shareable text) | Claude Sonnet 4.5 | Preserving meaning, removing heat |

> Emotional intensity and current stage are **pre-calculated** in the orchestrator context (intensity from `EmotionalReading` rows, stage from session state) — they are not detected by an LLM during orchestration, even though a dedicated Haiku path exists for other classification tasks.

## Prompt Categories

### Stage-Specific

| Prompt | Stage | Purpose |
|--------|-------|---------|
| [Stage 0: Opening](./stage-0-opening.md) | 0 | Welcome and Curiosity Compact |
| [Stage 1: Witnessing](./stage-1-witnessing.md) | 1 | Deep listening and reflection |
| [Stage 2: Perspective](./stage-2-perspective.md) | 2 | Building empathy guess; also hosts the `MIRROR` mode (redirect judgment) and other internal modes as branches of `buildStage2Prompt` |
| Stage 2B: Informed Empathy | 21 (internal code) | Refining empathy after receiving partner's shared context (`buildStage2BPrompt`) |
| [Stage 3: Need Mapping](./stage-3-needs.md) | 3 | Validating needs, extracting universal needs from venting, and surfacing common ground (need extraction lives inside `buildStage3Prompt`) |
| [Stage 4: Strategic Repair](./stage-4-repair.md) | 4 | Collaborative strategy creation |

### Cross-Stage

| Prompt | Stages | Purpose |
|--------|--------|---------|
| [Emotional Support](./emotional-support.md) | All | Responding to high intensity |

> **Mirror Intervention** is **not** a standalone prompt — it's the `MIRROR` mode inside `buildStage2Prompt`, selected when a user slips into blame. The linked `mirror-intervention.md` page describes the behavior but the code lives in `stage-prompts.ts`.

### Utility

| Prompt | Purpose |
|--------|---------|
| [Content Transformation](./content-transformation.md) | Raw to shareable content (used by consent flow) |

> **Need Extraction** isn't a separate utility prompt. The Stage 3 prompt (`buildStage3Prompt`) directly instructs the AI to "crystallize the universal human needs underneath their positions"; there's no standalone `need-extraction` call in the orchestrator.

## Prompt Structure

Each prompt file uses this format:

```markdown
---
model: sonnet | haiku
temperature: 0.0-1.0
max_tokens: number
---

## System Prompt

[The system prompt content]

## User Prompt Template

[Template with {{variables}}]

## Expected Output

[Description or JSON schema]

## Examples

[Few-shot examples if needed]
```

## Retrieval Context

Prompts receive pre-assembled context based on [Retrieval Contracts](../state-machine/retrieval-contracts.md). The **user-facing model (Sonnet)** does not decide what to retrieve — it only sees the pre-built `OrchestratorContext`. An **internal Haiku call** (`determineMemoryIntent` + `planRetrieval`) decides how much to retrieve and generates the query plan before the Sonnet call runs; that plan is not user-facing.

The user-facing model:
- Never issues retrieval queries directly
- Receives only stage-appropriate data
- Cannot access partner UserVessel content
- Sees AI Synthesis for internal planning only (never in generation context)

## Semantic tags (output format)

All user-facing stage responses are expected to follow the micro-tag format enforced by `buildResponseProtocol`:

- `<thinking>` — private AI reasoning, may include metadata markers like `FeelHeardCheck: ...` or `ReadyShare: ...`.
- `<draft>` — the user-facing reply body.
- `<dispatch>` — optional structured commands for the orchestrator (e.g. mode switches).

The orchestrator parses these tags to (a) extract the visible reply, (b) detect gate-satisfaction signals inside `<thinking>`, and (c) act on any `<dispatch>` payload. Prompts that don't emit the tags are treated as plain text.

## Safety Guidelines

All user-facing prompts must:

1. Never assign blame or take sides
2. Never diagnose mental health conditions
3. Always validate emotions without endorsing harmful actions
4. Redirect to professional help if safety concerns detected
5. Maintain the Process Guardian role (facilitate, don't advise)

---

## Conversational Continuity ("Ghost in the Machine" Prevention)

Because the Large Model receives only a pre-assembled context bundle (not full conversation history), there is a risk of losing conversational thread and tone consistency. This is addressed through:

### 1. Turn Buffer in Context Bundle

Each turn includes a **conversation context** field with recent messages:

```typescript
interface ContextBundle {
  // ... other fields
  conversation_context: {
    recent_turns: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
    turn_count: number;
    session_duration_minutes: number;
  };
}
```

**Buffer Size by Stage:**

| Stage | Recent Turns Included | Rationale |
|-------|----------------------|-----------|
| Stage 1 | Last 10 turns | Deep witnessing needs thread memory |
| Stage 2 | Last 8 turns | Empathy building is more structured |
| Stage 3 | Last 8 turns | Need confirmation is procedural |
| Stage 4 | Last 10 turns | Negotiation requires full context |

### 2. Emotional Thread Tracking

The context bundle includes emotional trajectory:

```typescript
emotional_thread: {
  initial_intensity: number;      // Start of session
  current_intensity: number;      // Latest reading
  trend: 'escalating' | 'stable' | 'de-escalating';
  notable_shifts: Array<{
    turn: number;
    from: number;
    to: number;
    trigger_summary: string;      // What caused the shift
  }>;
}
```

This allows the AI to maintain emotional attunement even without full history.

### 3. Personality Anchor in System Prompt

Every system prompt includes a **personality anchor** that reinforces consistent tone:

```
PERSONALITY ANCHOR:
- Warm but not saccharine
- Direct but not blunt
- Curious but not intrusive
- Patient with repetition (users often need to say things multiple times)
- Never rushed, never impatient
- Use the users name occasionally, but not in every response
- Match the users energy level (calm when they are calm, present when they are activated)
```

### 4. Continuity Signals in Responses

Prompts instruct the AI to include natural continuity markers:

```
CONTINUITY TECHNIQUES:
- Reference what the user just said: "You mentioned feeling overlooked..."
- Acknowledge time passing: "Weve been talking for a while now..."
- Note progress: "Earlier you seemed more guarded about this..."
- Use consistent metaphors once introduced
```

### 5. Session Summary Injection

When a session summary exists in the context bundle (`contextBundle.sessionSummary.currentFocus` is non-empty), the orchestrator injects it into the prompt. There is no hard 30-minute timer — the summary is generated by a separate summarization pass and the orchestrator just includes whatever it finds.

Summary shape:

```typescript
session_summary?: {
  key_themes: string[];           // Max 3
  emotional_journey: string;      // One sentence
  current_focus: string;          // What we are working on now
  user_stated_goals: string[];    // What user said they want from this
}
```

### 6. Avoiding Disconnected Form Feeling

The AI is explicitly instructed to avoid patterns that feel mechanical:

```
AVOID THESE PATTERNS (they feel disconnected):
- Starting every response with "I hear you..."
- Generic validation like "That sounds hard"
- Repeating the users words exactly (paraphrase instead)
- Asking the same question twice in a session
- Forgetting something the user explicitly stated earlier (check conversation_context)
```

### Monitoring Continuity

Log when users express frustration with AI memory:

```typescript
// Detect continuity failure signals
const CONTINUITY_FAILURE_PATTERNS = [
  /i (just|already) (said|told you)/i,
  /weren.?t you listening/i,
  /we talked about this/i,
  /you forgot/i,
];

if (CONTINUITY_FAILURE_PATTERNS.some(p => p.test(userMessage))) {
  metrics.increment('ai.continuity_failure_signal');
  // Trigger review of context bundle size/content
}
```

---

[Back to Backend](../index.md)
