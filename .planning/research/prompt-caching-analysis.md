# Prompt Caching Analysis for Meet Without Fear

## Executive Summary

Prompt caching is a **highly viable optimization** for Meet Without Fear's conversation-based architecture. The app's pattern of growing conversation history with an unchanging prefix is the **ideal use case** for prompt caching. Based on research, we can expect:

- **90% cost reduction** on cached input tokens (reads cost 10% of base price)
- **Up to 85% latency reduction** for cached prefixes
- **Ability to include much more conversation history** per request, reducing reliance on summarization/retrieval

The architecture we want (system prompt + cached conversation history + new message) is **directly supported and explicitly documented** as a primary use case by both Anthropic and AWS Bedrock.

---

## Question-by-Question Findings

### 1. How does prompt caching work on AWS Bedrock for Anthropic models?

**On Bedrock, you must explicitly add cache breakpoints.** Caching is NOT automatic by default (unlike what some early docs suggested). You place `cachePoint` markers in the request to tell the system what to cache.

Two APIs are available on Bedrock:
- **Converse API** (what we currently use): Uses `cachePoint: { type: "default" }` syntax
- **InvokeModel API**: Uses `cache_control: { type: "ephemeral" }` syntax (same as direct Anthropic API)

**Important Bedrock-specific syntax for Converse API:**
```json
{
  "system": [
    { "text": "System prompt here..." },
    { "cachePoint": { "type": "default" } }
  ],
  "messages": [
    { "role": "user", "content": [{ "text": "Message 1" }] },
    { "role": "assistant", "content": [{ "text": "Response 1" }] },
    { "role": "user", "content": [
      { "text": "Latest message" },
      { "cachePoint": { "type": "default" } }
    ]}
  ]
}
```

> Note: The Anthropic direct API now also supports "automatic caching" (top-level `cache_control` field) that auto-advances the breakpoint. **This is NOT yet available on Bedrock** per the Anthropic docs: "Automatic caching is available on the Claude API and Azure AI Foundry (preview). Support for Amazon Bedrock and Google Vertex AI is coming later." On Bedrock, we must use explicit breakpoints.

