# Devil's Advocate Review: Proposed Prompt Redesign

> Critical review of Stage 1 and Stage 2 prompt proposals. For every problem identified, a concrete fix is suggested.

---

## Overall Assessment

The proposals are a genuine improvement. They solve the most egregious issues (parroting, therapy-speak, missing Stage 2 rationale). But they also introduce new risks. The most serious: **the pendulum may swing from "too therapeutic" to "too interrogative,"** and the safety net for high-intensity users has been thinned in ways that could hurt real people.

Below I go section by section.

---

## 1. The Gathering Phase May Feel Cold (Stage 1 — `FACILITATOR_RULES`)

### The Problem

The new `FACILITATOR_RULES` says:

> "GATHERING PHASE (early in the conversation — roughly the first 4-5 exchanges): ...Acknowledge briefly (one short sentence, or even just start with the question)... Do NOT reflect back, paraphrase, or summarize yet — you don't know enough"

And the `buildStage1Prompt` phaseGuidance for gathering:

> "Keep responses short — acknowledge briefly, then ask a question. Don't reflect or summarize yet."

**What happens when a user opens with:** *"My husband hit me last night and I don't know what to do"*?

Under the current prompt, the AI would reflect and validate — maybe too much, but at least it would acknowledge the gravity. Under the new prompt, the gathering phase instruction says: acknowledge briefly, ask a question. The AI might say: "That sounds really serious. What happened leading up to it?"

That's... fine? But it's also a scenario where a one-sentence acknowledgment feels callously insufficient. The instruction "Do NOT reflect back" is too absolute for high-stakes disclosures.

### The High-Intensity Override Is Insufficient

The proposal does have a high-intensity carve-out:

> "AT ANY POINT: If emotional intensity is high (8+), slow way down. Just be present."

And in `buildStage1Prompt`:

> "`isHighIntensity` → 'really activated right now. Don't try to move the conversation forward. Just be steady and present.'"

But this only triggers at intensity 8+. **The EmotionSlider defaults to some starting value.** On turn 1, if someone types a devastating message but hasn't adjusted the slider, intensity could read as 5. The gathering phase instruction ("don't reflect, just ask") applies. The AI asks a follow-up question to someone who just disclosed domestic violence.

### Fix

Add a **severity-aware exception** to the gathering phase — not based solely on the slider value, but instructed as behavioral guidance:

```
GATHERING PHASE exception: If someone shares something devastating (violence,
abuse, loss, betrayal), do NOT rush to a question. Acknowledge the weight of
what they said first. You can still be brief — "That's a huge thing to share.
I'm glad you told me." — but don't skip straight to a question. Let them
breathe. THEN ask.
```

This preserves the gathering intent while preventing the AI from sounding callous on disclosures that deserve more than "Got it."

---

## 2. "Don't Agree" vs. "Acknowledge Pain" — The Neutrality Razor Is Too Sharp (Stage 1 — `NEUTRALITY_GUIDANCE`)

### The Problem

The new `NEUTRALITY_GUIDANCE` says:

> "Never say 'that's understandable' about the other person's behavior."
> "Never use words that take sides: 'reasonable', 'right', 'wrong', 'unfair', 'irrational', 'toxic'."

Consider: a user says *"He screamed at me in front of the kids and I felt humiliated."*

The AI can't say "that's understandable" about feeling humiliated? It literally IS understandable. The instruction conflates acknowledging **the user's reaction** with validating **the partner's guilt**.

Also: the word "unfair" is banned. But sometimes a user is describing their feeling: "It felt really unfair." If the AI can't even reflect that word back, it'll feel like the AI is dodging their emotional reality.

### Fix

Rewrite the neutrality guidance to distinguish three layers:

```
NEUTRALITY — THREE LAYERS:
1. Their FEELINGS: Always acknowledge. "Of course you'd feel humiliated" is fine.
   You're validating their emotional experience, not the events.
2. Their INTERPRETATION of what happened: Don't confirm or deny. If they say
   "He's gaslighting me," don't agree or disagree. Ask what happened that made
   them feel that way.
3. Their CHARACTERIZATION of the partner: Never agree. If they say "She's toxic,"
   don't validate the label. Acknowledge the pain: "Sounds like you're really
   hurt by how she's been acting."

You CAN use "understandable" about FEELINGS ("It's understandable you'd feel that way").
You CANNOT use "understandable" about BEHAVIOR ("It's understandable that you'd want to leave him" — this takes a side).
```

