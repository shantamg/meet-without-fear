# Prompt Architecture Analysis & Feedback Mapping

> Research document for the prompt redesign team. Maps user feedback to specific code, identifies root causes, and catalogs features that must be preserved.

---

## 1. Architecture Overview

### File Map

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/services/stage-prompts.ts` | Main prompt builder for all stages (0-4), transitions, inner work, reconciler | ~1535 |
| `backend/src/services/needs-prompts.ts` | Needs assessment prompts (Stage 3 support) | ~260 |
| `mobile/src/components/EmotionSlider.tsx` | In-chat emotion barometer slider | ~203 |
| `mobile/src/components/SessionEntryMoodCheck.tsx` | Session-entry mood modal (separate from slider) | ~233 |

### Prompt Flow

1. `ai-orchestrator.ts` receives user message with context (stage, intensity, turn count, etc.)
2. Calls `buildStagePrompt(stage, context, options)` from `stage-prompts.ts`
3. The stage prompt includes: base system prompt + stage-specific instructions + response protocol
4. Base system prompt = `SIMPLE_LANGUAGE_PROMPT` + `PINNED_CONSTITUTION` + `PRIVACY_GUIDANCE` + `INVALID_MEMORY_GUIDANCE` + (optional) `PROCESS_OVERVIEW`
5. Response uses semantic `<thinking>` tags for metadata (not visible to user)

### Response Protocol (Semantic Router)

All stages use `buildResponseProtocol()` which outputs:

```
<thinking>
Mode: [WITNESS|PERSPECTIVE|NEEDS|REPAIR|ONBOARDING|DISPATCH]
UserIntensity: [1-10]
FeelHeardCheck: [Y/N]    (Stage 1 only)
ReadyShare: [Y/N]         (Stage 2 only)
Strategy: [brief]
</thinking>
```

Then plain text response. Off-ramps via `<dispatch>` tags. **This format must be preserved.**

---

## 2. Feedback-to-Code Mapping

### Feedback #1: "Bot talks too much in beginning stage"

**Root Cause**: Stage 1 (`buildStage1Prompt`, line 348-376) has a `FACILITATOR_RULES` constant (line 146-149) that says:

```
Facilitator rhythm: reflect → validate → one next move
```

This instructs the AI to **reflect and validate on every turn**, even before it has information to reflect on. Combined with `LATERAL_PROBING_GUIDANCE` (line 138-140) and `STAGE1_QUESTION_TEMPLATES` (lines 151-159), the AI gets conflicting signals: reflect first, but also ask questions.

**Specific lines causing verbosity**:
- **Line 147**: `Facilitator rhythm: reflect → validate → one next move` — This rhythm is applied from turn 1, before the AI has anything substantive to reflect on. The AI fills space with generic validation.
- **Line 356-357**: `Focus: Reflect and validate before moving on. No solutions, reframes, or interpretations yet.` — "Reflect and validate" as the primary focus makes the AI parrot back what the user just said before asking anything.
- **Line 361**: `Length: default 1–3 sentences.` — This is good but gets overridden by the reflect+validate+question pattern which pushes responses to 3+ sentences every time.
- **Line 349**: `witnessOnlyMode = context.turnCount < 3 || context.emotionalIntensity >= 8` — For the first 3 turns, the AI is locked into "witness only" which means pure reflection with no forward movement.

**Fix direction**: In early turns (turnCount < 4-5), the AI should **primarily ask questions to gather information**. Reflection and validation should happen *after* the user has shared enough substance to reflect on. The "reflect → validate → question" rhythm should become "acknowledge briefly → ask" in early turns.

---

### Feedback #2: "Sounds like a technical therapist"

**Root Cause**: Multiple constants use clinical framing despite the `SIMPLE_LANGUAGE_PROMPT` (line 103-105):

```
STYLE: Warm, clear, direct. No jargon. One question max.
```

This is too brief to counteract the therapy-coded language throughout:

- **Line 107-112**: `PINNED_CONSTITUTION` — Uses terms like "mediator", "consent-based space", "dual-track sharing", "de-escalate". This frames the AI as a clinical professional.
- **Line 147**: `Facilitator rhythm: reflect → validate → one next move` — "Facilitator rhythm" is therapy jargon. A normal person doesn't think in terms of "reflect → validate".
- **Line 352**: `You are Meet Without Fear in the Witness stage. Help ${userName} feel fully heard.` — "Witness stage" and "feel fully heard" are therapy concepts. A real friend would just listen.
- **Lines 413-417**: Stage 2 modes — `LISTENING`, `BRIDGING`, `BUILDING`, `MIRROR` — These are named like therapy techniques, and their instructions read like a therapy manual.
- **Line 147-148**: `If the user's emotional intensity is high (8+), they are very activated/distressed — stay in witness mode` — "Activated" is clinical language.
- **Lines 845-855**: Inner work "TECHNIQUES" section literally lists therapy techniques: "Reflection", "Curiosity", "Gentle probing", "Pattern noticing", "Holding space".

