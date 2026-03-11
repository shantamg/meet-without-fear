# Meet Without Fear Prompting & Orchestration Audit

## 1. Architecture Map (LLM entrypoints + orchestration)

**Core LLM access**
- Bedrock client + model helpers (Haiku/Sonnet, streaming, embeddings): `backend/src/lib/bedrock.ts`.【F:backend/src/lib/bedrock.ts†L1-L780】
- LLM activity logging: `backend/src/services/brain-service.ts`.【F:backend/src/services/brain-service.ts†L1-L140】

**Primary conversation orchestration**
- Orchestrator pipeline (intent → context → retrieval plan → response): `backend/src/services/ai-orchestrator.ts`.【F:backend/src/services/ai-orchestrator.ts†L1-L520】
- Message streaming path (direct Sonnet streaming + tag parsing): `backend/src/controllers/messages.ts`.【F:backend/src/controllers/messages.ts†L1080-L1505】
- Chat-router orchestration wrapper (used by other routes): `backend/src/services/chat-router/session-processor.ts`.【F:backend/src/services/chat-router/session-processor.ts†L120-L370】

**Prompt assembly + message formatting**
- Stage/system prompts (new compact facilitator prompt + tags): `backend/src/services/stage-prompts.ts`.【F:backend/src/services/stage-prompts.ts†L1-L1120】
- Legacy prompt archive (prior verbose scripts, preserved for comparison): `backend/src/services/stage-prompts-legacy.ts`.【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
- Micro-tag parser (+ JSON fallback): `backend/src/utils/micro-tag-parser.ts`.【F:backend/src/utils/micro-tag-parser.ts†L1-L86】

**Context assembly + summarization**
- Context bundle assembly: `backend/src/services/context-assembler.ts`.【F:backend/src/services/context-assembler.ts†L1-L860】
- Rolling summary generation: `backend/src/services/conversation-summarizer.ts`.【F:backend/src/services/conversation-summarizer.ts†L1-L420】
- Retrieval + formatting (RAG): `backend/src/services/context-retriever.ts`.【F:backend/src/services/context-retriever.ts†L1-L730】

**Consent gating / mediator share logic**
- Empathy share + consent flow: `backend/src/controllers/stage2.ts`.【F:backend/src/controllers/stage2.ts†L396-L760】
- Share offers + share-draft generation: `backend/src/controllers/reconciler.ts`.【F:backend/src/controllers/reconciler.ts†L520-L710】
- Consent record creation + transformed content: `backend/src/controllers/consent.ts`.【F:backend/src/controllers/consent.ts†L60-L170】

**Model routing + safety rewrite helper**
- Routing policy module: `backend/src/services/model-router.ts`.【F:backend/src/services/model-router.ts†L1-L78】
- Attacking-language rewrite helper (Haiku): `backend/src/services/attacking-language.ts`.【F:backend/src/services/attacking-language.ts†L1-L46】

**Telemetry + evaluation harness**
- Turn-level telemetry aggregation: `backend/src/services/llm-telemetry.ts`.【F:backend/src/services/llm-telemetry.ts†L1-L88】
- Fixture-based replay harness: `backend/src/scripts/llm-replay-harness.ts`.【F:backend/src/scripts/llm-replay-harness.ts†L1-L169】
- Fixture scenarios: `backend/src/scripts/fixtures/llm-fixtures.json`.【F:backend/src/scripts/fixtures/llm-fixtures.json†L1-L156】

---

## 2. Prompt Inventory (key prompts/templates)

> **Token lengths are approximate** (4 chars ≈ 1 token). Use `estimateTokens` or the replay harness for exact local numbers.

| Prompt / Template | File | Purpose | Approx. length | When called | Model | Output type |
|---|---|---|---|---|---|---|
| Facilitator system prompt (Stage 0–4) | `backend/src/services/stage-prompts.ts` | Core mediation behavior + tags | ~250–450 tokens | Every conversation turn | Sonnet or Haiku (routing) | Micro-tags + free text |
| Legacy scripted prompts (archived) | `backend/src/services/stage-prompts-legacy.ts` | Prior verbose stage scripts | ~1200–2500 tokens | (Legacy baseline only) | Sonnet | Micro-tags + verbose instructions |
| Conversation summary prompt | `backend/src/services/conversation-summarizer.ts` | Rolling summary JSON | ~250–400 tokens | When summary thresholds hit | Haiku | JSON |
| Retrieval reference detection | `backend/src/services/context-retriever.ts` | Decide if retrieval needed | ~300–450 tokens | When retrieval is enabled | Haiku | JSON |
| Reconciler analysis | `backend/src/services/reconciler.ts` | Detect empathy gaps | ~900–1400 tokens | When both parties share | Sonnet | JSON |
| Share draft generation | `backend/src/controllers/reconciler.ts` | Draft user-shareable text | ~300–450 tokens | When user taps “help me share” | Haiku/Sonnet (routing) | Plain text |
| Feedback refinement | `backend/src/controllers/stage2.ts` | Rewrite feedback in non-blaming tone | ~250–350 tokens | On feedback refine | Haiku/Sonnet (routing) | JSON |