The current proposal's flat ban on "that's understandable" will cause the AI to sound evasive when people describe genuine suffering.

---

## 3. Will Rapid-Fire Questions Feel Like an Intake Form? (Stage 1 — `STAGE1_QUESTION_TEMPLATES`)

### The Problem

The question templates are good individually:

> "What happened?" / "What did that feel like?" / "What mattered most to you in that moment?" / "What do you wish they understood?"

But there's no instruction about **variety and conversational flow**. If the AI cycles through these in order, turns 1-5 become:

1. "What happened?"
2. "Got it. What did that feel like?"
3. "Thanks for sharing. How long has this been going on?"
4. "Makes sense. What's at stake for you here?"
5. "What do you wish they understood?"

That reads like an intake questionnaire, not a conversation. The old prompt had the same risk but buried it under reflection. The new prompt, by stripping away reflection in early turns, makes the question-barrage pattern the *only* thing happening.

### Fix

Add explicit anti-pattern guidance:

```
DON'T just cycle through questions. A good conversation has rhythm:
- Sometimes respond to what they just said before asking something new
- Sometimes you don't need a question at all — a short acknowledgment lets them
  keep going on their own
- If they're on a roll, get out of the way. "Tell me more" or even just silence
  (no question) works.
- The worst version of this is five questions in a row with one-sentence
  acknowledgments. That's an interview, not a conversation.
```

---

## 4. The Turn 5 Cliff: Gathering → Reflecting Transition Is Too Rigid (Stage 1 — `buildStage1Prompt`)

### The Problem

```typescript
const isGathering = context.turnCount < 5 && context.emotionalIntensity < 8;
```

And the phaseGuidance:

> gathering: "You're still building the picture..."
> reflecting: "You have a solid picture now..."

Turn 4: "Don't reflect yet." Turn 5: "Now reflect." There's no gradient. In reality, some users share everything in two long messages. Others take ten turns of one-liners. A hard cutoff at turn 5 means:

- **Verbose user**: By turn 3, the AI has a complete picture but is instructed to keep asking questions for two more turns. They'll feel unheard: "I already told you everything, why do you keep asking?"
- **Guarded user**: At turn 5, the AI switches to reflection mode but barely knows anything. It'll produce hollow reflections based on minimal information.

### Fix

Make the transition instruction softer and judgment-based rather than turn-count-based:

```typescript
const phaseGuidance = isHighIntensity
  ? `... (keep as-is)`
  : isGathering
    ? `You're still early in the conversation. Default to asking questions,
       but if they've already shared a lot, it's okay to reflect earlier than
       turn 5. Use your judgment — the goal is to have enough context that
       your reflection adds value, not just parrots.`
    : `You've been listening for a while. If you have a good picture,
       reflect back what you've heard. If you still feel lost, keep asking
       — there's no shame in needing more.`;
```

The turn count should be a **signal**, not a **gate**. The prompt should say "roughly" and "by default" rather than presenting it as a phase boundary.

---

## 5. Stage 2 Purpose Explanation — Risk of Condescension (Stage 2 — `STAGE2_PURPOSE_CONTEXT` and Transition)

### The Problem

The transition now says:

> "Then explain what comes next — naturally, not like reading instructions. Cover these points in your own words: - Both are talking to the AI separately... - This next step is about trying to understand... - It's not a test... - At the end, write a short statement..."

That's **four bullet points** the AI must cover in a transition message. Plus "keep the whole thing to 3-5 sentences." Plus "then ask an opening question."

This is asking the AI to deliver a mini-lecture in 3-5 sentences. That's a lot of ground to cover. Two risks:

1. **Over-explaining to users who already get it**: If someone intuitively grasps perspective-taking, hearing "it's not a test, getting it wrong is fine, research shows..." will feel patronizing.
2. **The explanation itself becomes the verbose problem we're trying to fix**: The old transition was 1-2 sentences. The new one is 3-5 sentences of explanation + a question. We just made the transition *longer*.

### Fix

Make the explanation **adaptive**:

```
Then naturally introduce what comes next. The key point is that both of you are
doing this for each other. You don't need to cover every detail upfront — if
they seem to get it, move on quickly. If they seem confused or resistant,
explain more (both sides are doing this separately, it's a guess not a test,
the effort matters more than accuracy).

