# Devil's Advocate: Critical Analysis of Optimization Proposals

*February 21, 2026*

This document challenges each optimization proposal on its merits, identifies risks the other reports glossed over, and recommends a sequencing strategy that separates the bold bets from the cautious ones.

---

## 1. Model Upgrade: Sonnet 3.5v2 → Sonnet 4.6

### What's genuinely good
- The pricing case is airtight: 3.5v2 is now in "Extended Access" at **2x the cost** ($6/$30 vs $3/$15). Staying on 3.5v2 is literally paying double for a model Anthropic wants you to stop using. This isn't optional optimization — it's avoiding a tax.
- Sonnet 4.6 is 4 generations newer. The raw capability gap is real.

### What could go wrong

**The app was tuned for 3.5v2's personality.** Every stage prompt, every example question, every response protocol tag was tested against 3.5v2 behavior. Newer Sonnet models (4.x family) are significantly more "instruction-following" and may be:
- **More literal and less warm.** 3.5v2 had a particular conversational warmth that therapy responses depend on. Sonnet 4.x models are optimized for coding and tool use — their empathetic tone may feel different. Nobody has tested this.
- **More verbose or more terse.** The prompts assume a certain response length and structure. A model that produces longer responses increases output token costs (output is 5x more expensive than input). A model that's too concise may feel dismissive in a therapy context.
- **Different at parsing micro-tags.** The `<thinking>`, `<draft>`, `<dispatch>` response protocol is a custom format. Different models parse/generate these differently. A model that occasionally breaks the tag format will cause parsing failures and broken UI.

**No model quality evaluation exists.** The research file `/model-quality-evaluation.md` doesn't exist. This means nobody on the team has actually compared the two models on therapy-relevant outputs. We're making this decision on pricing data alone.

**Rollback complexity.** If Sonnet 4.6 produces worse therapy responses, rolling back means going back to 2x pricing. That's a terrible position — paying double because you didn't test first.

### Risk rating: MEDIUM-HIGH (cost case is strong, but quality is untested)

### Recommendation
- **Don't ship the model upgrade without an A/B quality evaluation.** Generate 20-30 responses across all stages with both models using identical prompts and conversation context. Have someone (ideally the founder/therapist advisor) blind-rate them.
- The pricing alone justifies urgency, but a 1-2 day quality check is cheap insurance against degraded therapy quality.
- **Have a Sonnet 4.5 fallback plan.** If 4.6 has rough edges, Sonnet 4.5 is the same price and has been available since September 2025 — it has a longer track record.

---

## 2. Prompt Caching

### What's genuinely good
- The architecture is a textbook match: static system prompt + growing message history is *the* documented use case for prompt caching.
- 90% savings on cached tokens is transformative. The math works.
- Implementation is straightforward — add `cachePoint` markers to the existing Converse API calls.

### What could go wrong

**The 5-minute TTL is more fragile than the report suggests.**
- Therapy conversations have natural pauses. A user reads a long AI response, reflects, types a thoughtful reply — this can easily take 5+ minutes.
- When the cache expires, the next request pays a **1.25x write premium** to re-populate it. So a cache miss isn't just "back to normal cost" — it's **25% MORE expensive** than no caching at all.
- If users frequently pause >5 minutes, the amortized savings drop significantly. The report assumes continuous chatting, which may not match real usage patterns.

**The 1-hour TTL isn't free either.** It costs 2x base input for writes (vs 1.25x for 5-min). For conversations with frequent cache misses, 1-hour TTL might actually be more expensive than 5-minute TTL if the conversations are short enough that the extra write cost isn't amortized.

**The 20-block lookback limit is a real constraint.** The report mentions it but waves it away. With the current architecture sending user messages prefixed with formatted context blocks, a "message" in Bedrock's content block model might be multiple blocks. 20 blocks might correspond to fewer than 20 conversational turns. This needs testing.

**Concurrent requests for the same user.** Both partners in a session are active simultaneously. If Partner A sends a message while Partner B's response is still streaming, the cache may not be populated yet. The report notes "A cache entry only becomes available after the first response begins" — but with SSE streaming, "begins" may mean the first chunk, not completion. This needs clarification.

**SDK type compatibility.** The `cachePoint` field may not be in the TypeScript types for the current SDK version (3.958.0). The feature was added to Bedrock in 2025, but TypeScript type definitions can lag behind. This could mean `@ts-ignore` annotations or SDK upgrades that bring other breaking changes.

### Risk rating: LOW-MEDIUM (well-understood technology, but TTL behavior needs real-world validation)

