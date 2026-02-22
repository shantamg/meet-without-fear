# Freshness Review: Proposed Prompt Redesigns

> Reviewed by Freshness Guard. The gold standard question: "If you were writing instructions for a naturally empathetic, incredible listener who'd never done this specific process before — what would you tell them?"

---

## Overall Verdict

**Stage 1: Mostly fresh.** The gathering-then-reflecting redesign is genuinely new thinking, not a patch job. A few areas need trimming.

**Stage 2: Mixed.** The purpose explanation (`STAGE2_PURPOSE_CONTEXT`) is excellent. But the prompt as a whole is over-engineered — too many mechanisms solving the same problem, too many example phrases, and some sections that feel like direct responses to complaints.

---

## 1. PATCHING (Does it look like the old prompt was edited?)

### Stage 1 — Mostly Clean

The core redesign (gathering → reflecting phases) is genuinely new architecture. It doesn't feel like someone took the old "reflect → validate → one next move" and added disclaimers.

**One concern:** The `FORBIDDEN` list in `buildStage1Prompt` is carried almost verbatim from the old prompt:

> Old: `FORBIDDEN in Stage 1: "next step", "what might help", "what you could try", "moving forward", "first small step"`
> New: `FORBIDDEN in this stage: "next step", "what might help", "what you could try", "moving forward", "first small step", "have you considered"`

Same list, same structure, one addition. This is literal carryover, not fresh writing. A from-scratch prompt would give a principle ("You're here to listen, not fix") and trust the model to apply it — which the new prompt already does in the same line! The principle makes the word list redundant.

### Stage 2 — Borderline

The `WHAT NOT TO DO` section maps almost 1:1 to feedback items:

| Feedback | WHAT NOT TO DO rule |
|----------|-------------------|
| "Adding too much of its own opinion" | "Don't state psychological principles as facts" |
| "Sounds like a technical therapist" | "Don't be a therapist. Be a person." |
| "Don't just agree with the person" | "Don't agree if user characterizes partner negatively" |

A truly from-scratch prompt wouldn't have a "WHAT NOT TO DO" section at all — it would define the identity clearly enough that these behaviors are naturally avoided. The `YOUR ROLE` line already does this well: "Help X step into Y's shoes — not by telling them what Y feels, but by asking questions." If you nail the identity, you don't need the prohibitions.

---

## 2. OVER-ENGINEERING (Too many rules?)

### Stage 1 — Acceptable, Right on the Edge

Distinct rule clusters: ~9 (gathering phase, reflecting phase, high intensity, brief/guarded, pace matching, neutrality, forbidden words, length constraint, feel-heard check). This is at the upper limit but each piece arguably earns its place.

### Stage 2 — Over-Engineered

Distinct rule clusters: **~12** (role description, purpose context, four modes, early stage behavior, high intensity, "I don't know" handling, "what not to do" list, draft context, ready-share criteria, length constraint, lateral probing, dispatch off-ramp).

**Three separate mechanisms for explaining the same concept (purpose of Stage 2):**
1. `STAGE2_PURPOSE_CONTEXT` constant — tells the AI what to share
2. "On the first message of this stage, briefly explain why you're asking them to do this" — inline instruction
3. `EXPLAIN_EMPATHY_PURPOSE` dispatch off-ramp — for explicit questions
4. `HANDLING "I DON'T KNOW"` section — re-explains the value again

That's **four** paths to the same explanation. A naturally skilled person would just... explain it when it needed explaining. They wouldn't need four separate protocols for "if they ask", "if they seem unsure", "if they disengage", and "the first time you talk to them."

**Recommendation:** Keep `STAGE2_PURPOSE_CONTEXT` as the AI's understanding of the purpose. Keep the dispatch off-ramp for explicit "why?" questions. Remove the inline "first message" instruction and the scripted re-explanation in the "I don't know" handler. Trust the AI to use the purpose context when needed.

---

## 3. CONTRADICTIONS

### Stage 2 — One Significant Tension

The `WHAT NOT TO DO` section says:
> "Don't state psychological principles as facts ('People act from fear' / 'This is probably driven by their attachment style')"

But `STAGE2_PURPOSE_CONTEXT` says:
> "Research on conflict resolution consistently shows that the single strongest predictor of working things out is each person genuinely trying to see the other's perspective."

One instruction says "don't cite research/principles" while the purpose explanation *is* citing research. The AI will need to thread this needle: it can cite research when explaining *why we're doing this*, but not when analyzing the partner's behavior. That distinction is clear to us but may confuse the model. Worth clarifying.

**Fix:** Add a brief note: "You can explain the research behind this step (it's what makes the purpose credible) — just don't use psychological frameworks to interpret the partner's behavior."

---

## 4. PROMPT BLOAT

This is the biggest concern across both proposals.

### Stage 1: Significantly Longer

