---
title: Prompt Caching Strategy for Meet Without Fear
sidebar_position: 4
description: "This document describes how Anthropic's prompt caching works and how we implement it. Our system prompts are split into static and dynamic blocks (the \"2-blo..."
created: 2026-03-11
updated: 2026-04-18
status: living
---
# Prompt Caching Strategy for Meet Without Fear

## Purpose

This document describes how Anthropic's prompt caching works and how we implement it. Our system prompts are split into static and dynamic blocks (the "2-block" architecture) for better cache hit rates and lower costs. This optimization is fully implemented in production.

---

## How Prompt Caching Works

### The Basics

Every API request to Claude includes a **system prompt** and **messages** (conversation history). Normally, Claude re-processes every token in the request from scratch each time.

With prompt caching, you can mark content blocks with `cache_control: { type: 'ephemeral' }`. On the first request, that content is written to a cache (you pay a **write premium**). On subsequent requests with the **exact same prefix**, those tokens are read from cache instead of being reprocessed (you pay a much lower **read price**).

### Cache Hierarchy

Caches are evaluated in this order: **tools** -> **system** -> **messages**. Each level builds on the previous. If you change something early in the sequence (e.g., the system prompt), everything after it is invalidated.

### Breakpoints

You can place up to **4 cache breakpoints** in a single request. Each breakpoint marks "cache everything up to and including this block." Breakpoints themselves are free -- you only pay for the tokens written/read.

### Cache Matching

The cache requires a **100% exact match** of the content prefix. If even one character changes in a cached block, it's a cache miss and a new cache entry must be written. This includes whitespace differences, so implementations must be careful not to inject varying newlines, timestamps, or UUIDs into cached blocks.

### Cache Lifetime (TTL)

| TTL Option | Write Cost | Read Cost | When to Use |
|-----------|-----------|----------|-------------|
| **5 minutes** (default) | 1.25x base input | 0.1x base input | Messages arrive more often than every 5 min |
| **1 hour** | 2.0x base input | 0.1x base input | Messages arrive less often than every 5 min but more than every hour |

The cache is **refreshed on every hit** at no extra cost. So if a user sends a message every 3 minutes, the 5-minute cache never expires. The TTL only starts counting from the **last time the cached content was used**.

**Decision: Use 5-minute TTL.** Our users message every 1-3 minutes during active conversation. Even if they pause for 5+ minutes and the cache expires, the 1.25x write cost is so low we break even on the very next turn. The 2x write cost for 1-hour TTL is not worth it for a standard chat app.

### Minimum Cacheable Size

For Sonnet 4.5: **1,024 tokens minimum**. Content blocks shorter than this are processed normally even if marked with `cache_control`. This is the key constraint driving our design.

### Important: Bedrock Limitations

We use `@anthropic-ai/bedrock-sdk`. As of Feb 2026, **automatic caching** (top-level `cache_control` on the request) is NOT available on Bedrock -- only explicit block-level breakpoints work. This is what we already use.

