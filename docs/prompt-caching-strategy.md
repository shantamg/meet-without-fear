# Prompt Caching Strategy for Meet Without Fear

## Purpose

This document describes how Anthropic's prompt caching works, how we currently use it, and the optimization plan to split our system prompts into static and dynamic blocks for better cache hit rates and lower costs.

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

For Sonnet 4.6: **1,024 tokens minimum**. Content blocks shorter than this are processed normally even if marked with `cache_control`. This is the key constraint driving our design.

### Important: Bedrock Limitations

We use `@anthropic-ai/bedrock-sdk`. As of Feb 2026, **automatic caching** (top-level `cache_control` on the request) is NOT available on Bedrock -- only explicit block-level breakpoints work. This is what we already use.

### Cross-User Caching

On Bedrock, prompt caches are **isolated per session/prefix**. There is no cross-user cache sharing. Each user's session builds its own cache. This means there's no benefit to making the static block user-agnostic -- names can go in the static block since the cache is per-user anyway.

---

## Pricing Impact (Sonnet 4.6)

| Token Type | Cost per 1M tokens |
|-----------|-------------------|
| Normal input (uncached) | $3.00 |
| Cache write (5-min TTL) | $3.75 |
| Cache read (hit) | $0.30 |
| Output | $15.00 |

**The savings**: Cache reads are **10x cheaper** than normal input. Even accounting for the 1.25x write premium on the first request, you break even after just **2 cache hits**, and every hit after that saves 90%.

---

## Our Current Implementation

### What We Send to Claude

Each API request has two parts:

**1. System prompt** (one block, one cache breakpoint):
```
system: [{
  type: 'text',
  text: <entire stage prompt as a single string>,
  cache_control: { type: 'ephemeral' }
}]
```

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

### The Problem

Our system prompt is built as **one giant string** that mixes static and dynamic content. Here's what goes into a Stage 1 prompt:

| Content | Changes When? | ~Token Size |
|---------|--------------|-------------|
| `SIMPLE_LANGUAGE_PROMPT` | Never | ~120 |
| `PINNED_CONSTITUTION` | Never | ~80 |
| `PRIVACY_GUIDANCE` | Never | ~30 |
| `INVALID_MEMORY_GUIDANCE` | Never | ~15 |
| `PROCESS_OVERVIEW` | Never (conditionally included) | ~40 |
| `NEUTRALITY_GUIDANCE` | Never | ~180 |
| `STAGE1_LISTENING_RULES` | Never (within a stage) | ~280 |
| `STAGE1_QUESTION_TEMPLATES` | Never (within a stage) | ~50 |
| `buildResponseProtocol(1)` | Never (within a stage) | ~100 |
| Stage intro sentence | Per stage (but stable within a stage) | ~20 |
| Phase guidance (`RIGHT NOW: ...`) | **Every turn** (depends on turnCount, intensity) | ~40 |
| Emotional intensity line | **Every turn** | ~15 |
| Turn count line | **Every turn** | ~5 |
| Feel-heard check section | **Every turn** (depends on turnCount) | ~60 |
| High intensity flag | **Every turn** (depends on intensity) | ~15 |

**Estimated total: ~1,050 tokens** (varies by stage and conditionals).

The ~135 tokens of dynamic content that change every turn **invalidate the cache for the entire ~1,050 token system prompt**. Since the cache requires an exact prefix match, even changing `Turn: 3` to `Turn: 4` means the whole system prompt is a cache miss.

### What Currently Gets Cached Well

**Conversation history**: The second-to-last message breakpoint works correctly. On turn N, messages 1 through N-2 are cache hits, and only the last assistant + user messages are new. This saves significant tokens as conversations grow longer.

**System prompt**: Almost never gets a cache hit because it changes every turn.

---

## The Plan: 2-Block System Prompt

### Design Decision

The original proposal had 3 blocks (universal, stage-specific, dynamic). However, expert review identified that the universal block (~445 tokens) falls below the **1,024 token minimum** for Sonnet 4.6 caching. Splitting into 3 blocks would mean Block 1 never actually caches.

**Solution: Merge universal + stage-specific into one "static" block.** This gives us:

```typescript
system: [
  // Block 1: Static content (universal guidance + stage rules)
  // ~915-1,050 tokens — cached, breakpoint here
  {
    type: 'text',
    text: STATIC_CONTENT,
    cache_control: { type: 'ephemeral' }   // Breakpoint 1
  },
  // Block 2: Dynamic per-turn context
  // ~80-135 tokens — NOT cached, changes every turn
  {
    type: 'text',
    text: DYNAMIC_CONTENT
    // No cache_control
  }
]
```

Plus the existing message-level breakpoint (Breakpoint 2). Uses **2 of 4 available breakpoints**.

### Crossing the 1,024 Token Threshold

The merged block is ~915-950 tokens for some stages — still below 1,024. To reliably cross the threshold, we can expand existing guidance slightly (e.g., add 1-2 few-shot examples of ideal responses to stages that run short). This is natural content that improves quality, not arbitrary padding.

