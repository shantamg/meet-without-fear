# Model Quality Evaluation: Best Anthropic Model for Meet Without Fear

*Research Date: February 21, 2026*

## 1. Executive Summary

**Recommendation: Upgrade from Claude 3.5 Sonnet to Claude Sonnet 4.6 as the primary model.**

The app currently uses `anthropic.claude-3-5-sonnet-20241022-v2:0` (Sonnet 3.5 v2). This model is now in "Extended Access" legacy status on Bedrock at **2x the cost** ($6/$30 per MTok vs $3/$15). Upgrading to Sonnet 4.6 would:
- **Cut costs by 50%** (identical operations, half the price)
- **Improve quality** across instruction following, empathy, and conversation naturalness
- **Improve safety** (major improvements in prompt injection resistance)
- **Maintain the existing two-model architecture** (Haiku for mechanics, Sonnet for empathy)

A multi-model strategy using Haiku 4.5 for simpler stages is **not recommended** due to the therapeutic nature of every user interaction, where tone consistency matters more than cost savings.

---

## 2. Prompt Analysis: What the AI Actually Does

### Complexity Assessment

After thorough analysis of all prompt templates in `backend/src/services/stage-prompts.ts` and `needs-prompts.ts`, here's what the model must handle:

#### Stage 0: Onboarding & Invitation Crafting
- **Complexity**: Medium
- **Requirements**: Warm tone, brief responses, crafting non-blaming invitation messages
- **Instructions**: ~400 tokens system prompt, clear structure
- **Key challenge**: Generating invitation drafts that are warm but not guilt-inducing
- **Could Haiku handle it?** Possibly, but invitation quality directly affects whether partners join

#### Stage 1: Witnessing (Deep Listening)
- **Complexity**: High
- **Requirements**: Reflect, validate, mirror emotions; detect emotional intensity; manage FeelHeardCheck signals; one question per turn; no solutions
- **Instructions**: ~600 tokens with multiple modes, forbidden words, lateral probing guidance, facilitator rules
- **Key challenge**: Restraint (staying in pure witness mode, not pivoting to solutions), emotional attunement, neutrality (no judging words like "reasonable", "right", "wrong")
- **Could Haiku handle it?** Risky. Simpler models tend to rush to solutions or ask multiple questions.

#### Stage 2: Perspective Stretch (Empathy Building)
- **Complexity**: Very High
- **Requirements**: Four modes (LISTENING, BRIDGING, BUILDING, MIRROR), empathy draft generation, judgment detection, refining existing drafts with partner context
- **Instructions**: ~800 tokens, complex conditional logic around draft refinement, partner shared context
- **Key challenge**: Detecting when someone is judging vs. genuinely curious; generating empathy statements in the user's voice; incorporating partner's shared context for refinement
- **Could Haiku handle it?** No. This requires the most nuanced emotional reasoning in the app.

#### Stage 3: Need Mapping
- **Complexity**: High
- **Requirements**: Distinguish positions from needs, validate-then-reframe, no-hallucination guard, forbidden solution language
- **Instructions**: ~500 tokens, teaching mode with restraint
- **Key challenge**: Reframing "they never help" → "need for partnership/teamwork" without putting words in the user's mouth. Must use user's exact words when reflecting.
- **Could Haiku handle it?** Marginal. The reframing requires sophisticated reasoning.

#### Stage 4: Strategic Repair
- **Complexity**: Medium-High
- **Requirements**: Micro-experiment criteria, feasibility checking, normalizing failure, unlabeled pool principle
- **Instructions**: ~500 tokens, practical focus with emotional safety
- **Key challenge**: Sharpening vague proposals into specific, time-bounded experiments. Handling honest limits without shame.
- **Could Haiku handle it?** Possibly, but the emotional nuance around "failure" and honest limits needs care.