### Recommendation
- **Ship it, but with cost tracking.** Add `cacheReadInputTokens` and `cacheWriteInputTokens` to the existing telemetry. Monitor cache hit rates in production before making architectural decisions based on assumed savings.
- **Start with 5-minute TTL.** Don't pay the 2x write premium for 1-hour TTL until you have data showing users frequently pause >5 minutes.
- **Test the 20-block lookback** with real conversation payloads to understand actual block counts.

---

## 3. Keeping More Conversation History

### What's genuinely good
- Raw history preserves exact words, emotional inflection, and conversational arc that summaries lose.
- With caching, the marginal cost of including more history is ~10% of the original cost. The economic argument is sound.
- The current trimming (4-5 turns) is extremely aggressive and almost certainly loses important context.

### What could go wrong — and this is where I push hardest

**More tokens ≠ more understanding.** LLMs have a well-documented "lost in the middle" phenomenon where information in the middle of long contexts gets less attention than information at the beginning or end. A 30-turn conversation with the important emotional breakthrough at turn 5 might actually get WORSE responses with full history than with a summary that highlights that breakthrough.

**Raw conversation history is noisy.** The notable facts system was built for a reason. A real therapy conversation includes:
- Greetings and small talk ("Hi, I'm back" / "How are you?")
- Failed starts and corrections ("Well, not exactly, what I mean is...")
- Repetitive circling around the same topic
- The AI's own lengthy responses (which dominate token count but add nothing to understanding)
- System messages and formatting artifacts