**Fix direction**: Replace the AI's self-concept from "mediator/facilitator in a therapeutic process" to something like "a really good friend who happens to be great at listening." The mode names are internal (in `<thinking>`) so they can stay clinical, but the behavioral instructions should use natural language. Instead of "reflect → validate → one next move", describe what a natural, caring person would do.

---

### Feedback #3: "Adding too much of its own opinion"

**Root Cause**: Several prompt instructions encourage interpretation and pattern-surfacing:

- **Line 147**: `Facilitator rhythm: reflect → validate → one next move` — "Validate" can be interpreted by the LLM as agreeing with the user's perspective, adding the AI's own assessment.
- **Line 409**: `Help ${userName} see the fear, hurt, and unmet needs driving ${partnerName}'s behavior` — "See the fear, hurt, and unmet needs" instructs the AI to interpret the partner's behavior, which comes across as the AI injecting its own psychological analysis.
- **Line 417**: `"People usually act from fear - what might ${partnerName} be afraid of?"` — This is the AI stating a psychological principle as fact, which is "adding its own opinion."
- **Line 452**: Stage 3 EXCAVATING mode: `Reframe to underlying need: "They never help" → need for partnership/teamwork` — The AI is instructed to reframe the user's words, which can feel like the AI is telling them what they "really" mean.
- **Line 360**: `Neutrality lint (internal): avoid judging words like "reasonable", "right", "wrong", "irrational". Rephrase to impact-focused language.` — Good intent but the AI still interprets when it "rephrases."

**Fix direction**: Stage 1 should be almost purely "ask and understand." The AI should ask questions, mirror the user's own words, and avoid interpreting meaning. When it reflects, it should use the user's exact language ("You said X" not "It sounds like you're feeling Y because of Z"). Save interpretation for later stages when the user has invited deeper exploration.

---

### Feedback #4: "Empathy section: 'Why am I guessing?'"

**Root Cause**: Stage 2 never explains the *purpose* of perspective-taking. The user is suddenly asked to imagine their partner's feelings with no explanation of why this helps.

- **Line 405**: `Help ${userName} imagine what ${partnerName} might be feeling or afraid of.` — This is the AI's instruction but the user never hears WHY they're doing this.
- **Lines 540-541**: Transition from Stage 1 → 2: `TRANSITION: ${userName} just confirmed feeling heard. Acknowledge this warmly (1-2 sentences), then gently invite curiosity about what ${partnerName} might be feeling or afraid of.` — Jumps straight to the empathy task without explaining the rationale.
- **Lines 667-676**: Stage 2 initial message: `Generate an opening message (1-2 sentences) that gently introduces the perspective-taking work ahead. Be encouraging without being pushy.` — Says "introduce" but doesn't tell the AI to explain the *purpose* or *benefit*.
- **Line 431**: ReadyShare instruction mentions drafting an empathy statement, but the user gets no context on what this statement will be used for or why it matters.

**Fix direction**: The Stage 1→2 transition AND the Stage 2 opening must explain:
1. **What** they'll be doing (imagining their partner's experience)
2. **Why** it helps (research shows understanding the other person's fears/feelings is the single biggest predictor of resolution; it's not about being right or wrong)
3. **How** it works (they'll explore, then write a short statement that gets shared — their partner does the same for them)
4. **That it's a guess** (they're not expected to get it right — the act of trying is what matters)

---

### Feedback #5: "Reflect/empathize AFTER gathering info"

**Root Cause**: Same as #1 but deserves its own callout. The `FACILITATOR_RULES` (line 147) make reflection the **first** action on every turn:

```
Facilitator rhythm: reflect → validate → one next move
```