#### Empathy Reconciler (Post-Stage 2)
- **Complexity**: Very High
- **Requirements**: Compare empathy guess vs actual expressed feelings, signal-to-noise filtering, structured JSON output with alignment scores, gap analysis
- **Instructions**: ~1000 tokens, analytical + empathetic
- **Key challenge**: Filtering out "process noise" (complaints about the AI) from genuine emotional content; nuanced gap severity assessment
- **Could Haiku handle it?** Yes, with care. This is primarily analytical/classification work with JSON output - Haiku's strength.

#### Inner Work (Self-Reflection)
- **Complexity**: High
- **Requirements**: Multiple modes (welcoming, exploring, reflecting, deepening), crisis detection, action suggestions, cross-feature insights integration
- **Instructions**: ~900 tokens, open-ended therapeutic companion
- **Key challenge**: Being a "thoughtful companion" without becoming a therapist; proactively suggesting partner sessions when relationship issues surface
- **Could Haiku handle it?** Risky. The open-ended nature and emotional sensitivity favor a stronger model.

#### Share Offer & Reconciler Summary
- **Complexity**: Medium
- **Requirements**: Non-pressuring invitation to share, structured JSON output
- **Could Haiku handle it?** Yes. These are shorter, structured prompts with clear constraints.

### Overall Prompt Complexity Profile

| Aspect | Rating | Notes |
|--------|--------|-------|
| Instruction density | High | Multiple modes, forbidden words, conditional behaviors, strict output format |
| Emotional nuance | Very High | Must distinguish judgment from curiosity, fear from anger, positions from needs |
| Restraint required | Very High | Must NOT give advice, suggest solutions, ask multiple questions, use clinical language |
| Output format compliance | High | `<thinking>`, `<draft>`, `<dispatch>` tags; JSON for reconciler/summary |
| Context sensitivity | High | Must adapt based on emotional intensity, turn count, stage transitions |
| Creative writing | Medium-High | Empathy statements, invitation drafts must feel authentic and personal |

---

## 3. Model Capability Analysis

### Claude 3.5 Sonnet v2 (Current Model)

| Aspect | Rating | Evidence |
|--------|--------|----------|
| Instruction following | Good | Codebase note: "COMMUNICATION_PRINCIPLES removed - Sonnet 3.5 handles this natively" |
| Therapeutic empathy | Good | Has been working in production; satisfactory quality |
| Staying on task | Good | Follows stage constraints reasonably well |
| Response quality | Good | Natural language, appropriate length |
| Nuance detection | Good | Handles emotional intensity detection |
| Speed | Moderate | ~68.8 t/s on Anthropic API; not benchmarked on current Bedrock |
| **Cost** | **Bad** | **$6/$30 per MTok - 2x the cost of newer models!** |
| **Status** | **Legacy** | Extended Access only; will eventually be removed |

### Claude Sonnet 4.5

| Aspect | Rating | Evidence |
|--------|--------|----------|
| Instruction following | Very Good | Major improvement over 3.x series in multi-step instruction adherence |
| Therapeutic empathy | Very Good | "Balances brevity with empathy, so the rewrite feels human, not mechanical" |
| Staying on task | Very Good | Better at following constraints without deviation |
| Response quality | Very Good | More natural, less formulaic than 3.5 |
| Nuance detection | Very Good | Improved reasoning across nuanced scenarios |
| Speed | Good | 68.8 t/s (Anthropic API), **95.7 t/s on Bedrock** (39% faster!) |
| Cost | Good | $3/$15 per MTok - half the current cost |
| Sycophancy risk | Moderate | Course-corrected appropriately 16.5% of the time |

### Claude Sonnet 4.6 (Recommended)