**Sources:**
- [AWS Bedrock Prompt Caching Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

---

### 2. Can you cache conversation history (user/assistant message pairs)?

**Yes, absolutely.** This is explicitly supported and documented as a primary use case. You can cache:
- Tool definitions in the `tools` array
- System messages in the `system` array
- Text content blocks in `messages.content` array (both user AND assistant turns)
- Images and documents in user turns
- Tool use and tool results in both user and assistant turns

The multi-turn conversation pattern is directly documented:

| Request | Content | Cache behavior |
|---------|---------|----------------|
| Request 1 | System + User:A + Asst:B + **User:C** (cache) | Everything written to cache |
| Request 2 | System + User:A + Asst:B + User:C + Asst:D + **User:E** (cache) | System through User:C read from cache; Asst:D + User:E written |
| Request 3 | System + User:A + ... + User:E + Asst:F + **User:G** (cache) | System through User:E read from cache; Asst:F + User:G written |

**This is exactly our use case.** Old messages never change, only new ones get appended.

**Source:** [Anthropic Prompt Caching - Multi-turn conversations](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

---

### 3. How do cache breakpoints work? Can you put them on system messages AND within the messages array?

**Yes, you can place breakpoints on both system and messages.** Cache prefixes follow this hierarchy: `tools` -> `system` -> `messages`. Each level builds upon the previous ones.

For our use case, the recommended pattern is:
1. **Breakpoint 1**: After system prompt (rarely changes)
2. **Breakpoint 2**: After the last message in conversation history (moves forward each turn)

On Bedrock Converse API, you add `cachePoint` as a content block:
```json
{
  "system": [
    { "text": "Your system prompt..." },
    { "cachePoint": { "type": "default" } }
  ],
  "messages": [
    // ... conversation history ...
    {
      "role": "user",
      "content": [
        { "text": "Previous user message" },
        { "cachePoint": { "type": "default" } }
      ]
    },
    // New turn (not cached)
    {
      "role": "user",
      "content": [{ "text": "Latest message" }]
    }
  ]
}
```

**20-block lookback window**: The system checks backwards from your breakpoint up to 20 content blocks for cache hits. For conversations with more than 20 messages, add multiple breakpoints or restructure content.

**Source:** [AWS Bedrock Prompt Caching Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)

---

### 4. What's the minimum token count for caching? What's the TTL?

**Minimum tokens per cache checkpoint (by model):**

| Model | Minimum Tokens |
|-------|---------------|
| Claude Sonnet 4/4.5/4.6, Opus 4/4.1 | 1,024 tokens |
| Claude Opus 4.5/4.6 | 4,096 tokens |
| Claude Haiku 4.5 | 4,096 tokens |
| Claude Haiku 3.5 | 2,048 tokens |
| Claude 3.5 Sonnet (our current model) | 1,024 tokens |

**For our current model (Claude 3.5 Sonnet v2): 1,024 tokens minimum.** Our system prompts are typically 2,000-5,000 tokens, so we easily meet this threshold from the first request.

**TTL (Time-to-Live) options:**
- **Default: 5 minutes** - Refreshed each time the cache is used (no extra cost for refresh)
- **Extended: 1 hour** - Available for Claude Haiku 4.5, Sonnet 4.5, and Opus 4.5 (costs 2x base input token price for writes)

For our app, the **5-minute TTL should be sufficient** for most scenarios since users are actively chatting. The cache refreshes on each use, so as long as messages are sent within 5 minutes of each other, the cache stays alive.

If we upgrade to Claude 4.5 models, the **1-hour TTL** becomes relevant for cases where users pause their conversation.

**Sources:**
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [AWS Bedrock 1-hour caching announcement](https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-bedrock-one-hour-duration-prompt-caching/)

---

### 5. What's the pricing difference between cached reads vs full input processing?

**Direct Anthropic API pricing (Claude 3.5 Sonnet equivalent tier):**

| Token Type | Price per 1M tokens | Multiplier vs Base |
|-----------|--------------------|--------------------|
| Base Input | $3.00/MTok | 1.00x |
| 5-min Cache Write | $3.75/MTok | 1.25x |
| 1-hour Cache Write | $6.00/MTok | 2.00x |
| **Cache Read** | **$0.30/MTok** | **0.10x** |
| Output | $15.00/MTok | N/A |

**AWS Bedrock pricing (Claude 3.5 Sonnet v2):**

| Token Type | Price per 1M tokens |
|-----------|---------------------|
| Standard Input | $6.00/MTok |
| Cache Write | $7.50/MTok |
| Cache Read | $0.60/MTok |

**Key insight**: Cache reads cost **10% of base input price**. The first request pays a 25% premium to write to cache, but every subsequent request reads at 90% savings. Break-even is after the **2nd request** using the same prefix.

**For our app's conversation pattern:**
- Turn 1: System prompt + first message = cache write (1.25x cost)
- Turn 2: System + msg1 cached (0.1x) + new msg written (1.25x) = **massive savings**
- Turn N: System + msgs 1..N-1 all cached (0.1x) + new msg only (1.25x) = **90% savings on growing history**

**Sources:**
- [Anthropic Pricing Page](https://platform.claude.com/docs/en/about-claude/pricing)
- [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)

---

### 6. Does Bedrock support the same caching features as the direct Anthropic API?

**Mostly yes, with some differences:**

| Feature | Anthropic API | AWS Bedrock |
|---------|--------------|-------------|
| Explicit cache breakpoints | Yes (`cache_control`) | Yes (`cachePoint`) |
| Automatic caching (top-level) | Yes | **Not yet** (coming later) |
| Max breakpoints | 4 | 4 |
| Min tokens (Sonnet) | 1,024 | 1,024 |
| 5-minute TTL | Yes | Yes |
| 1-hour TTL | Yes (select models) | Yes (select models) |
| System prompt caching | Yes | Yes |
| Messages array caching | Yes | Yes |
| Tools caching | Yes | Yes |
| 20-block lookback | Yes | Yes |

**Key differences for our implementation:**
1. **Syntax**: Bedrock Converse API uses `cachePoint: { type: "default" }` instead of `cache_control: { type: "ephemeral" }`
2. **No automatic caching on Bedrock**: We must manually place breakpoints (this is fine - gives us more control)
3. **TTL syntax**: Bedrock uses `ttl: "5m" | "1h"` inside the cachePoint object

**Source:** [AWS Bedrock Prompt Caching Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)

---

### 7. For a growing conversation: if we have 50 messages and add a 51st, do the first 50 get a cache hit?

**Yes!** This is exactly how it works, with one caveat about the 20-block lookback window.

**How it works:**
- Put a `cachePoint` after the last message of the previous conversation
- On the next turn, all messages up to that point are read from cache
- Only the new messages are written to cache
- The cache refreshes on each read (resetting the 5-min TTL)

**The 20-block lookback caveat:**
The system only checks backwards up to 20 content blocks from your breakpoint. For 50+ messages, you should place multiple breakpoints (you get up to 4) to ensure full coverage:
- Breakpoint 1: After system prompt
- Breakpoint 2: After ~message 20 (static historical messages)
- Breakpoint 3: After ~message 40 (more recent history)
- Breakpoint 4: After the last old message (most recent cache boundary)

**However**, with the "simplified cache management" feature on Bedrock, placing a single breakpoint at the end and letting the system auto-check backwards up to 20 blocks is often sufficient for conversations under 20 turns.

**Source:** [Anthropic Prompt Caching - Structuring your prompt](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

---

### 8. Can we have multiple cache breakpoints?

**Yes, up to 4 cache breakpoints per request.**

Recommended layout for our app:
```
Breakpoint 1: After system prompt (changes rarely)
Breakpoint 2: After conversation history (grows each turn)
```

We could also use:
```
Breakpoint 1: After tool definitions (if we use tools)
Breakpoint 2: After system prompt
Breakpoint 3: After injected context (retrieved memories, summaries)
Breakpoint 4: After conversation history
```

**Breakpoints themselves are free** - you only pay for cache writes and reads based on token volume.

**Source:** [Anthropic Prompt Caching FAQ](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

---

### 9. What happens if the conversation grows past the cache breakpoint?

**You move the breakpoint forward each turn.** This is the expected pattern.

On each API call:
1. Include all messages in the request
2. Place `cachePoint` after the second-to-last user/assistant exchange (everything that was in the previous request)
3. Leave the newest message uncached

The system will:
- Find the longest matching cached prefix (from the previous turn's write)
- Read it from cache (cheap)
- Write the new messages to extend the cache (small 1.25x premium on new tokens only)
- Process only the truly new content at full inference cost

**You don't need to worry about "moving" breakpoints** - you simply construct each request with the breakpoint in the right place. Each request is independent.

---

### 10. Is there a concept of "ephemeral" cache control?

**Yes.** On the direct Anthropic API, `"type": "ephemeral"` is the only supported cache type. It means the cache has a TTL (5 minutes or 1 hour) and expires after that.

On AWS Bedrock Converse API, the equivalent is `"type": "default"`. The Bedrock docs explicitly note that `"ephemeral"` is NOT a valid type for the `cachePoint` object in the Converse API.

There is no concept of permanent caching - all caches are ephemeral/temporary with automatic refresh on use.

---

## Architecture Recommendation

### Proposed Architecture: YES, This Works

```
[System Prompt - ~2,000-5,000 tokens] → CACHED (breakpoint 1)
[Conversation History - grows each turn] → CACHED PREFIX (breakpoint 2)
[Latest User Message - changes each request] → NOT CACHED (full price)
```

### Cost Model Example

Assume a 30-turn conversation, system prompt = 3,000 tokens, each turn ~200 tokens:

**Without caching (current state):**
- Each API call processes ALL tokens: 3,000 + (turn * 200) tokens at full price
- Turn 30: 3,000 + 6,000 = 9,000 input tokens at $6.00/MTok = $0.054/call
- Total across 30 turns: ~$0.81 in input costs alone

**With caching:**
- Turn 1: 3,000 tokens cache write at $7.50/MTok = $0.0225
- Turn 2: 3,200 tokens cache read at $0.60/MTok ($0.00192) + 200 tokens cache write ($0.0015) = $0.003
- Turn 30: 8,800 tokens cache read at $0.60/MTok ($0.00528) + 200 tokens cache write ($0.0015) = $0.007
- Total across 30 turns: ~$0.17 in input costs

**Savings: ~79% reduction in input costs for a typical conversation.**

### Expanded Context Opportunity

Since cached tokens cost 90% less, we can afford to include **MUCH more context**:

| Content Type | Tokens | Cost without cache | Cost with cache |
|-------------|--------|-------------------|-----------------|
| System prompt | 3,000 | $0.018/call | $0.0018/call |
| Full conversation (30 turns) | 6,000 | $0.036/call | $0.0036/call |
| Retrieved memories/context | 2,000 | $0.012/call | $0.0012/call |
| **Total input** | **11,000** | **$0.066/call** | **$0.0066/call** |

This means we could potentially:
- **Keep full conversation history** instead of summarizing early messages
- **Include more retrieved context** (memories, past sessions) at minimal cost
- **Add richer system prompts** with more examples/instructions
- **Reduce reliance on summarization** which can lose important nuances

### Implementation Changes Needed

Our current `bedrock.ts` uses the Converse API but does NOT use caching. Here's what needs to change:

**Current code (no caching):**
```typescript
const system: SystemContentBlock[] = [{ text: systemPrompt }];
const commandInput: ConverseCommandInput = {
  modelId,
  messages: toBedrockMessages(messages),
  system,
  inferenceConfig,
};
```

**With caching (add cachePoint blocks):**
```typescript
const system: SystemContentBlock[] = [
  { text: systemPrompt },
  { cachePoint: { type: "default" } }  // Cache the system prompt
];

// Convert messages, adding cachePoint after the second-to-last message
const bedrockMessages = toBedrockMessages(messages);
if (bedrockMessages.length >= 2) {
  // Add cachePoint to the second-to-last message's content
  const secondToLast = bedrockMessages[bedrockMessages.length - 2];
  secondToLast.content.push({ cachePoint: { type: "default" } });
}

const commandInput: ConverseCommandInput = {
  modelId,
  messages: bedrockMessages,
  system,
  inferenceConfig,
};
```

**Cost tracking update needed:**
The Bedrock response includes additional fields for cached token tracking:
- `usage.cacheReadInputTokens` - tokens read from cache
- `usage.cacheWriteInputTokens` - tokens written to cache
These should be tracked separately for accurate cost calculation.

### Streaming Considerations

The `getSonnetStreamingResponse` function uses `ConverseStreamCommand` which also supports caching. The same `cachePoint` markers work in streaming mode. Cache metadata appears in the stream's metadata event.

### Important Caveats

1. **Cache invalidation**: Changing the system prompt, tool definitions, or any cached content invalidates the cache for all subsequent content. Keep cached content stable.

2. **Request ordering**: Cache hits require 100% identical content up to the breakpoint. Message order, whitespace, and content must be byte-identical.

3. **Concurrent requests**: A cache entry only becomes available after the first response begins. For parallel requests to the same user, the first must complete before others can get cache hits.

4. **Model changes**: Switching between models (e.g., Haiku vs Sonnet) means separate caches. Each model has its own cache.

5. **Extended thinking**: If using extended thinking, thinking blocks cannot be directly cached with `cache_control`, but they CAN be cached as part of subsequent requests. Changes to thinking parameters (enable/disable, budget) invalidate message caches.

6. **AWS SDK types**: The `@aws-sdk/client-bedrock-runtime` TypeScript types may need to be checked for `cachePoint` support. The feature was added to Bedrock in 2025, so ensure SDK version >= 3.x that includes caching types.

---

## Sources

- [AWS Bedrock Prompt Caching Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Anthropic Prompt Caching Documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [AWS Bedrock 1-Hour Duration Announcement (Jan 2026)](https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-bedrock-one-hour-duration-prompt-caching/)
- [Simplified Cache Management for Claude on Bedrock (Sep 2025)](https://aws.amazon.com/about-aws/whats-new/2025/09/cache-management-anthropics-claude-models-bedrock/)
- [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Effectively Use Prompt Caching on Amazon Bedrock (AWS Blog)](https://aws.amazon.com/blogs/machine-learning/effectively-use-prompt-caching-on-amazon-bedrock/)
- [Caylent: Amazon Bedrock Prompt Caching Guide](https://caylent.com/blog/prompt-caching-saving-time-and-money-in-llm-applications)