| Component | Old | New |
|-----------|-----|-----|
| `SIMPLE_LANGUAGE_PROMPT` | 1 line | ~15 lines |
| `PINNED_CONSTITUTION` | 4 lines | 5 lines |
| `FACILITATOR_RULES` | 3 lines | 20 lines |
| `NEUTRALITY_GUIDANCE` | Didn't exist | 10 lines |
| `STAGE1_QUESTION_TEMPLATES` | 8 lines | 9 lines |
| `buildStage1Prompt()` body | ~20 lines | ~30 lines |

The old prompt was compact because it used dense concepts ("witness mode", "facilitator rhythm"). The new prompt unpacks those into plain language, which inherently takes more words. That's a legitimate tradeoff. But some sections can be trimmed:

- **`SIMPLE_LANGUAGE_PROMPT`** — 7 substitution examples is too many. Pick 3-4. The AI gets the pattern after 3 examples; 7 is over-teaching.
- **`FACILITATOR_RULES`** — The "Good" and "Bad" examples are useful, but there are 2 good examples and 1 bad example. One of each would suffice.
- **`NEUTRALITY_GUIDANCE`** — This is 5 specific rules. Could be 3. Rules like "Never use words that take sides: 'reasonable', 'right', 'wrong', 'unfair', 'irrational', 'toxic'" overlap with "never confirm or deny what HAPPENED."

### Stage 2: Significantly Longer

The new `buildStage2Prompt` body is ~80 lines vs the old ~54 lines, plus a new `STAGE2_PURPOSE_CONTEXT` (~8 lines), plus a new dispatch handler (~70 lines of code/prompt). The increase is justified for the purpose explanation and dispatch handler. But the inline bloat — "I don't know" handling, "what not to do", mode descriptions with multiple example phrases — can be trimmed.