---

## 3. Findings

### 3.1 Where capability loss was introduced

**Primary mechanisms (repo-specific)**
1. **Over-scripted prompts with strict sequencing and long checklists** — the legacy stage prompts front-loaded a large number of rules, modes, and embedded scripts, which is known to constrain response diversity and keep the model in “instruction-following” mode rather than empathetic dialog. This is preserved in the archived legacy prompt file for reference.【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
2. **Context injection repeated per turn with heavy boilerplate** — the prior format injected large context blocks and multi-section scaffolding on every turn, which inflated tokens and diluted salient signals. The old formatting logic remains in the legacy context formatter for comparison.【F:backend/src/services/context-assembler.ts†L651-L758】
3. **Rigid micro-tag script pressure** — earlier prompts required long “thinking blocks” with multi-field schemas and multiple ordered steps, increasing latency and making the model feel scripted. This is shown in the archived response protocol logic.【F:backend/src/services/stage-prompts-legacy.ts†L20-L140】

### 3.2 Token cost drivers (before changes)

- **Prompt repetition**: large, stage-specific scripts were repeated every turn in the system prompt (legacy stage prompt file).【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
- **Context bloat**: the previous context formatter injected detailed sections (global facts, session summaries, inner thoughts, notable facts) and was appended to every user turn, even when summaries already existed.【F:backend/src/services/context-assembler.ts†L651-L758】
- **RAG payload size**: retrieved context formatting included full message excerpts with minimal truncation (now trimmed).【F:backend/src/services/context-retriever.ts†L680-L728】
- **Multiple calls per turn**: retrieval planning and summarization could add extra calls on top of the main response, especially at full-depth intent levels and summary boundaries.【F:backend/src/services/ai-orchestrator.ts†L240-L320】【F:backend/src/services/conversation-summarizer.ts†L180-L320】

### 3.3 Flow drivers that made the experience feel “clunky”

- **Stage scaffolding overloaded the dialogue**: the model was forced through scripted mode-switching and explicit protocol narration, leading to a “process over person” feel. (See legacy prompt file).【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
- **Frequent framing resets**: the base prompt reintroduced multi-section process guidance each turn, reducing conversational continuity. (Legacy stage prompts + legacy context formatting).【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】【F:backend/src/services/context-assembler.ts†L651-L758】

### 3.4 Repo-specific vs. general to facilitation tools

**Repo-specific**
- Heavy, multi-stage scripts were embedded in system prompts rather than being mediated by the UI or tool state, amplifying instruction load per turn. (Legacy stage prompts).【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
- Context was injected as a literal bracketed block attached to the user message, rather than as a compact summary + recent window. (Legacy formatter + message assembly).【F:backend/src/services/context-assembler.ts†L651-L758】【F:backend/src/services/ai-orchestrator.ts†L510-L560】

**General to multi-party facilitation**
- Consent gates and share flows introduce extra sub-steps (drafts, approvals, partner sync), which inherently add latency and coordination complexity in any mediation product. (Stage 2 consent + reconciler flows).【F:backend/src/controllers/stage2.ts†L396-L760】【F:backend/src/controllers/reconciler.ts†L520-L710】

---

## 4. Changes Implemented (PR-ready)

### 4.1 Prompt refactor (compact Facilitator prompt)
- Replaced long, prescriptive scripts with a compact “Facilitator” system prompt that prioritizes outcomes and essential constraints, while keeping micro-tags for UI compatibility.【F:backend/src/services/stage-prompts.ts†L1-L740】
- Preserved the legacy prompts as an archive for baseline comparisons and the replay harness.【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】
- Added JSON fallback parsing for compatibility when a caller expects structured output, without forcing JSON in prompts.【F:backend/src/utils/micro-tag-parser.ts†L1-L86】