### Block 1: Static Content (~1,024+ tokens, cached)

Everything that does NOT change within a stage:

**Universal (included in every stage):**
```
SIMPLE_LANGUAGE_PROMPT        (~120 tokens)  Voice & style rules
PINNED_CONSTITUTION           (~80 tokens)   Ground rules, safety
PRIVACY_GUIDANCE              (~30 tokens)   Cross-user information rules
INVALID_MEMORY_GUIDANCE       (~15 tokens)   Memory request handling
NEUTRALITY_GUIDANCE           (~180 tokens)  Three-layer neutrality (Stages 1-2)
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

### Block 2: Dynamic Turn Context (~80-135 tokens, NOT cached)

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
```

### Cache Behavior Per Turn

| Event | Block 1 (static) | Block 2 (dynamic) | History |
|-------|-----------------|-------------------|---------|
| First message in stage | Write (~1,024) | Uncached (~100) | Write |
| Subsequent turns (same stage) | **Read** (~1,024) | Uncached (~100) | Read prefix + write new |
| Stage transition | Write (~1,024, new stage) | Uncached (~100) | Read prefix + write new |

### What This Changes in the Code

`buildStagePrompt()` currently returns a single `string`. It will return a **structured object**:

```typescript
interface PromptBlocks {
  staticBlock: string;   // Universal + stage rules (cached)
  dynamicBlock: string;  // Per-turn context (not cached)
}
```

`bedrock.ts` will construct the system array from these blocks:

```typescript
const system = [
  {
    type: 'text',
    text: promptBlocks.staticBlock,
    cache_control: { type: 'ephemeral' },
  },
  {
    type: 'text',
    text: promptBlocks.dynamicBlock,
  },
];
```

---

## Expected Savings

### Example: 10-turn Stage 1 Conversation

**Current approach** (system prompt always cache-miss):

| Turn | System (write) | System (read) | History (write) | History (read) | New msg |
|------|---------------|--------------|----------------|---------------|---------|
| 1 | 1,050 | 0 | 0 | 0 | 50 |
| 2 | 1,050 | 0 | 100 | 0 | 50 |
| 3 | 1,050 | 0 | 100 | 100 | 50 |
| ... | ... | ... | ... | ... | ... |
| 10 | 1,050 | 0 | 100 | 800 | 50 |

System tokens written: 1,050 x 10 = **10,500 tokens at cache-write price** ($3.75/MTok)
System tokens read: **0**

**Optimized approach** (2-block split):

| Turn | Static block | Dynamic block | History (write) | History (read) | New msg |
|------|-------------|--------------|----------------|---------------|---------|
| 1 | write 1,024 | 100 (uncached) | 0 | 0 | 50 |
| 2 | read 1,024 | 100 | write 100 | 0 | 50 |
| 3 | read 1,024 | 100 | write 100 | 100 | 50 |
| ... | ... | ... | ... | ... | ... |
| 10 | read 1,024 | 100 | write 100 | 800 | 50 |

System tokens written: **1,024 tokens once** ($3.75/MTok)
System tokens read: 1,024 x 9 = **9,216 tokens at cache-read price** ($0.30/MTok)
Dynamic tokens: 100 x 10 = **1,000 tokens at normal input price** ($3.00/MTok)

### Cost Comparison (10-turn conversation, system prompt only)

| | Current | Optimized |
|---|---------|----------|
| Cache writes | 10,500 x $3.75/M = $0.0394 | 1,024 x $3.75/M = $0.0038 |
| Cache reads | 0 | 9,216 x $0.30/M = $0.0028 |
| Uncached input | 0 | 1,000 x $3.00/M = $0.0030 |
| **Total (system)** | **$0.0394** | **$0.0096** |
| **Savings** | | **~76% reduction** |

Over a full session (20-30 turns across 4 stages), the savings compound. The conversation history caching (which already works) is unaffected.

---

## Implementation Checklist

1. Define `PromptBlocks` interface in `stage-prompts.ts`
2. Refactor each `buildStageXPrompt()` to separate static vs dynamic content
3. Update `buildStagePrompt()` to return `PromptBlocks` instead of `string`
4. Update `bedrock.ts` (`getSonnetStreamingResponse` and `getModelCompletion`) to accept and use multi-block system prompts
5. Ensure dynamic block doesn't accidentally include stable content (watch for whitespace)
6. If any stage's static block is under 1,024 tokens, expand with useful few-shot examples
7. Update cost tracking to correctly attribute cached vs uncached system tokens
8. Test that `cache_read_input_tokens` shows hits on turn 2+ within a stage

### What We're NOT Changing

- Conversation history caching (already works well via second-to-last message breakpoint)
- The content of the prompts themselves (only restructuring how they're delivered)
- Response parsing or any downstream behavior
- Inner work / linked inner thoughts prompts (can be optimized later)

---

## References

- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Bedrock Prompt Caching Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Claude on Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock)