This means:
- Turn 1: User says "I'm having trouble with my wife" → AI reflects that back ("It sounds like things have been difficult with your wife") → validates ("That must be hard") → asks a question. That's 3 parts when 1 would do.
- Turn 2: User shares one detail → AI reflects, validates, asks. Still mostly repeating what the user said.
- Turn 3: User shares more → AI reflects, validates, asks. NOW there might be enough to reflect meaningfully, but the user has already experienced 2 turns of parroting.

**Specific code**:
- **Line 356**: `Focus: Reflect and validate before moving on.` — Literally says "reflect before moving on."
- **Line 147**: `reflect → validate → one next move` — Reflection as step 1.
- **Line 349**: `witnessOnlyMode = context.turnCount < 3` — First 3 turns locked into reflection mode.

**Fix direction**: Create two distinct phases within Stage 1:
- **Gathering phase** (turns 1-4ish): Acknowledge briefly (1 short sentence max), ask a question. No substantive reflection yet. The AI is building understanding.
- **Reflection phase** (turns 5+): Now the AI has enough context to reflect meaningfully. Do the reflect → validate → question rhythm here.

The `witnessOnlyMode` flag at line 349 should control the opposite behavior — early turns should be in "gather mode" not "witness only mode."

---

### Feedback #6: "Don't just agree with the person"

**Root Cause**: The prompt instructions lean heavily toward validation without balancing neutrality:

- **Line 147**: `Facilitator rhythm: reflect → validate → one next move` — "Validate" as a core step means the AI affirms the user's perspective every turn.
- **Line 356**: `Focus: Reflect and validate before moving on.` — "Validate" again as primary instruction.
- **Line 148**: `If the user's emotional intensity is high (8+)... Prioritize space and validation over progress.` — At high intensity, validation becomes the ONLY move.
- **Line 360**: Neutrality lint exists (`avoid judging words like "reasonable", "right", "wrong"`) but is labeled "internal" — it's easily outweighed by the multiple "validate" instructions.
- **Line 109-110**: `PINNED_CONSTITUTION`: `de-escalate when language is attacking or unsafe; stay non-shaming` — De-escalation is good, but the prompt never says "stay neutral about the facts of the situation."

**What's missing**: An explicit instruction like: "You don't know what actually happened between these people. You only have one side of the story. Your job is to understand their experience, not to confirm their version of events. Validate feelings (how they feel), not facts (what happened)."

**Fix direction**: Replace "validate" with "acknowledge" in the facilitator rules. Add an explicit neutrality instruction: "You have one side of the story. Acknowledge how they feel without confirming or denying what happened. Never use words that take sides like 'that's understandable' about the partner's behavior."

---

### Feedback #7: "No instruction to slide to change emotion"

**Root Cause**: The `EmotionSlider` component (`mobile/src/components/EmotionSlider.tsx`) has no onboarding hint, no explanatory text, and no first-time guidance.

**Current state**:
- **Line 125**: Header text is just `"How are you feeling?"` — No instruction that this is a slider you can interact with.
- **Lines 149-153**: Labels "Calm" / "Elevated" / "Intense" are below the slider but hidden in compact mode (`display: compact ? 'none' : 'flex'` at line 195).
- **Compact mode**: In the chat view (`ChatInterface.tsx`), the slider is rendered with `compact={compactEmotionSlider}` — in compact mode the bottom labels are hidden, so the user just sees a tiny slider with no context.
- **`SessionEntryMoodCheck.tsx`**: This modal appears on session entry with a full-screen slider and "How are you feeling right now?" title + "Continue" button. But this is a **separate component** from the in-chat `EmotionSlider`. After the mood check modal, the user sees the compact slider in the chat with no explanation that they can continue adjusting it.

**Fix direction**: Add a first-time hint to the `EmotionSlider` component. Something like "Slide to update how you're feeling" that appears once (stored in AsyncStorage) and fades away after the first interaction. The hint needs to work in compact mode since that's the primary use case in chat.

---

## 3. Features That MUST Be Preserved

Any redesign must keep these working:

### 3.1 Response Protocol (Semantic Router)
- `<thinking>` block with Mode, UserIntensity, Strategy
- `FeelHeardCheck: [Y/N]` in Stage 1 (drives UI panel)
- `ReadyShare: [Y/N]` in Stage 2 (drives empathy draft UI)
- `<draft>` tag for invitation and empathy statement drafts
- `<dispatch>` for off-ramps (EXPLAIN_PROCESS, HANDLE_MEMORY_REQUEST)
- **Plain text after thinking block** — no tags/brackets in user-visible text

