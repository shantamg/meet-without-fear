# Prompt Redesign Branch: Caching Impact Analysis

## Summary

The `prompt-redesign` branch significantly rewrites Stage 1 and Stage 2 prompts to improve AI response quality. Prompts grow larger (Stage 1: +104%, Stage 2: +46%), but the new content is overwhelmingly **static** — making it an ideal candidate for prompt caching. With caching enabled, the redesigned prompts would cost nearly the same as the current uncached prompts.

---

## What Changed

### Files Modified
- `backend/src/services/stage-prompts.ts` (1535 → 1662 lines)
- `backend/src/services/dispatch-handler.ts` (new `EXPLAIN_EMPATHY_PURPOSE` dispatch)
- `backend/src/services/__tests__/stage-prompts.test.ts` (updated assertions)

### Structural Changes

| Component | Main | Redesign | Change |
|-----------|------|----------|--------|
| `SIMPLE_LANGUAGE_PROMPT` | 2 lines ("Warm, clear, direct") | 10 lines with "Instead of → Say" examples | +133 tokens |
| `PINNED_CONSTITUTION` | Bullet-list format | Rewritten with "Ground rules:" framing | +15 tokens |
| `NEUTRALITY_GUIDANCE` | Did not exist | **New** 3-layer neutrality framework (feelings → interpretations → characterizations) | +237 tokens |
| `STAGE1_LISTENING_RULES` | Used `FACILITATOR_RULES` | **New** detailed gathering/reflecting phase system | +509 tokens |
| `STAGE1_QUESTION_TEMPLATES` | 5 example questions | Rewritten to 5 different examples | ~0 tokens |
| `STAGE2_PURPOSE_CONTEXT` | Did not exist | **New** "why this step exists" explanation block | +305 tokens |
| Stage 1 prompt body | Generic "Witness stage" | Phase-aware guidance (gathering vs reflecting vs high-intensity) | +208 tokens |
| Stage 2 prompt body | 4 modes + basic guidance | 4 modes + purpose context + "I don't know" handling + disengagement recovery | +305 tokens |
| Stage 3/4 prompt bodies | Unchanged | Unchanged | 0 tokens |
| Dispatch handler | 2 dispatch types | **New** `EXPLAIN_EMPATHY_PURPOSE` with AI-generated response + fallback | N/A (separate call) |

### Philosophy Shift

The redesign moves from **terse instruction-style prompts** to **conversational, example-driven prompts**:

- **Old Stage 1**: "Witness stage. Help [user] feel fully heard. Focus: Reflect and validate."
- **New Stage 1**: "You're here to listen to [user]... GATHERING PHASE (early)... REFLECTING PHASE (after you have a real picture)... AT ANY POINT..."

The new prompts read like coaching notes from an experienced facilitator rather than bullet-point instructions. This is more verbose but should produce noticeably better AI behavior, especially for edge cases (guarded users, high-intensity moments, disengagement).

---

## Token Count Estimates (System Prompt Per API Call)

| Stage | Main Branch | Redesign Branch | Delta | % Increase |
|-------|------------|-----------------|-------|------------|
| Stage 1 (Witness/Listen) | ~790 tokens | ~1,612 tokens | +822 | +104% |
| Stage 2 (Perspective Stretch) | ~1,248 tokens | ~1,826 tokens | +578 | +46% |
| Stage 3 (Need Mapping) | ~896 tokens | ~1,064 tokens | +168 | +19% |
| Stage 4 (Strategic Repair) | ~983 tokens | ~1,151 tokens | +168 | +17% |

**Note**: These are system prompt tokens only. Conversation history tokens are the same in both branches.

---

## Caching Interaction Analysis

### What's Cacheable vs Dynamic

The prompt structure is: `[static base] + [static stage instructions] + [dynamic user-specific interpolation]`

**Static (cacheable) content** — identical across all users for a given stage:
- `SIMPLE_LANGUAGE_PROMPT` (all stages)
- `PINNED_CONSTITUTION` (all stages)
- `PRIVACY_GUIDANCE` (all stages)
- `INVALID_MEMORY_GUIDANCE` (all stages)
- `NEUTRALITY_GUIDANCE` (Stage 1 only — **NEW**)
- `STAGE1_LISTENING_RULES` (Stage 1 only — **NEW**)
- `STAGE2_PURPOSE_CONTEXT` (Stage 2 only — **NEW**)
- `FACILITATOR_RULES` (Stages 2-4)
- Stage-specific mode descriptions, forbidden lists, micro-experiment criteria
- `buildResponseProtocol()` output (stage-dependent but user-independent)