Keep it brief — 2-3 sentences is plenty for most people. More only if they
need it.
```

This lets the AI calibrate. Some users need the full rationale. Others just need "Now let's think about what [partner] might be going through."

---

## 6. The Dispatch Off-Ramp for "Why Am I Guessing?" — Is It Over-Engineered? (Stage 2 — `EXPLAIN_EMPATHY_PURPOSE`)

### The Problem

The proposal creates a new dispatch type (`EXPLAIN_EMPATHY_PURPOSE`), a new handler function, a new prompt builder, and a fallback — all to handle "Why am I doing this?"

Let's be honest: how often will a user explicitly ask "Why am I guessing?" vs. how often will they show confusion through behavior (low effort, "I don't know," resistance)?

The **inline** handling for implicit disengagement (Section 6 of the Stage 2 proposal — "HANDLING 'I DON'T KNOW' OR LOW EFFORT") is where 80% of the real confusion will surface. The dispatch off-ramp handles the other 20%.

But the dispatch introduces complexity:
- A separate AI call (Sonnet) for what could be a 3-sentence inline response
- A fallback function for when the dispatch call fails
- A new type to maintain in `dispatch-handler.ts`
- The pattern of "output ONLY `<thinking>` + `<dispatch>` (no visible text)" means the user sees nothing while the secondary call happens — creating a delay

### My Take

This isn't *wrong*, but it is over-engineered for the problem size. The existing inline handling (the "I DON'T KNOW" section) could absorb this case.

### Fix (if keeping the dispatch)

If you keep the dispatch, make the trigger conditions more specific to avoid false positives:

```
WHEN TO USE <dispatch>EXPLAIN_EMPATHY_PURPOSE</dispatch>:
- ONLY for direct, explicit process questions: "Why am I guessing?" / "What's
  the point?" / "Shouldn't they talk to you?"
- NOT for resistance like "I don't care what they think" — handle that inline
- NOT for confusion like "I'm not sure what to say" — that's a BRIDGING moment
```

Without this specificity, the AI might over-dispatch and interrupt conversational flow.

---

## 7. Stage 2 — "No Opinions" May Neuter Helpful Prompts (Stage 2 — `WHAT NOT TO DO`)

### The Problem

> "Don't state psychological principles as facts ('People act from fear' / 'This is probably driven by their attachment style')."

The original: *"People usually act from fear — what might [partner] be afraid of?"* — this was actually a useful reframe. It gave users a mental model for depersonalizing their partner's behavior. The new version removes it entirely from the MIRROR mode:

> "What do you think was happening for [partner] that led them to do that?"

This is good but it's *harder* for the user. The old version gave them a foothold ("fear") to start imagining. The new version is completely open-ended. For someone who is stuck in blame, an open-ended question with no scaffolding may get "I don't know, they're just an asshole."

### Fix

Don't state principles as facts, but DO offer tentative framing as a *question*:

```
MIRROR mode: Don't state psychological principles as facts. But you CAN
offer tentative framings as questions:
- Instead of: "People usually act from fear"
- Try: "Sometimes when people act like that, there's something they're
  scared of underneath. Does that ring true for [partner]?"