### 4.2 Token strategy: three-layer context + aggressive trimming
- **Pinned constitution** lives in the system prompt and is short by design (privacy, consent, style, dual-track rewrite).【F:backend/src/services/stage-prompts.ts†L86-L140】
- **Rolling summary** includes agreed facts, needs, open questions, and agreements; summaries now trigger by message count *or token threshold*.【F:backend/src/services/conversation-summarizer.ts†L40-L320】
- **Recent window** trimmed to last 8–12 turns depending on whether a summary exists, preventing full transcript resend once summaries are available.【F:backend/src/utils/token-budget.ts†L32-L150】【F:backend/src/services/ai-orchestrator.ts†L320-L430】
- **Compact context formatting** reduces payload size, limits notable facts, and treats shared/consent state as a small block rather than a repeated system prompt chunk.【F:backend/src/services/context-assembler.ts†L760-L860】

### 4.3 Model routing (Haiku vs Sonnet)
- Introduced a routing policy module that scores intensity, ambiguity, request type, and length to decide Haiku vs Sonnet.【F:backend/src/services/model-router.ts†L1-L78】
- Applied routing for the main orchestrated response (drafting vs mediation), feedback refinement, and share-draft generation.【F:backend/src/services/ai-orchestrator.ts†L360-L500】【F:backend/src/controllers/stage2.ts†L1265-L1335】【F:backend/src/controllers/reconciler.ts†L600-L700】

### 4.4 Attacking-language handling (dual-track)
- Added a Haiku rewrite helper that returns 1–3 “sendable” variants plus a short note if a message is likely to land as attacking.【F:backend/src/services/attacking-language.ts†L1-L46】
- Wired into share-draft generation to offer optional rewrites without overwriting the user’s original voice.【F:backend/src/controllers/reconciler.ts†L640-L710】

### 4.5 Telemetry & measurement
- Added per-turn metrics aggregation for tokens, calls, model mix, and context sizes; logged at turn completion.【F:backend/src/services/llm-telemetry.ts†L1-L88】【F:backend/src/lib/bedrock.ts†L420-L520】
- Replay harness + fixtures to compare legacy vs optimized prompt stacks (estimated token counts, calls/turn).【F:backend/src/scripts/llm-replay-harness.ts†L1-L169】【F:backend/src/scripts/fixtures/llm-fixtures.json†L1-L156】

---

## 5. Cost/Quality Impact (Baseline vs. After)

**Harness results (estimated)**
- See `backend/src/scripts/llm-replay-harness.ts` for repeatable comparisons using fixtures in `backend/src/scripts/fixtures/llm-fixtures.json`.【F:backend/src/scripts/llm-replay-harness.ts†L1-L169】【F:backend/src/scripts/fixtures/llm-fixtures.json†L1-L156】

**Summary (based on harness output)**

| Fixture | Legacy avg tokens/turn | Optimized avg tokens/turn | Reduction | Calls/turn (legacy → opt) |
|---|---:|---:|---:|---:|
| accusation-heavy-start | 1191 | 563 | 53% | 1 → 1 |
| misunderstanding-repair | 1212 | 604 | 50% | 1 → 1 |
| consent-mediated-sharing | 1209 | 604 | 50% | 1 → 1 |
| win-win-negotiation | 1182 | 471 | 60% | 2 → 2 |

> **Note:** The harness provides deterministic comparisons by estimating prompt + message tokens. It does not require live model calls.

---

## 6. “Why it felt dumber” (root causes + fixes)

- **Rigid scripts suppressed conversational flexibility**: lengthy, step-by-step instructions forced the model to sound scripted and repetitive. Replaced with compact facilitator guidance and one-question cadence.【F:backend/src/services/stage-prompts-legacy.ts†L1-L1120】【F:backend/src/services/stage-prompts.ts†L1-L740】
- **Context stuffing diluted signal**: repeated boilerplate and full context dumps buried the most relevant details. The new formatter prioritizes summary + recent window + lightweight facts.【F:backend/src/services/context-assembler.ts†L651-L860】

---

## 7. Attacking-language filtering (recommended behavior)

**Implementation summary**
- Maintain original user text privately.
- Generate optional sendable rewrites only when sharing is imminent (or user asks), and preserve intent without erasing accountability.【F:backend/src/services/attacking-language.ts†L1-L46】【F:backend/src/controllers/reconciler.ts†L640-L710】
- Mediator voice should reflect impact and offer a choice, not silently sanitize (captured in the pinned constitution).【F:backend/src/services/stage-prompts.ts†L86-L140】

---

## 8. UI Output Structure Compatibility

- The system now defaults to micro-tags with a **JSON fallback** parser. If a client still emits JSON, the response is parsed safely without breaking the user-facing output.【F:backend/src/utils/micro-tag-parser.ts†L1-L86】

---

## 9. How to run the replay harness

```bash
cd backend
npx tsx src/scripts/llm-replay-harness.ts
```

This prints token and call estimates per fixture for legacy vs optimized prompts.【F:backend/src/scripts/llm-replay-harness.ts†L1-L169】