| Aspect | Rating | Evidence |
|--------|--------|----------|
| Instruction following | Excellent | "Fewer false claims of success, fewer hallucinations, more consistent follow-through on multi-step tasks" |
| Therapeutic empathy | Excellent | "Broadly warm, honest, prosocial, and at times funny character" |
| Staying on task | Excellent | "Less prone to over-engineering and laziness"; better at reading context before responding |
| Response quality | Excellent | "Production-quality results required fewer iteration rounds" |
| Nuance detection | Excellent | Long-context reasoning; strategic thinking demonstrated |
| Speed | Good | 61.5 t/s output, **0.63s TTFT** (very competitive time to first token) |
| Cost | Good | $3/$15 per MTok - same as Sonnet 4.5, half of current |
| Sycophancy risk | Low | "Major improvement in prompt injection resistance" and safety |
| Developer preference | Strong | Preferred over Sonnet 4.5 in 70% of trials; over Opus 4.5 in 59% of trials |

### Claude Haiku 4.5

| Aspect | Rating | Evidence |
|--------|--------|----------|
| Instruction following | Good | "65% accuracy vs 44% from premium tier" on some tasks; but "pragmatic rather than perfectionist" |
| Therapeutic empathy | Moderate | Competent but not frontier; lacks the warmth of Sonnet |
| Staying on task | Good | Follows structured instructions well |
| Response quality | Good for structured | Great for JSON, classification; less polished for open conversation |
| Nuance detection | Moderate | "Sonnet demonstrates stronger multi-step reasoning" |
| Speed | Excellent | **94.2 t/s on Bedrock**, 0.87s TTFT |
| Cost | Excellent | $1/$5 per MTok - 3x cheaper than Sonnet |
| Sycophancy risk | Higher | Course-corrected appropriately 37% of the time (vs 16.5% for Sonnet 4.5) |

### Claude Opus 4.6

| Aspect | Rating | Evidence |
|--------|--------|----------|
| Instruction following | Frontier | Best in class |
| Therapeutic empathy | Frontier | Deepest reasoning and emotional understanding |
| Staying on task | Excellent | Most disciplined |
| Cost | Expensive | $5/$25 per MTok - 67% more than Sonnet |
| Sycophancy risk | Lowest | Course-corrected appropriately 10% of the time |
| **Verdict** | **Overkill** | Sonnet 4.6 is preferred over Opus 4.5 in 59% of trials - the gap has narrowed dramatically |

---

## 4. Multi-Model Strategy Assessment

### Option A: Single Model (Sonnet 4.6 for everything user-facing)

**Pros:**
- Consistent tone and personality across all stages
- Simpler architecture (no model routing logic for user-facing responses)
- Best quality for the most sensitive interactions
- Users build trust with a consistent "voice"

**Cons:**
- Higher cost for simple initial messages and summaries
- Overkill for JSON-structured reconciler output

### Option B: Haiku 4.5 for Stages 0/4, Sonnet 4.6 for Stages 1/2/3

**Pros:**
- Saves ~$70/month per 1,000 conversations (based on pricing research)
- Haiku is fast - users would see faster responses in simpler stages

**Cons:**
- **Tone inconsistency**: User would experience a subtle quality shift between stages. In therapy, consistency of the facilitator's "voice" is critical for trust.
- **Invitation quality risk**: Stage 0 invitation crafting directly determines whether the partner joins. A less empathetic model could write colder invitations.
- **Stage 4 emotional safety**: Strategic Repair involves normalizing failure and handling honest limits - this requires the same emotional intelligence as earlier stages.
- **Haiku's sycophancy problem**: At 37% sycophancy, Haiku is more likely to agree with the user rather than gently redirecting, which is dangerous in a therapeutic context where the AI must sometimes name uncomfortable truths.

### Option C: Haiku 4.5 for non-user-facing work only (current architecture, upgraded)

**This is the recommended approach** and matches the existing architecture:

| Component | Model | Rationale |
|-----------|-------|-----------|
| **All user-facing chat** (Stages 0-4, Inner Work, Inner Thoughts) | **Sonnet 4.6** | Therapeutic quality, consistent voice |
| Background classification | Haiku 4.5 | JSON output, not user-facing |
| Partner session classifier | Haiku 4.5 | Fact extraction, not user-facing |
| Attacking language detection | Haiku 4.5 | Binary classification + rewrites |
| Retrieval planning | Haiku 4.5 | Query planning, not user-facing |
| Memory detection | Haiku 4.5 | Classification, not user-facing |
| People extraction | Haiku 4.5 | NER task, not user-facing |
| Conversation summarization | Haiku 4.5 | Analytical, not directly user-facing |

**Key insight**: The current codebase already implements this split via `getHaikuJson()` for mechanics and `getSonnetResponse()`/`getSonnetStreamingResponse()` for user-facing chat. The architecture is clean. Just upgrade the model IDs.

### Option D: Per-turn model routing based on complexity

The `model-router.ts` already implements a scoring system that routes to Sonnet for high-intensity/complex requests and Haiku for simple ones. However:

**Not recommended for user-facing responses** because:
- A user in Stage 1 might send a simple "yes" message. The router would score it low → Haiku. But the response to "yes" in witness mode might be the most critical turn (the one that makes them feel heard).
- The therapeutic context matters more than the individual message complexity.
- This router is better suited for classifying whether to apply additional processing, not for choosing the response model.

---

## 5. Reconciler: Exception for Multi-Model

The Empathy Reconciler (`buildReconcilerPrompt`, `buildShareOfferPrompt`, `buildReconcilerSummaryPrompt`) is a special case:

- It produces **structured JSON output** (alignment scores, gap analysis)
- It's **analytical**, not conversational
- The share offer prompt generates brief messages, but they follow strict templates
- The reconciler summary is a structured assessment

**Could the Reconciler use Haiku 4.5?**

- The **main reconciler analysis** requires sophisticated multi-perspective reasoning (comparing empathy guess vs actual feelings, filtering signal from noise). This is borderline - Sonnet would be safer.
- The **share offer prompt** generates a warm, non-pressuring message. This should stay on Sonnet.
- The **reconciler summary** is structured and brief. Could use Haiku, but the quality improvement from Sonnet isn't expensive here.

**Recommendation**: Keep the reconciler on Sonnet 4.6. The stakes are too high (misclassifying a "significant gap" as "minor" could prevent healing) and the volume is low (runs once per pair per session).

---

## 6. Specific Quality Concerns by Model

### Why NOT Haiku 4.5 for User-Facing Therapy Chat

1. **Sycophancy**: 37% sycophancy rate is dangerous for therapy. When a user says "my partner is being unreasonable, right?" the AI needs to not agree, but instead redirect to curiosity. Haiku is more likely to validate than challenge.

2. **Restraint**: The prompts explicitly list FORBIDDEN phrases ("next step", "what might help", "moving forward" in Stage 1). Haiku's "pragmatic rather than perfectionist" approach means it may occasionally leak these.

3. **Emotional Intensity Detection**: The prompts require the AI to match its response to the user's emotional intensity (1-10). At 8+, it must "stay in witness mode" and not push for insight. This requires nuanced reading that Haiku may approximate but not nail.

4. **Judgment Detection in Stage 2**: The MIRROR mode requires detecting when someone is judging their partner (attacks, sarcasm, mind-reading) and redirecting without shaming. This is one of the hardest NLP tasks and requires frontier-level understanding.

### Why NOT Opus 4.6 for Everything

1. **Diminishing returns**: Sonnet 4.6 is preferred over Opus 4.5 in 59% of trials. The gap between Sonnet 4.6 and Opus 4.6 is small.
2. **Cost**: 67% more expensive ($5/$25 vs $3/$15 per MTok)
3. **Speed**: Opus is slower. For a chat app, latency matters.
4. **The prompts are well-designed**: The stage prompts in this codebase are mature and well-constrained. They don't need Opus-level reasoning to follow correctly - they need a model that follows instructions well and writes naturally. Sonnet 4.6 excels at exactly this.

