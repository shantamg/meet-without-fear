# Prompt Caching Audit — Feb 2026

## Summary

Prompt caching was not working despite being implemented. Root cause: system prompts were below the minimum token threshold. This has been resolved by recent prompt redesigns. The model remains on Sonnet 4.5 because **Sonnet 4.6 does NOT support prompt caching on Bedrock** (see test results below).

## Test Results (Feb 22, 2026 — CORRECTED Feb 22, 2026)

### Model + Prefix Compatibility

**CORRECTION**: Earlier testing incorrectly reported Sonnet 4.6 as supporting caching. The original test used a system prompt below 1,024 tokens, which meant ALL models showed no caching — making it appear that 4.6 was equivalent to 4.5. Retesting with a 1,376-token system prompt revealed that Sonnet 4.6 ignores `cache_control` entirely (zero cache writes AND zero cache reads), while Sonnet 4.5 works correctly.

Tested all combinations with a ~1,376 token system prompt with `cache_control: { type: 'ephemeral' }`:

| Model ID | Caching | Notes |
|----------|---------|-------|
| `global.anthropic.claude-sonnet-4-6` | **NO** | API ignores `cache_control` — zero cache_write, zero cache_read |
| `us.anthropic.claude-sonnet-4-6` | **NO** | Same — caching not supported |
| `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | **YES** | **Current default.** Call 1: cache_write=1349, Call 2: cache_read=1349 |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | **YES** | Cache shared with `global.` prefix |
| `global.anthropic.claude-haiku-4-5-20251001-v1:0` | NO* | Requires ~4700+ tokens (see below) |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | NO* | Same threshold |

**Key findings**:
1. `global.` and `us.` prefixes both support caching and share the same cache pool for Sonnet 4.5
2. **Sonnet 4.6 does NOT support prompt caching on AWS Bedrock** as of Feb 2026. The API silently ignores `cache_control` markers — no error, but no caching either
3. Cross-region inference does NOT prevent caching (for supported models)

### Minimum Cacheable Token Thresholds (Bedrock)

| Model | Documented Minimum | Observed Minimum |
|-------|-------------------|-----------------|
| Sonnet (4.5 & 4.6) | 1,024 tokens | ~1,024 tokens (failed at 473, worked at 1,649) |
| Haiku 4.5 | 2,048 tokens | **~4,700 tokens** (failed at 2,017, worked at 4,708) |

Haiku's effective threshold on Bedrock is significantly higher than documented. This means Haiku calls in our app will **never cache** — the classifier/detection prompts are well under 4,700 tokens.

### Cache TTL

Bedrock ephemeral cache TTL is **5 minutes**. Cache entries expire if no matching request arrives within this window. In natural conversation, users often pause 5-15 minutes between messages, which will cause cache misses even when the prompt is identical.

## Current System Prompt Sizes (Post-Redesign)

All stages now exceed Sonnet's caching threshold:

| Stage | Static Block | Dynamic Block | Total | Cacheable? |
|-------|-------------|---------------|-------|------------|
| Onboarding | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Invitation | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Stage 1 (Feel Heard) | ~1,410 tok | ~70 tok | ~1,480 tok | YES |
| Stage 2 (Perspective) | ~1,678 tok | ~10 tok | ~1,688 tok | YES |
| Stage 2B (Refinement) | ~1,415 tok | ~10 tok | ~1,425 tok | YES |
| Stage 3 (Needs) | ~1,219 tok | ~10 tok | ~1,229 tok | YES |
| Stage 4 (Resolution) | ~1,269 tok | ~10 tok | ~1,279 tok | YES |

**Stage 3 is the closest to the threshold at ~1,219 tokens.** If the prompt is trimmed in the future, it could drop below 1,024.

## Current Caching Architecture

### Where cache_control is applied (in `bedrock.ts`)

1. **System prompt static block** — `cache_control: { type: 'ephemeral' }` on the first text block (the static portion of the PromptBlocks). This caches the stage rules/guidance that don't change between turns.

2. **Second-to-last message** — `cache_control` added by `toAnthropicMessages()`. This caches the conversation history prefix so that on the next turn, the entire prior conversation is a cache hit.

### PromptBlocks split (`stage-prompts.ts`)

Each stage builder returns `{ staticBlock, dynamicBlock }`:
- **staticBlock**: Stage rules, tone guidance, response protocol. Cached via `cache_control`. Should be identical between turns within the same stage.
- **dynamicBlock**: Turn-specific context (turn count, emotional intensity, transition injections). Not cached.

### What gets cached vs. what doesn't

| Component | Cached? | Why |
|-----------|---------|-----|
| System prompt (static block) | YES | Same `cache_control` breakpoint across turns |
| System prompt (dynamic block) | NO | Changes every turn (turn count, context) |
| Conversation history (all but last 2 msgs) | YES | `cache_control` on second-to-last message |
| Current user message | NO | New each turn |
| Haiku classifier calls | NO | Below 4,700 token threshold |
| Titan embedding calls | N/A | Embeddings don't support caching |

## Why Caching Showed 0% in the Dashboard

Analysis of session `cmlypsj8e000cpx07l92chcex` (10 Sonnet calls):

1. **Turns 0-5** (Onboarding → Invitation): System prompts were 460-750 tokens (old prompt format, before redesign). Below the 1,024 minimum — no cache activity at all.

2. **Turns 6-7**: Cache writes started appearing (system prompt grew past threshold), but a stage transition (Invitation → Stage 1) changed the static block, causing a miss.

3. **Turns 7-8**: Same stage (Stage 1), but a 10.5-minute gap exceeded the 5-minute TTL — cache expired.

4. **Turns 8-9**: Stage transition (Stage 1 → Stage 2) — different static block, cache miss.

**Result**: Every turn either had a prompt below threshold, a stage transition, or a TTL expiration. Zero cache reads across the entire session.

## What Changed

1. **Model stays on Sonnet 4.5**: `global.anthropic.claude-sonnet-4-5-20250929-v1:0` — Sonnet 4.6 does not support prompt caching on Bedrock (see commit `1f1bda5`). Do NOT upgrade to 4.6 until AWS enables caching support.
2. **Prompts already fixed**: The recent prompt redesign (`19dc7aa`) coincidentally made all static blocks exceed 1,024 tokens
3. **Cost formula fixed**: `input_tokens` from the Bedrock SDK already excludes cache tokens — the old formula double-subtracted them, producing negative costs on cached turns

## Remaining Opportunities for Better Cache Utilization

### High Impact

- **Shared static prefix across stages**: Currently each stage has a different static block, so stage transitions always miss cache. If a common prefix (base rules, response protocol, tone) were extracted into a first `cache_control` block, and stage-specific rules went into a second block, the base prefix would survive stage transitions.
  - Example: `[base rules — cached] [stage rules — cached breakpoint 2] [dynamic — uncached]`
  - The base rules (~600-800 tokens of shared content) would cache across ALL stages

- **Message history caching is already correct**: The second-to-last message approach means growing conversations reuse the cached prefix. This works well for rapid back-and-forth turns (within 5-min TTL).

### Medium Impact

- **Haiku caching is impractical**: The ~4,700 token threshold means classifier/detection prompts can't cache. Not worth padding — Haiku is already cheap ($1/MTok input). Focus caching efforts on Sonnet.

- **TTL awareness**: For users who pause 5+ minutes between messages, the first reply after a pause will always be a cache miss. This is a Bedrock limitation and can't be fixed. Consider this when estimating cost savings.

### Low Impact / Future Research

- **Cross-stage cache sharing via message prefix**: Even if the system prompt changes on stage transition, the conversation history cache breakpoint could still hit if the messages are identical. Need to verify this empirically.

- **Monitoring**: The Neural Monitor dashboard now shows cache hit rates per session. Use this to track the impact of any prompt architecture changes.

## Cost Impact Estimates

Assuming caching works on consecutive same-stage turns (within 5-min TTL):

| Scenario | Cache reads | Savings |
|----------|-----------|---------|
| 5-turn Stage 1 conversation (rapid) | 4 of 5 turns | ~90% input cost on turns 2-5 |
| 10-turn session with stage transitions | ~5 of 10 turns | ~45% input cost overall |
| Session with long pauses (>5 min) | ~1-2 of 10 turns | ~10-20% input cost |

At current prices (Sonnet: $3/MTok input, $0.30/MTok cache read), each cache hit on a 1,500-token system prompt saves ~$0.004. Over thousands of sessions, this compounds.