> **WARNING:** As of Feb 2026, Claude Sonnet 4.6 does NOT support prompt caching on Bedrock.
> The API silently ignores `cache_control`. Do NOT upgrade to Sonnet 4.6 until AWS enables
> caching support. See `.planning/research/PROMPT_CACHING_AUDIT.md` for details.

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BEDROCK_SONNET_MODEL_ID` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | Override Sonnet model ID |
| `BEDROCK_HAIKU_MODEL_ID` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Override Haiku model ID |
| `BEDROCK_TITAN_EMBED_MODEL_ID` | `amazon.titan-embed-text-v2:0` | Override Titan embedding model ID |
| `ENABLE_PROMPT_LOGGING` | `false` | Enable prompt debug logging to filesystem (dev only, blocked in production) |
| `ENABLE_AUDIT_STREAM` | `false` | Enable AI audit stream channel for monitoring |

### Cross-User Caching

On Bedrock, prompt caches are **isolated per session/prefix**. There is no cross-user cache sharing. Each user's session builds its own cache. This means there's no benefit to making the static block user-agnostic -- names can go in the static block since the cache is per-user anyway.

---

## Pricing Impact (Sonnet 4.5)

| Token Type | Cost per 1M tokens |
|-----------|-------------------|
| Normal input (uncached) | $3.00 |
| Cache write (5-min TTL) | $3.75 |
| Cache read (hit) | $0.30 |
| Output | $15.00 |

**The savings**: Cache reads are **10x cheaper** than normal input. Even accounting for the 1.25x write premium on the first request, you break even by the **3rd cache hit**, and every hit after that saves 90%.

---

## Current Implementation: 2-Block System Prompt

### Background: The Previous Approach

Previously, our system prompt was built as **one giant string** that mixed static and dynamic content. Here's what went into a Stage 1 prompt:

| Content | Changes When? | ~Token Size |
|---------|--------------|-------------|
| `SIMPLE_LANGUAGE_PROMPT` | Never | ~120 |
| `PINNED_CONSTITUTION` | Never | ~80 |
| `PRIVACY_GUIDANCE` | Never | ~30 |
| `INVALID_MEMORY_GUIDANCE` | Never | ~15 |
| `PROCESS_OVERVIEW` | Never (conditionally included) | ~40 |
| `PERSPECTIVE_AWARENESS` (previously `NEUTRALITY_GUIDANCE`) | Never | ~180 |
| `STAGE1_LISTENING_RULES` | Never (within a stage) | ~280 |
| `STAGE1_QUESTION_TEMPLATES` | Never (within a stage) | ~50 |
| `buildResponseProtocol(1)` | Never (within a stage) | ~100 |
| Stage intro sentence | Per stage (but stable within a stage) | ~20 |
| Phase guidance (`RIGHT NOW: ...`) | **Every turn** (depends on turnCount, intensity) | ~40 |
| Emotional intensity line | **Every turn** | ~15 |
| Turn count line | **Every turn** | ~5 |
| Feel-heard check section | **Every turn** (depends on turnCount) | ~60 |
| High intensity flag | **Every turn** (depends on intensity) | ~15 |

The ~135 tokens of dynamic content that change every turn **invalidated the cache for the entire system prompt**. Since the cache requires an exact prefix match, even changing `Turn: 3` to `Turn: 4` meant the whole system prompt was a cache miss. The system prompt almost never got a cache hit.

### Design Decision

The original proposal had 3 blocks (universal, stage-specific, dynamic). However, expert review identified that the universal block (~445 tokens) falls below the **1,024 token minimum** for Sonnet 4.5 caching. Splitting into 3 blocks would mean Block 1 never actually caches.

**Solution: Merge universal + stage-specific into one "static" block.** This is how the system works today:

```typescript
system: [
  // Block 1: Static content (universal guidance + stage rules)
  // ~1,219-1,678 tokens — cached, breakpoint here
  {
    type: 'text',
    text: STATIC_CONTENT,
    cache_control: { type: 'ephemeral' }   // Breakpoint 1
  },
  // Block 2: Dynamic per-turn context
  // ~10-70 tokens — NOT cached, changes every turn
  {
    type: 'text',
    text: DYNAMIC_CONTENT
    // No cache_control
  }
]
```

Plus the existing message-level breakpoint (Breakpoint 2). Uses **2 of 4 available breakpoints**.

### Measured Static Block Sizes

All stages exceed Sonnet's 1,024-token caching threshold (measured Feb 2026, see `.planning/research/PROMPT_CACHING_AUDIT.md`):

| Stage | Static Block | Dynamic Block | Total | Cacheable? |
|-------|-------------|---------------|-------|------------|
| Onboarding | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Invitation | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Stage 1 (Witnessing) | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Stage 2 (Perspective Stretch) | ~1,678 tok | ~10 tok | ~1,688 tok | YES |
| Stage 2B (Informed Empathy) | ~1,415 tok | ~10 tok | ~1,425 tok | YES |
| Stage 3 (Need Mapping) | ~1,219 tok | ~10 tok | ~1,229 tok | YES |
| Stage 4 (Strategic Repair) | ~1,269 tok | ~10 tok | ~1,279 tok | YES |

> Dynamic-block sizes above reflect a typical turn. On stage-transition turns, `buildStagePromptString` prepends a `transitionInjection` (6–8 sentences for the Stage 1→2 boundary) and may append a `postShareSection` after a partner share — those transitions temporarily push the dynamic block well above the steady-state numbers without changing the cached static block.

**Stage 3 is the closest to the threshold at ~1,219 tokens.** If the prompt is trimmed in the future, it could drop below 1,024.

### Block 1: Static Content (~1,219-1,678 tokens, cached)

Everything that does NOT change within a stage:

**Universal (included in every stage):**
```
SIMPLE_LANGUAGE_PROMPT        (~120 tokens)  Voice & style rules
PINNED_CONSTITUTION           (~80 tokens)   Ground rules, safety
PRIVACY_GUIDANCE              (~30 tokens)   Cross-user information rules
INVALID_MEMORY_GUIDANCE       (~15 tokens)   Memory request handling
PERSPECTIVE_AWARENESS         (~180 tokens)  Three-layer perspective-awareness / neutrality rules (Stages 1-2). Previously named NEUTRALITY_GUIDANCE.
LATERAL_PROBING_GUIDANCE      (~20 tokens)   Brief/guarded user handling
```

**Stage-specific (stable within a stage):**
```
Stage intro sentence           (~20 tokens)
Stage behavioral rules         (~40-280 tokens, varies by stage)
Stage modes/approaches         (~50-180 tokens, varies by stage)
Static feel-heard/readiness    (~40-60 tokens)
"No advice" / "Forbidden" rules (~15-30 tokens)
Response protocol              (~100 tokens)
```

**What about `userName` and `partnerName`?** These are session-stable (never change within a conversation) and caches are per-user anyway on Bedrock, so including them in the static block is fine. They don't bust the cache.

**Slack surface addition:** When `BuildStagePromptOptions.surface === 'slack'`, `SLACK_FORMATTING_RULES` (~60 tokens) is appended to the static block. This block is identical on every Slack turn, so it caches normally. All stage token counts above reflect the mobile surface; Slack adds ~60 tokens to each static block but all stages remain well above the 1,024-token threshold.

### Block 2: Dynamic Turn Context (~10-70 tokens, NOT cached)

Everything that changes every turn:

```
Phase guidance (gathering vs reflecting)  (~40 tokens)  Depends on turnCount + intensity
"Emotional intensity: X/10"               (~15 tokens)  Changes per turn
"Turn: N"                                 (~5 tokens)   Changes per turn
High intensity flag                       (~15 tokens)  Conditional on intensity >= 8
Feel-heard turn guard                     (~15 tokens)  "Too early (turn < 3)"
Early stage flags                         (~15 tokens)  Conditional on turnCount
Post-share context                        (~varies)     Only after sharing events
Transition injection                      (~varies)     Only on stage transitions
Invited-session nudge                     (~varies)     Only when invitedSessionNudge is set (Slack INVITED sessions nearing 7-day TTL)
```

### What We Send to Claude

Each API request has two parts:

**1. System prompt** (two blocks, one cache breakpoint on the static block):
```
system: [
  {
    type: 'text',
    text: <static block from PromptBlocks>,
    cache_control: { type: 'ephemeral' }
  },
  {
    type: 'text',
    text: <dynamic block from PromptBlocks>
  }
]
```

When the system prompt is passed as a plain string (legacy callers), it falls back to the single-block format with one cache breakpoint on the entire string.

**2. Messages** (conversation history, one cache breakpoint on second-to-last message):
```
messages: [
  { role: 'user', content: 'message 1' },
  { role: 'assistant', content: 'response 1' },
  { role: 'user', content: [{ type: 'text', text: 'message 2', cache_control: { type: 'ephemeral' } }] },
  { role: 'assistant', content: 'response 2' },
  { role: 'user', content: 'message 3 (latest)' },
]
```

### Cache Behavior Per Turn

| Event | Block 1 (static) | Block 2 (dynamic) | History |
|-------|-----------------|-------------------|---------|
| First message in stage | Write (~1,219-1,678) | Uncached (~10-70) | Write |
| Subsequent turns (same stage) | **Read** (~1,219-1,678) | Uncached (~10-70) | Read prefix + write new |
| Stage transition | Write (new stage content) | Uncached (~10-70) | Read prefix + write new |

---

## Verification: All Implementation Items Complete

All items from the original implementation plan are complete and in production. Code references:

1. **`PromptBlocks` interface defined** -- `stage-prompts.ts:324-327`. Exported and imported by `bedrock.ts`.

2. **All `buildStageXPrompt()` functions return `PromptBlocks`** -- Each returns `{ staticBlock, dynamicBlock }`:
   - `buildOnboardingPrompt()` (line 405)
   - `buildInvitationPrompt()` (line 431)
   - `buildStage1Prompt()` (line 482)
   - `buildStage2Prompt()` (line 539)
   - `buildStage2BPrompt()` (line 633)
   - `buildStage3Prompt()` (line 740)
   - `buildStage4Prompt()` (line 797)

3. **`buildStagePrompt()` returns `PromptBlocks`** -- `stage-prompts.ts:1599`. The main entry point returns `PromptBlocks`, not a string.

4. **`buildStagePromptString()` backward compatibility** -- `stage-prompts.ts:1668-1671`. Joins both blocks into a single string for callers that don't need cache optimization (e.g., one-shot calls, test tooling).

5. **`bedrock.ts` handles `PromptBlocks` in both streaming and non-streaming paths**:
   - `getModelCompletion()` (lines 373-380): Constructs 2-block system array when given `PromptBlocks`, single-block when given a plain string.
   - `getSonnetStreamingResponse()` (lines 742-749): Same logic for the streaming path.
   - `CompletionOptions.systemPrompt` typed as `string | PromptBlocks` (line 232).
   - `SonnetStreamingOptions.systemPrompt` typed as `string | PromptBlocks` (line 665).

6. **Cache tokens extracted correctly** -- Both `getModelCompletion()` and `getSonnetStreamingResponse()` read `cache_read_input_tokens` and `cache_creation_input_tokens` from the SDK response's `usage` field (lines 408-409, 835-836). These are recorded in BrainActivity metadata and LLM telemetry.

7. **Cost tracking accounts for cached tokens** -- Pricing table at lines 27-35 includes `cacheRead` and `cacheWrite` rates. Cost formulas at lines 415-419 and 841-846 correctly attribute cached vs. uncached system tokens. Note: `input_tokens` from the Bedrock SDK already excludes cache tokens, so no double-subtraction.

8. **All static blocks exceed 1,024 tokens** -- Measured in the prompt caching audit. Stage 3 is the smallest at ~1,219 tokens, still comfortably above threshold.

### What We're NOT Changing

- Conversation history caching (already works well via second-to-last message breakpoint)
- The content of the prompts themselves (only restructuring how they're delivered)
- Response parsing or any downstream behavior
- (Inner work / linked inner thoughts prompts — `buildInnerWorkPrompt` / `buildLinkedInnerThoughtsPrompt` — now also return `PromptBlocks`; they use the same static/dynamic split and are covered by the caching path.)

---

## Cost Savings

### Example: 10-turn Stage 1 Conversation

**Previous approach** (single-string system prompt, always cache-miss):

| Turn | System (write) | System (read) | History (write) | History (read) | New msg |
|------|---------------|--------------|----------------|---------------|---------|
| 1 | 1,480 | 0 | 0 | 0 | 50 |
| 2 | 1,480 | 0 | 100 | 0 | 50 |
| 3 | 1,480 | 0 | 100 | 100 | 50 |
| ... | ... | ... | ... | ... | ... |
| 10 | 1,480 | 0 | 100 | 800 | 50 |

System tokens written: 1,480 x 10 = **14,800 tokens at cache-write price** ($3.75/MTok)
System tokens read: **0**

**Current approach** (2-block split, static block ~1,410 tokens for Stage 1):

| Turn | Static block | Dynamic block | History (write) | History (read) | New msg |
|------|-------------|--------------|----------------|---------------|---------|
| 1 | write 1,410 | 70 (uncached) | 0 | 0 | 50 |
| 2 | read 1,410 | 70 | write 100 | 0 | 50 |
| 3 | read 1,410 | 70 | write 100 | 100 | 50 |
| ... | ... | ... | ... | ... | ... |
| 10 | read 1,410 | 70 | write 100 | 800 | 50 |

System tokens written: **1,410 tokens once** ($3.75/MTok)
System tokens read: 1,410 x 9 = **12,690 tokens at cache-read price** ($0.30/MTok)
Dynamic tokens: 70 x 10 = **700 tokens at normal input price** ($3.00/MTok)

### Cost Comparison (10-turn conversation, system prompt only)

| | Previous (single string) | Current (2-block split) |
|---|---------|----------|
| Cache writes | 14,800 x $3.75/M = $0.0555 | 1,410 x $3.75/M = $0.0053 |
| Cache reads | 0 | 12,690 x $0.30/M = $0.0038 |
| Uncached input | 0 | 700 x $3.00/M = $0.0021 |
| **Total (system)** | **$0.0555** | **$0.0112** |
| **Savings** | | **~80% reduction** |

Over a full session (20-30 turns across 4 stages), the savings compound. The conversation history caching (which also works) is unaffected.

---

## References

- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Bedrock Prompt Caching Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Claude on Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock)
- `.planning/research/PROMPT_CACHING_AUDIT.md` -- Measured token counts and model compatibility test results