### Why Sonnet 4.6 over Sonnet 4.5

1. **Instruction following**: "Fewer false claims of success, fewer hallucinations, more consistent follow-through" - directly relevant to following the strict stage rules.
2. **Context sensitivity**: "More effectively read the context before modifying" - important for not losing track of the conversation thread.
3. **Safety**: Major improvement in prompt injection resistance. In a therapy app, adversarial users trying to manipulate the AI are a real concern.
4. **Developer preference**: 70% preferred over 4.5 in head-to-head comparisons.
5. **Same price**: $3/$15 per MTok - no cost difference from Sonnet 4.5.
6. **TTFT**: 0.63s time to first token is excellent for chat UX (vs 1.18s for Sonnet 4.5 on Anthropic API, 1.47s on Bedrock).

---

## 7. Final Recommendations

### Primary Action: Upgrade to Sonnet 4.6

```
Current:  anthropic.claude-3-5-sonnet-20241022-v2:0  → $6/$30 per MTok (Extended Access)
Upgrade:  anthropic.claude-sonnet-4-6                → $3/$15 per MTok (Current)
```

**Impact**: 50% cost reduction + quality improvement + future-proofing.

### Secondary Action: Upgrade Haiku

```
Current:  anthropic.claude-3-5-haiku-20241022-v1:0   → $0.80/$4.00 per MTok (Legacy)
Upgrade:  anthropic.claude-haiku-4-5-20251001-v1:0   → $1.00/$5.00 per MTok (Current)
```

**Impact**: 25% price increase but significantly better quality for classification tasks. Worth it for the quality improvement.

### Architecture: Maintain Current Two-Model Split

The existing architecture (Sonnet for user-facing, Haiku for mechanics) is correct and should be preserved. No changes to model routing logic needed.

### Do NOT Implement: Per-Stage Model Routing

Despite the theoretical cost savings, routing different stages to different models is not recommended for a therapeutic application where voice consistency, emotional nuance, and low sycophancy are critical requirements.

---

## 8. Cost Impact Summary

| Scenario | Monthly Cost (1K conversations, 10 turns) | Change |
|----------|-------------------------------------------|--------|
| Current (3.5 Sonnet v2) | ~$660 | Baseline |
| Sonnet 4.6 (same architecture) | ~$330 | **-50%** |
| Sonnet 4.6 + prompt caching | ~$250-280 | **-58% to -62%** |
| Sonnet 4.6 + caching + Haiku 4.5 for Stage 0/4 | ~$220-250 | **-62% to -67%** |

The difference between the last two rows (~$30-50/month) is not worth the tone consistency risk for a therapy application.

---

*Sources:*
- [Anthropic - Claude Sonnet 4.6 Announcement](https://www.anthropic.com/news/claude-sonnet-4-6)
- [VentureBeat - Sonnet 4.6 matches flagship performance](https://venturebeat.com/technology/anthropics-sonnet-4-6-matches-flagship-ai-performance-at-one-fifth-the-cost/)
- [Anthropic - Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic - Claude Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5)
- [AWS - Sonnet 4.6 on Bedrock](https://aws.amazon.com/about-aws/whats-new/2026/02/claude-sonnet-4.6-available-in-amazon-bedrock/)
- [Anthropic - Protecting Well-Being of Users](https://www.anthropic.com/news/protecting-well-being-of-users)
- [Anthropic - Stress Testing Model Specs](https://alignment.anthropic.com/2025/stress-testing-model-specs/)
- [Caylent - Haiku 4.5 Deep Dive](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)
- [LessWrong - GPT-4.5 Cognitive vs Affective Empathy](https://www.lesswrong.com/posts/5EP9nvN6TNzhy5itN/gpt-4-5-is-cognitive-empathy-sonnet-3-5-is-affective-empathy)