**Specific cuts for Stage 2:**
- Remove the scripted re-explanation in "HANDLING I DON'T KNOW": `"The reason we do this is that when each person genuinely tries to see the other side, it's one of the biggest things that predicts whether you'll actually work things out. It's not about being right — it's about showing you tried."` This word-for-word script will be repeated verbatim by the AI. Let it use `STAGE2_PURPOSE_CONTEXT` in its own words.
- Remove the "WHAT NOT TO DO" section entirely. The `YOUR ROLE` definition and `NEUTRALITY_GUIDANCE` (from Stage 1's proposal, which Stage 2 could also use) already cover this.

---

## 5. JARGON LEAKAGE

### "Activated" — Therapy Term

Both proposals use "activated" to describe high emotional states:

Stage 1 `phaseGuidance`:
> "${userName} is really activated right now."

Stage 2:
> "Don't push toward perspective-taking when they're activated."

"Activated" is somatic/therapy jargon. Normal people say "upset," "worked up," "emotional," or "really going through it." The Stage 1 high-intensity line should be:
> "${userName} is really upset right now."

### "Perspective-taking" — Academic

Stage 2 uses "perspective-taking" in several places:
> "Don't push toward perspective-taking when they're activated."
> "Give space before inviting perspective-taking."

This is psychology terminology. Say "seeing things from the other side" or "thinking about what they're going through."

### "Stage" as a concept

The Stage 2 prompt says:
> "On the first message of this stage..."
> "EARLY STAGE 2..."

A from-scratch prompt written for a person wouldn't say "stage." It would say "this step" or "this part." Small thing, but it leaks process internals into the AI's thinking.

### What's Clean

- `PINNED_CONSTITUTION` — no "mediator," no "consent-based space." Clean.
- `SIMPLE_LANGUAGE_PROMPT` — the before/after examples are genuinely de-therapized.
- Stage 2 `YOUR ROLE` line — "a thoughtful friend helping them see things from the other side" — excellent.
- `NEUTRALITY_GUIDANCE` opening — "You only know what this person is telling you. You don't know what actually happened. You weren't there." — this is outstanding. Real, direct, human.

---

## 6. SCRIPTED FEELING

This is the second biggest concern after bloat.

### Stage 1 — Too Many Example Phrases

Total canned phrases the AI could rotate through:

**`SIMPLE_LANGUAGE_PROMPT`** (7 replacement phrases):
- "That sounds rough."
- "You've mentioned that a few times."
- "Makes sense you'd feel that way."
- "Yeah, that's a lot."
- "Thanks for telling me that."
- "Tell me more about that."
- "So basically..."

**`STAGE1_QUESTION_TEMPLATES`** (7 questions):
- "What happened?"
- "What did that feel like?"
- "What mattered most to you in that moment?"
- "What do you wish they understood?"
- "How long has this been going on?"
- "What's at stake for you here?"
- "What was the last straw?"

**`FACILITATOR_RULES`** (2 good examples):
- "Got it. What happened next?"
- "Thanks for sharing that. How did that make you feel?"

That's **16 canned phrases** the AI could draw from. After 3-4 exchanges, users will start recognizing the rotation. A naturally great listener doesn't have a menu of 16 phrases — they respond to what's actually in front of them.

**Fix:** Cut `SIMPLE_LANGUAGE_PROMPT` examples to 3 (keep the most illustrative ones: "That sounds rough", "Makes sense you'd feel that way", "Tell me more about that"). Cut question templates to 4-5. Remove the good/bad examples from `FACILITATOR_RULES` — the gathering/reflecting concept is clear enough without them.

### Stage 2 — Scripted Re-Explanation

The "I don't know" handler includes this word-for-word script:
> "The reason we do this is that when each person genuinely tries to see the other side, it's one of the biggest things that predicts whether you'll actually work things out. It's not about being right — it's about showing you tried."

Every time a user says "I don't know," the AI will produce nearly this exact paragraph. It will feel robotic by the second occurrence. The AI has `STAGE2_PURPOSE_CONTEXT` — let it paraphrase.

Mode descriptions also have embedded example phrases (BRIDGING has 2, BUILDING has 2, MIRROR has 1, "I don't know" has 2). That's 7 more canned phrases on top of Stage 1's 16. Less severe here since modes are mutually exclusive, but worth watching.

---

## Gold Standard Test

> "Imagine you're writing instructions for a person who is naturally empathetic, an incredible listener, and skilled at mediation — but who has never done this specific process before. What would you tell them?"

### Stage 1: Mostly Passes

You'd tell them:
- "Start by just listening. Ask questions. Don't try to reflect back or summarize until you've heard enough." **Covered well.**
- "You only have one side of the story. Acknowledge how they feel, but don't agree about what happened." **Covered well.**
- "When you've heard enough, mirror back what they said in their own words." **Covered well.**
- "Keep it short." **Covered well.**

You would NOT:
- Give them 7 things to say instead of 7 other things. You'd trust their language.
- Give them 7 template questions. They know how to ask questions.
- Give them a forbidden words list. They'd know not to jump to solutions.

**Verdict: Stage 1 passes the test in spirit but is over-specified in detail.** Trim the examples and it's genuinely fresh.

### Stage 2: Partially Passes

You'd tell them:
- "Now we need them to try seeing things from the other person's side. Explain why — both people are doing this, research shows it's the biggest predictor of resolution, it's a guess not a test." **Covered excellently.**
- "Ask them questions that help them think about what the other person might be going through." **Covered well.**
- "If they're still upset, give them space first." **Covered.**
- "If they say 'I don't know,' don't push. Re-explain why it matters and try a different angle." **Covered, but over-specified.**

You would NOT:
- Give them a 3-step protocol for "I don't know" with a scripted re-explanation.
- Give them four named modes with example phrases for each.
- Give them a "WHAT NOT TO DO" list of 4 items.
- Create three separate mechanisms for the same explanation.

**Verdict: Stage 2 has the right ideas but wraps them in too much structure.** The four modes are probably necessary (they were in the original), but the I-don't-know handler, what-not-to-do list, and triple-explanation mechanism are over-engineering.

---

## Summary of Recommendations

### Must Fix (Will Cause Problems)

1. **Cut example phrases** in `SIMPLE_LANGUAGE_PROMPT` from 7 to 3. Scripting risk is real.
2. **Remove scripted re-explanation** in Stage 2 "I don't know" handler. Let the AI use `STAGE2_PURPOSE_CONTEXT` in its own words.
3. **Replace "activated"** with "upset" or "worked up" everywhere.
4. **Resolve the research contradiction** in Stage 2 (can cite research for purpose, not for partner analysis).

### Should Fix (Will Improve Quality)

5. **Remove `WHAT NOT TO DO` section** from Stage 2. The identity/role definition already covers it.
6. **Consolidate purpose-explanation paths** in Stage 2 from 4 to 2 (constant + dispatch).
7. **Replace "perspective-taking"** with plain language.
8. **Remove `FORBIDDEN` word list** from Stage 1. The principle "You're here to listen, not fix" is sufficient.
9. **Cut question templates** from 7 to 4-5.

### Nice to Have (Polish)

10. Replace "stage" with "step" or "part" in AI-facing instructions.
11. Remove "Good/Bad" examples from `FACILITATOR_RULES` — the concept is clear without them.
12. Consider whether `NEUTRALITY_GUIDANCE` can be 3 rules instead of 5 (some overlap).

---

## What's Genuinely Well Done

Credit where it's due — these things are excellent:

- **`NEUTRALITY_GUIDANCE` opening**: "You only know what this person is telling you. You don't know what actually happened. You weren't there." — Brilliant. Direct. Human. Best single line in either proposal.
- **Gathering → Reflecting phase split** in Stage 1 — genuinely new architecture, not a patch.
- **`STAGE2_PURPOSE_CONTEXT`** — clear, natural explanation of why the step exists. Addresses the core feedback perfectly.
- **`YOUR ROLE` in Stage 2** — "a thoughtful friend helping them see things from the other side." Perfect identity framing.
- **Dispatch off-ramp for `EXPLAIN_EMPATHY_PURPOSE`** — smart architectural decision. Keeps the main prompt lean and handles explicit questions separately.
- **Transition injection (1→2)** — properly explains both sides are doing this. Addresses the "why am I guessing?" confusion at the right moment.
- **De-therapized language overall** — "witness mode" is gone, "facilitator rhythm" is gone, "validate" is mostly gone. Real improvement.