### 3.2 Stage 1: Feel-Heard Check Logic
- Lines 368-373: FeelHeardCheck:Y triggers when: (1) user affirms a reflection, (2) core concern/need is named, (3) intensity is stabilizing
- The UI handles the "do you feel heard?" question — AI must NOT ask it
- Even when FeelHeardCheck:Y, AI stays in witness mode
- Turn < 2 is too early (line 373)

### 3.3 Stage 2: Empathy Draft & ReadyShare
- Lines 430-434: ReadyShare:Y when user articulates partner's feelings without blame
- Turn < 4 is too early for draft (line 384, 431)
- Draft format: 2-4 sentences in `<draft>` tag, written as user speaking to partner
- Empathy refinement mode (lines 392-402): when `isRefiningEmpathy`, AI must update the draft
- Shared context from partner integration (lines 397-401)

### 3.4 Stage Transitions
- Lines 530-555: Transition injections prepend to stage prompt
- Each transition is 1-2 sentences acknowledging the previous stage
- Must NOT lose stage modes/rules/readiness signals

### 3.5 Emotional Intensity Handling
- `emotionalIntensity` (1-10) from EmotionSlider drives behavior
- 8+ = high intensity → witness/listening mode, slow down, validate
- AI must NOT mirror intensity in its tone (stated in multiple places)
- `witnessOnlyMode` at line 349 for turnCount < 3 OR intensity >= 8

### 3.6 Invitation Prompt
- Lines 313-342: `buildInvitationPrompt` for crafting partner invitation
- Inner thoughts context integration (lines 317-321)
- Refinement mode (line 323-325)
- Draft in `<draft>` tag

### 3.7 Privacy & Constitution
- `PINNED_CONSTITUTION` (lines 107-112): Never claim partner's thoughts
- `PRIVACY_GUIDANCE` (lines 88-91): Only use what user shared
- These are non-negotiable safety guardrails

### 3.8 Lateral Probing
- Line 138-140: When users are brief/guarded, widen the lens instead of drilling
- This is good design — preserve it

### 3.9 Length Constraint
- `Length: default 1–3 sentences` (appears in Stages 1, 3, 4)
- `Go longer only if they explicitly ask for help or detail`
- This is correct but needs to be reinforced more strongly

### 3.10 Forbidden Actions Per Stage
- Stage 1 (line 357): No "next step", "what might help", "moving forward"
- Stage 3 (line 461): No "try this", "experiment with", solutions
- Stage 3 (line 462): No introducing needs user hasn't expressed
- Stage 4 (line 510): No criticizing partner's proposals
- These boundaries are good and must be kept

---

## 4. Constants Catalog

| Constant | Lines | Purpose | Change? |
|----------|-------|---------|---------|
| `SIMPLE_LANGUAGE_PROMPT` | 103-105 | Style directive | Expand significantly — currently too brief to drive behavior |
| `PINNED_CONSTITUTION` | 107-112 | Core safety/privacy rules | Keep but de-therapize language |
| `PRIVACY_GUIDANCE` | 88-91 | Cross-user information boundary | Keep as-is |
| `INVALID_MEMORY_GUIDANCE` | 96-98 | Redirect memory requests | Keep as-is |
| `PROCESS_OVERVIEW` | 75-81 | Only shown if user asks about process | Keep as-is |
| `FACILITATOR_RULES` | 146-149 | reflect→validate→one next move | **REWRITE** — root cause of multiple issues |
| `STAGE1_QUESTION_TEMPLATES` | 151-159 | Example questions for Stage 1 | Good, keep or expand |
| `LATERAL_PROBING_GUIDANCE` | 138-140 | Widen lens when user is guarded | Keep as-is |
| `ONBOARDING_TONE` | 165-167 | Warm, practical for Stage 0 | Keep as-is |
| `NEED_MAPPING_APPROACH` | 173-175 | Validate before reframe in Stage 3 | Keep as-is |
| `INNER_WORK_GUIDANCE` | 721-732 | Solo reflection session guidance | Keep as-is |

---

## 5. Redesign Priorities (Ordered by Impact)

### P0: Critical (Directly breaks user experience)