The difference: a statement tells them what to think. A question invites them
to consider a possibility.
```

---

## 8. `FACILITATOR_RULES` Shared Across Stages — Collision Risk (Stage 1 → Stages 3 & 4)

### The Problem

The Stage 1 proposal notes (Integration Notes, item 9):

> "`FACILITATOR_RULES` is also used by Stages 2, 3, and 4 (lines 410, 448, 489). The new version works for all stages since the gathering/reflecting phases are defined by turn count which resets per stage."

But the new `FACILITATOR_RULES` contains:

> "GATHERING PHASE (early in the conversation — roughly the first 4-5 exchanges): Your job is to understand the situation. You don't have enough information to reflect yet."

This makes sense for Stage 1 (first conversation with the user). It does NOT make sense for Stage 3 (Need Mapping) or Stage 4 (Strategic Repair), where the AI already has context from previous stages. At Stage 3, turn 1, the AI "doesn't have enough information to reflect yet"? It has the entire prior conversation. Yet the new rules would tell it to be in gathering mode.

The Stage 2 proposal wisely **does not use the new `FACILITATOR_RULES`** — it inlines its own approach instructions. But Stages 3 and 4 still reference it (lines 448, 489 in the current code).

### Fix

Either:

**A)** Create a Stage 1-specific version and keep the old `FACILITATOR_RULES` for Stages 3/4:
```typescript
const STAGE1_LISTENING_RULES = `...`; // New gathering/reflecting phases
const FACILITATOR_RULES = `...`;       // Keep original for 3/4 (or lightly edit)
```

**B)** Add a stage-awareness clause to the new rules:
```
GATHERING PHASE applies when you're first meeting this person's story
(Stage 1). In later stages, you already have context — skip to reflecting
and respond to where they are now.
```

Option A is cleaner. The gathering/reflecting concept is Stage 1-specific and shouldn't leak into other stages.

---

## 9. Are the Proposals Actually Shorter? (Both Stages)

### Character Count Comparison

| Component | Current (approx) | Proposed Stage 1 (approx) | Change |
|-----------|------------------|--------------------------|--------|
| `SIMPLE_LANGUAGE_PROMPT` | ~50 chars | ~600 chars | +1100% |
| `PINNED_CONSTITUTION` | ~300 chars | ~350 chars | +17% |
| `FACILITATOR_RULES` | ~250 chars | ~1100 chars | +340% |
| `NEUTRALITY_GUIDANCE` | 0 (didn't exist) | ~550 chars | New |
| `buildStage1Prompt` body | ~1200 chars | ~1500 chars | +25% |

The proposals are **significantly longer** than the originals. That's not automatically bad — the originals were under-specified, causing the AI to fill gaps with therapy-speak. But the feedback said "bot talks too much." If we're adding ~2000 chars to the system prompt, we need to be sure that translates to *shorter AI responses*, not just more instructions the AI might selectively follow.

The Stage 2 proposal adds `STAGE2_PURPOSE_CONTEXT` (~550 chars), a longer transition (~500 chars vs ~200 chars), and a longer initial message prompt. Plus an entirely new dispatch handler.

### Fix

This isn't a problem *per se* — longer prompts that produce shorter, better responses are fine. But **test it**. Run the same user inputs through both prompt versions and compare actual AI output length and quality. Don't assume more instructions = better behavior. LLMs sometimes ignore longer prompts more than shorter ones.

---

## 10. Missing: What Does the AI Say When the Slider Isn't Adjusted? (Both Stages)

### The Problem

Both proposals reference `context.emotionalIntensity` extensively for branching behavior. But neither addresses what happens when the user hasn't interacted with the slider and intensity is at its default value.

The UI agent (Task #7) is adding a slider hint, which helps. But there's a prompt-level gap: if intensity reads as 5 (default) but the user's TEXT clearly signals 9+ distress, the AI should NOT be in gathering mode asking questions.

### Fix

Add a text-based intensity override instruction:

```
If the user's words clearly signal extreme distress (descriptions of violence,
self-harm, desperate language) but their slider intensity is moderate or low,
treat them as high-intensity regardless. The slider may not be updated.
Trust the words over the number.
```

---

## 11. Stage 2 — The "I Don't Know" Handler Repeats the Rationale Too Literally

### The Problem

The "HANDLING 'I DON'T KNOW'" section says:

> Re-explain why this matters in plain language: "The reason we do this is that when each person genuinely tries to see the other side, it's one of the biggest things that predicts whether you'll actually work things out."

This is a **literal script**. If the user says "I don't know" twice, the AI will re-explain with nearly identical language both times. The second time, it'll feel like the AI is stuck on a loop.

### Fix

```
If they disengage again after you've already explained the purpose, don't
repeat the rationale. Instead, try a concrete, grounded approach:
- "Okay, forget what they might be 'feeling' for a sec. If [partner] were
  sitting here right now, what do you think they'd say happened?"