**Dynamic (uncacheable) content** — changes per user/turn:
- `${context.userName}`, `${context.partnerName}` interpolations (~10-20 occurrences)
- `${context.turnCount}`, `${context.emotionalIntensity}`
- Phase guidance conditionals (gathering vs reflecting based on turn count)
- Empathy draft content (Stage 2 refinement flow)
- `PROCESS_OVERVIEW` (conditionally injected)

### Static vs Dynamic Token Split

| Stage | Static Tokens | Dynamic Tokens | Cache Hit Rate |
|-------|--------------|----------------|----------------|
| Main Stage 1 | ~350 | ~440 | ~44% |
| **Redesign Stage 1** | **~1,229** | **~383** | **~76%** |
| Main Stage 2 | ~350 | ~898 | ~28% |
| **Redesign Stage 2** | **~788** | **~1,038** | **~43%** |

The redesign dramatically increases the cacheable portion, especially for Stage 1 where nearly all new content is static instructional text.

### Natural Cache Breakpoints

The redesigned prompts have excellent natural breakpoints for cache markers:

1. **Breakpoint 1: After base system prompt** (~571 tokens)
   - `SIMPLE_LANGUAGE_PROMPT` + `PINNED_CONSTITUTION` + `PRIVACY_GUIDANCE` + `INVALID_MEMORY_GUIDANCE`
   - Shared across ALL stages — highest reuse

2. **Breakpoint 2: After stage-specific rules** (Stage 1: ~1,229 tokens; Stage 2: ~788 tokens)
   - Includes `NEUTRALITY_GUIDANCE`, `STAGE1_LISTENING_RULES`, etc.
   - Shared across all users in the same stage

3. **Breakpoint 3: After response protocol** (last ~200 tokens of static content)
   - `buildResponseProtocol()` output
   - Stage-specific but user-independent

**Recommendation**: Place `cache_control` markers at breakpoint 2 (after stage rules) for maximum benefit. This caches the bulk of the static content while keeping the dynamic tail (user names, turn count, draft content) uncached.

---

## Cost Impact Modeling

### Per-API-Call Cost (System Prompt Only)

Using Anthropic's Sonnet pricing ($3/M input tokens, 90% cache discount):

| Scenario | Stage 1 Cost/1K Calls | Stage 2 Cost/1K Calls |
|----------|-----------------------|-----------------------|
| Main (no cache) | $2.37 | $3.74 |
| Redesign (no cache) | $4.84 (+104%) | $5.48 (+46%) |
| Main (cached) | $1.43 | $2.80 |
| **Redesign (cached)** | **$1.52** | **$3.35** |

### Key Insight

**Redesign + caching is cheaper than current main without caching.**

- Stage 1: Redesign cached ($1.52) vs Main uncached ($2.37) = **36% cheaper**
- Stage 2: Redesign cached ($3.35) vs Main uncached ($3.74) = **10% cheaper**

The redesign adds ~800 tokens to Stage 1, but with caching, those 800 tokens cost only ~80 tokens worth. Meanwhile, the quality improvements from detailed phase-aware instructions likely reduce the need for follow-up turns (fewer "the AI misunderstood me" corrections), which saves entire API calls.

### Scaling Impact

For a typical session with 2 users × ~10 turns in Stage 1 = 20 API calls:
- Main (no cache): 20 × $0.00237 = $0.0474
- Redesign (no cache): 20 × $0.00484 = $0.0968 (+104%)
- **Redesign (cached): 20 × $0.00152 = $0.0304 (-36% vs main uncached)**

---

## Caching Effectiveness Rating

| Factor | Score | Notes |
|--------|-------|-------|
| Static content ratio | 9/10 | 76% cacheable for Stage 1, 43% for Stage 2 |
| Natural breakpoints | 8/10 | Clear layered structure (base → stage rules → dynamic) |
| Cross-user reuse | 9/10 | Stage prompts are identical across all users |
| Cross-turn reuse | 7/10 | Turn count and intensity change, but most content is stable |
| Overall caching fit | **8.5/10** | Redesigned prompts are almost purpose-built for caching |

---

## Recommendations

1. **Merge the redesign with confidence** — the larger prompts are a quality win, and caching neutralizes the cost increase. With caching, the redesign is actually *cheaper* than the current approach without caching.

2. **Implement caching BEFORE or WITH the merge** — without caching, the redesign doubles Stage 1 costs. The two changes are complementary and should ship together.

3. **Place cache markers after stage-specific rules** (breakpoint 2) — this captures 76% of Stage 1 tokens and 43% of Stage 2 tokens in the cache.

4. **Consider the dispatch handler addition** — the new `EXPLAIN_EMPATHY_PURPOSE` dispatch makes a separate AI call when triggered. This is an extra API call but only fires when users explicitly ask "why am I doing this?" — likely <5% of turns.

5. **Monitor turn counts post-merge** — if the better prompts reduce average turns per stage (by getting the AI response right the first time), the per-session cost could decrease even with larger prompts.