1. **Rewrite `FACILITATOR_RULES`** — This single constant is the root cause of feedback #1, #3, #5, and partially #6. It needs to become phase-aware (gather first, reflect later) and stop defaulting to validation.

2. **Add Stage 2 purpose explanation** — Users are confused about why they're doing empathy work. The Stage 1→2 transition (line 541) and Stage 2 intro (line 667-676) need to explain the why, not just the what.

3. **Replace validation-first with acknowledgment-first** — Every instance of "validate" in the prompt text should be reviewed. Validate *feelings*, not *interpretations*.

### P1: High (Noticeably affects tone)

4. **De-therapize the AI's self-concept** — Replace "Witness stage", "mediator", "consent-based space", "facilitator rhythm" with natural language. The AI should think of itself as a caring, smart friend.

5. **Add explicit neutrality instruction** — A new constant alongside `PRIVACY_GUIDANCE` that says "You have one side of the story. Never take sides."

6. **Expand `SIMPLE_LANGUAGE_PROMPT`** — Currently 1 line. Needs specific examples of what natural vs. clinical language looks like.

### P2: Medium (Quality of life)

7. **Add EmotionSlider onboarding hint** — UI change, handled by the UI agent separately.

8. **Differentiate early vs. late Stage 1 behavior** — `witnessOnlyMode` at line 349 should be inverted: early = gathering, late = witnessing.

---

## 6. Specific Rewrite Targets

### For Task #2 (Stage 1 + Base Prompts Redesign)

**Files to modify**: `stage-prompts.ts`

**Constants to rewrite**:
- `FACILITATOR_RULES` (line 146-149) → Phase-aware: gather first, reflect after 4+ turns
- `SIMPLE_LANGUAGE_PROMPT` (line 103-105) → Expand with examples and anti-patterns
- `PINNED_CONSTITUTION` (line 107-112) → Keep safety, de-therapize framing

**Functions to modify**:
- `buildStage1Prompt()` (line 348-376):
  - Add explicit "gathering phase" for early turns
  - Change `witnessOnlyMode` logic at line 349
  - Add neutrality instruction ("you have one side of the story")
  - Remove or soften "Reflect and validate before moving on" at line 356
- `buildBaseSystemPrompt()` (line 198-221):
  - Add new neutrality constant
  - Expand style guidance

**New constant needed**:
- `NEUTRALITY_GUIDANCE` — "You only have one person's perspective. Acknowledge their feelings without confirming their version of events."

### For Task #3 (Stage 2 Empathy Prompts Redesign)

**Files to modify**: `stage-prompts.ts`

**Functions to modify**:
- `buildTransitionInjection()` (line 530-555):
  - Stage 1→2 transition (line 540-542) must explain WHY empathy work matters
  - Add: purpose, what happens (both sides do this), it's a guess not a test
- `buildStage2Prompt()` (line 382-436):
  - Add purpose explanation in the prompt body
  - De-therapize mode names in behavioral descriptions (LISTENING/BRIDGING/BUILDING/MIRROR descriptions at lines 413-417 are too clinical in their *instructions*)
  - Add reassurance: "You're not expected to get this right. The act of trying to understand is what matters."
- `buildInitialMessagePrompt()` case 2 (line 667-676):
  - Tell the AI to explain what they'll be doing and why
  - Not just "gently introduces the perspective-taking work" but explains the benefit

**Preserve**:
- `ReadyShare` flag logic (line 430-434)
- Draft format and refinement mode
- Turn-gating (turn < 4 too early)
- FOUR MODES structure (internal behavior, can stay as-is)
- Shared context integration

---

## 7. Anti-Patterns to Avoid in Redesign

1. **Don't just add more text to prompts** — The prompts are already 1535 lines. Rewrite, don't append.
2. **Don't remove safety guardrails** — Privacy, constitution, and stage-forbidden actions are critical.
3. **Don't change the response protocol format** — The semantic router (`<thinking>`, `<draft>`, `<dispatch>`) is deeply integrated.
4. **Don't break stage gating** — Turn count checks and intensity thresholds exist for good reasons.
5. **Don't over-prescribe natural language** — Giving the AI 20 example phrases will make it sound scripted. Give it a character and let it improvise.
6. **Don't conflate the AI's internal instructions with user-facing tone** — Mode names (WITNESS, PERSPECTIVE, etc.) are in `<thinking>` blocks. They can be clinical. The behavioral *instructions* that shape user-facing text are what need to change.