A curated fact like "Partner feels unheard about child-rearing decisions" is worth 50 tokens. The raw 5-turn exchange that produced that insight is worth 500+ tokens. With caching, the cost difference is smaller — but the ATTENTION cost (the model's ability to focus on what matters) is the same.

**The summarization captures things raw history doesn't make explicit:**
- `emotionalJourney`: The arc from defensive → vulnerable → open
- `unresolvedTopics`: What was raised but never addressed
- `openQuestions`: What the AI should follow up on
- `agreedFacts`: What both partners have confirmed

These are ANALYTICAL artifacts, not just compressed versions of the conversation. You can't get `unresolvedTopics` from raw history without doing the summarization work.

**Longer context windows increase latency.** Even with caching reducing cost, the model still processes the full context for attention computation. More tokens = slower time-to-first-token and slower total response time. For a chat app where responsiveness matters, this is a real UX concern.

### Risk rating: MEDIUM (the cost argument is valid, but quality impact is genuinely uncertain)

### Recommendation
- **Don't remove summarization. Expand history AND keep summaries.** The right answer is not "raw history instead of summaries" — it's "raw history for recent context + summaries for analytical insight."
- **Increase the turn buffer from 4-5 to 10-12** as a first step. This doubles the context window with known, manageable cost increases. Don't jump to "keep everything."
- **Keep notable facts.** They serve a fundamentally different purpose than raw history (see Section 4).
- **Measure response latency** with different history sizes to find the sweet spot.

---

## 4. Reducing Reliance on Summarization/Retrieval

### What's genuinely good
- The current system has a lot of moving parts (summarization, fact extraction, embedding, retrieval) that each add latency, complexity, and potential failure points.
- Simplifying the architecture has intrinsic value — fewer things to break, test, and maintain.

### What should NOT be reduced

**Notable facts are CURATED INTELLIGENCE, not just compressed history.** They are:
- **Categorized** (Emotional, People, Logistics, Conflict, History) — giving the model structured context
- **Incrementally updated** — old irrelevant facts get replaced via the diff-based upsert/delete mechanism
- **Session-scoped** — limited to 20 per session, preventing unbounded growth
- **Cross-session portable** — facts from Session 1 can inform Session 3 (when cross-session retrieval is re-enabled)

Raw history cannot replicate this. A 30-turn conversation might mention the partner's mother three times in passing. The fact "Partner's mother is a source of tension in the relationship" captures the PATTERN across mentions. Raw history just has three scattered references.

**Summarization captures the emotional arc.** The `emotionalJourney` field tracks how the user moved from one emotional state to another across the conversation. This is therapeutic gold — the AI can say "Earlier you seemed defensive about this, but you've really opened up" because the summary explicitly tracks this. Raw history requires the model to infer this, and with 30+ messages, inference becomes unreliable.

**The retrieval system has strategic value for the future.** Cross-session retrieval and global facts are currently disabled pending consent UI. When they're re-enabled, the fact-ledger architecture will be essential for multi-session continuity. Ripping it out now to save complexity would create technical debt.

### Risk rating: HIGH (removing working intelligence systems is a one-way door)

### Recommendation
- **Keep notable facts unconditionally.** The Haiku extraction cost is trivial ($0.001/call, fire-and-forget) and the value is high.
- **Keep summarization but increase the trigger threshold.** Currently triggers at 30 messages OR 3,500 tokens (the token threshold is too low). Raise the message threshold to 40-50 and remove the token trigger — let the summary capture more conversation before summarizing.
- **Reduce the ARCHITECTURE of retrieval without removing the DATA.** Simplify the retrieval pipeline (fewer hops, less planning) but keep the fact extraction and summary generation.

---

## 5. Prompt Redesign + Caching (Ship Together)

### What's genuinely good
- The math is compelling: redesigned Stage 1 cached ($1.52/1K calls) is cheaper than current Stage 1 uncached ($2.37/1K calls). Bigger prompts cost less with caching.
- The redesigned prompts look genuinely better — phase-aware guidance, example-driven instructions, and edge case handling (guarded users, disengagement).

### What could go wrong

**Two big changes at once violate the "change one thing at a time" principle.**
- If therapy response quality changes (better or worse), you won't know if it was the prompt redesign or the caching implementation.
- If costs don't match projections, you won't know if it's cache miss rates or prompt size increases.
- If parsing breaks, you won't know if the new prompt format confuses the model or if the caching changes the model's behavior.

**The redesign hasn't been tested with Sonnet 4.6.** The prompts were presumably written and tested against 3.5v2. If you're ALSO changing the model (proposal #1), you now have THREE simultaneous changes: new model + new prompts + caching. This is a recipe for undiagnosable quality regressions.

**The "static vs dynamic" token split may not be as clean as reported.** The analysis shows Stage 1 at 76% cacheable, but this depends on the `cachePoint` placement. If the dynamic content (user names, turn count, intensity) is interpolated throughout the prompt rather than at the end, the cacheable prefix is shorter than reported. The prompts use `${context.userName}` and `${context.partnerName}` in multiple locations — each interpolation breaks the cache prefix.

**Cache invalidation on stage transitions.** When a user transitions from Stage 1 to Stage 2, the entire system prompt changes. The Stage 1 cache is worthless for Stage 2. During the critical transition moment (where the AI's first response in the new stage sets the tone), there's no cache — you pay full price plus the write premium.

### Risk rating: MEDIUM (the cost math works, but the coupling risk is real)

### Recommendation
- **Ship caching first (without the prompt redesign).** Get cache hit rate data from production. Validate the cost model.
- **Then ship the prompt redesign on the existing model (3.5v2 or the upgraded model, whichever has been validated).** Measure response quality changes in isolation.
- **OR, if you insist on shipping together:** At minimum, add feature flags so you can disable caching independently of the prompt redesign. Log enough telemetry to diagnose issues.

---

## 6. Multi-Model Strategy (Haiku for Simple, Sonnet for Complex)

### What's genuinely good
- The current model router already does this: Haiku handles classification, fact extraction, and JSON output; Sonnet handles empathetic responses. This is a proven pattern.
- Haiku 4.5 at $1/$5 is 3x cheaper than Sonnet at $3/$15 for tasks that don't need frontier quality.

### What could go wrong

**The current router almost always picks Sonnet for partner sessions.** The mediation flag alone scores +4, which hits the Sonnet threshold. The Haiku path for partner sessions is almost never triggered. Expanding Haiku's role means changing the router thresholds, which means some responses that currently get Sonnet quality would get Haiku quality.

**Personality discontinuity in a therapy context.** If the AI suddenly sounds different (more mechanical, less warm, different word choices) because it switched from Sonnet to Haiku for a "simple" interaction, users will notice. In therapy, consistency of the relationship is important — the AI is playing the role of a facilitator, and facilitators don't change personality mid-session.

**What counts as "simple" is deceptive in therapy.** A user saying "yeah I guess" might look like a simple acknowledgment to a classifier, but a skilled therapist knows it could signal resignation, avoidance, or passive agreement. Routing this to Haiku because it's "simple" could miss the emotional subtext.

**Testing burden multiplies.** Each model has its own behavioral characteristics. Testing Stage 1 with Sonnet AND Haiku means double the test cases. The E2E test suite (already 8-12 minutes with real AI) would need to cover both paths.

### Risk rating: LOW (the current router is fine; don't fix what isn't broken)

### Recommendation
- **Keep the current model split**: Haiku for mechanical tasks (classification, extraction, summarization), Sonnet for all user-facing responses. Don't expand Haiku into partner-facing responses.
- **Upgrade Haiku 3.5 → Haiku 4.5** when upgrading Sonnet. The $0.80/$4.00 → $1.00/$5.00 price increase is modest, and Haiku 4.5 is substantially better at structured output.

---

## Cross-Cutting Concern: Should We Keep Running Facts + Summarization Even With Full History?

**YES. Emphatically yes.** Here's why:

### Different tools for different jobs

| System | What it captures | Why raw history can't replace it |
|--------|-----------------|--------------------------------|
| **Notable facts** | Curated, categorized, incrementally updated insights | Raw history has the data but not the synthesis. The model would need to re-extract patterns every turn. |
| **Running summary** | Emotional arc, unresolved topics, open questions, agreements | These are ANALYTICAL conclusions, not just compressed text. They require inference that degrades in long contexts. |
| **Raw history** | Exact words, emotional tone, conversational flow | Provides the "feel" of the conversation but not the "meaning." |

### The cost of keeping all three is trivial
- Fact extraction: 1 Haiku call per turn, fire-and-forget. ~$0.001 per call.
- Summarization: 1 Haiku call per 20-30 messages, fire-and-forget. ~$0.002 per call.
- These are rounding errors compared to the Sonnet calls for the main response.

### The hybrid is strictly better
With caching:
1. System prompt (cached) → stable cost
2. Summary + facts (injected into context, cached after first use) → almost free
3. Raw history (cached prefix grows each turn) → 90% cheaper
4. New message → full price (but it's one message)

You get the best of both worlds: the AI sees the raw conversation AND has the curated analytical context. The summary tells it "here's what matters" and the raw history lets it verify and add nuance.

---

## Final Recommendation: What to Do Boldly vs. Cautiously

### DO BOLDLY (high confidence, clear wins)

1. **Implement prompt caching** — low implementation risk, high cost savings, well-documented pattern. Ship it this week.
2. **Upgrade Haiku 3.5 → Haiku 4.5** — mechanical tasks will work fine or better. No therapy quality risk.
3. **Add cache hit rate and cost telemetry** — you need data before making further decisions.

### DO CAUTIOUSLY (validate before committing)

4. **Upgrade Sonnet 3.5v2 → Sonnet 4.6** — run a quality evaluation first (20-30 therapy responses, blind-rated). The pricing pressure is real but a 2-day quality check is worth it. Have Sonnet 4.5 as a fallback.
5. **Increase conversation history buffer** — go from 4-5 turns to 10-12, not to "keep everything." Monitor response quality and latency.
6. **Ship the prompt redesign** — but AFTER caching is stable and the model upgrade is validated. Don't change three things at once.

### DON'T DO (or defer indefinitely)

7. **Don't remove notable facts or summarization.** They serve a different purpose than raw history and cost almost nothing.
8. **Don't expand Haiku into partner-facing responses.** The quality risk isn't worth the savings.
9. **Don't ship caching + prompt redesign + model upgrade simultaneously.** You'll never debug what went wrong.

### Recommended Sequencing

```
Week 1: Implement prompt caching on current model (3.5v2)
         Add cost/cache telemetry
         Run model quality evaluation (3.5v2 vs 4.6 vs 4.5)

Week 2: Review cache hit rates and cost data
         If quality evaluation passes → upgrade to Sonnet 4.6
         Upgrade Haiku 3.5 → Haiku 4.5
         Increase turn buffer from 4-5 to 10-12

Week 3: Ship prompt redesign (on validated model + caching)
         Monitor response quality and turn counts

Ongoing: Keep facts + summarization
         Re-enable cross-session retrieval when consent UI ships
```

---

## Summary of Risk Assessments

| Proposal | Risk | Confidence in Savings | Confidence in Quality | Ship Timing |
|----------|------|----------------------|----------------------|-------------|
| Prompt caching | LOW-MEDIUM | HIGH (90% on cache hits) | HIGH (no quality impact) | Now |
| Haiku 3.5 → 4.5 | LOW | MEDIUM (slight cost increase) | HIGH | Now |
| Sonnet 3.5v2 → 4.6 | MEDIUM-HIGH | HIGH (50% savings) | UNKNOWN (untested) | After evaluation |
| More history | MEDIUM | HIGH (cheap with caching) | UNCERTAIN (noise vs signal) | Gradual increase |
| Prompt redesign | MEDIUM | HIGH (with caching) | LIKELY GOOD (but untested with new model) | After model validated |
| Remove facts/summaries | HIGH | LOW (trivial cost savings) | NEGATIVE (loses curated intelligence) | Never |
| Haiku for partner responses | LOW | MEDIUM (3x cheaper) | RISKY (personality discontinuity) | Don't |