- "What do you think [partner] would say if I asked them the same question
  I asked you?"

Meet them where they are. If empathy-as-a-concept isn't landing, try
empathy-as-perspective-taking instead.
```

---

## 12. The Word "Activated" Is Still in the Proposals

### The Problem

The research analysis (Feedback #2) correctly identifies "activated" as clinical language:

> "'activated' is clinical language"

The Stage 1 proposal uses it in `buildStage1Prompt` phaseGuidance:

> "really activated right now"

And Stage 2:

> "how upset/activated they are"

### Fix

Replace all instances of "activated" with plain language: "upset", "worked up", "overwhelmed", "in a rough place." The word "activated" is a dead giveaway that a therapist wrote these prompts.

---

## 13. `buildResponseProtocol` Modification — Backward Compatibility (Stage 2)

### The Problem

The Stage 2 proposal modifies `buildResponseProtocol()` to add the empathy off-ramp conditionally:

```typescript
const empathyOffRamp = stage === 2
  ? `\n- If asked why they're doing this...: <dispatch>EXPLAIN_EMPATHY_PURPOSE</dispatch>`
  : '';
```

This changes a function that ALL stages use. If the dispatch handler for `EXPLAIN_EMPATHY_PURPOSE` doesn't exist yet (because it hasn't been implemented in `dispatch-handler.ts`), and the AI emits `<dispatch>EXPLAIN_EMPATHY_PURPOSE</dispatch>` during Stage 2, the parsing code in `dispatch-handler.ts` will hit the `default` or `unknown` case.

### Fix

Implement the dispatch handler BEFORE deploying the prompt change, or add a guard:

```typescript
// In dispatch-handler.ts
case 'EXPLAIN_EMPATHY_PURPOSE':
  // If handler not yet implemented, fall through to inline handling
  if (!handleEmpathyPurposeExplanation) {
    return null; // Let the main prompt handle it
  }
  return handleEmpathyPurposeExplanation(context);
```

Or better: deploy the dispatch handler and the prompt change atomically.

---

## Summary: Top 5 Issues by Severity

| # | Issue | Severity | Section |
|---|-------|----------|---------|
| 1 | High-intensity/crisis disclosures get insufficient acknowledgment in gathering phase | **Critical** | Section 1 |
| 2 | Neutrality guidance bans acknowledging feelings ("that's understandable" about feelings) | **High** | Section 2 |
| 3 | `FACILITATOR_RULES` gathering phase leaks into Stages 3/4 where it doesn't apply | **High** | Section 8 |
| 4 | Turn 5 hard cutoff doesn't account for verbose vs. guarded users | **Medium** | Section 4 |
| 5 | Stage 2 purpose explanation risks being a mini-lecture for users who don't need it | **Medium** | Section 5 |

---

## What's Good (I Should Say This Too)

- **The `SIMPLE_LANGUAGE_PROMPT` before/after table** (Section 1 of Stage 1 proposal) is excellent. Concrete examples of what to say instead are exactly how you change LLM tone.
- **`NEUTRALITY_GUIDANCE` as a first-class concept** is overdue. The old "internal lint" was too weak.
- **Stage 2 purpose explanation existing at all** — this was a real gap. Users genuinely didn't understand why they were being asked to do empathy work.
- **The "I DON'T KNOW" handler** — this scenario was completely unhandled before. Having explicit guidance is a big win.
- **Removing `FACILITATOR_RULES` from Stage 2** and replacing with inline approach instructions — this is the right architecture. Stage 2 has fundamentally different needs.
- **The fallback response** for the empathy dispatch handler is well-written and could honestly be the primary handler (skip the extra AI call).
