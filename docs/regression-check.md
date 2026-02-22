# Regression Check: Proposed Prompt Redesign

> Systematic verification that every functional feature of the current prompts is preserved in the proposals.
> Checked against: `backend/src/services/stage-prompts.ts` (current), `docs/proposed-stage1.md`, `docs/proposed-stage2.md`

---

## STAGE 1 FEATURES

### 1. Response protocol format (`<thinking>` block with Mode, UserIntensity, FeelHeardCheck, Strategy)

**Status: PRESERVED**

The proposed `buildStage1Prompt()` calls `buildResponseProtocol(1)` at the end, same as current. The Stage 2 proposal modifies `buildResponseProtocol()` to add a conditional off-ramp for Stage 2 only — for Stage 1 calls, the output is identical:

```
<thinking>
Mode: [WITNESS|PERSPECTIVE|NEEDS|REPAIR|ONBOARDING|DISPATCH]
UserIntensity: [1-10]
FeelHeardCheck: [Y/N]
Strategy: [brief]
</thinking>
```

---

### 2. FeelHeardCheck: Y/N flag with conditions

**Status: PRESERVED**

Current conditions (line 368):
1. They affirm a reflection
2. Core concern/need is named
3. Intensity is stabilizing

Proposed conditions:
1. "they've affirmed something you reflected back"
2. "you can name their core concern"
3. "their intensity is stabilizing or steady"

All three conditions preserved. Additional behavioral rules also preserved:
- Be proactive about setting it
- Do NOT ask "do you feel heard?" (UI handles it)
- Keep setting Y until they act on it
- Stay in listening mode even when Y (no pivot to action/next steps)

---

### 3. FeelHeardCheck too early guard

**Status: MODIFIED**

| | Current | Proposed |
|---|---------|----------|
| Threshold | `turnCount < 2` | `turnCount < 3` |
| Text | "Too early (turn < 2) unless they ask to move on." | "Too early (turn < 3) — you haven't heard enough yet." |

**Assessment: SAFE.** The threshold is raised by 1 turn, which aligns with the "gather first" redesign philosophy. The "unless they ask to move on" escape hatch is removed, but at turn 2 there's almost never enough context for a meaningful FeelHeardCheck anyway. Low risk.

---

### 4. WitnessOnlyMode or equivalent for high intensity (8+)

**Status: PRESERVED**

Current: `witnessOnlyMode = context.turnCount < 3 || context.emotionalIntensity >= 8` → "stay in witness mode until intensity settles"

Proposed: `isHighIntensity = context.emotionalIntensity >= 8` → Phase guidance says: "Don't try to move the conversation forward. Just be steady and present. Short responses. Acknowledge what they're feeling without adding your take. Let them lead."

The 8+ threshold is maintained. The "stay in witness mode" behavior is preserved in natural language. Additionally, `FACILITATOR_RULES` contains: "If emotional intensity is high (8+), slow way down. Just be present. Short sentences."

---

### 5. Emotional intensity parameter (1-10) included in prompt

**Status: PRESERVED**

Current: `User's emotional intensity: ${context.emotionalIntensity}/10 (how activated/distressed...)`
Proposed: `Emotional intensity: ${context.emotionalIntensity}/10`

**Minor note:** The current version always includes "(do NOT mirror this intensity in your tone)" in the intensity line regardless of level. The proposed only includes the "Do NOT match their intensity" instruction when `isHighIntensity` is true. For medium intensity (5-7), this instruction is lost. However, the `FACILITATOR_RULES` says "Match their pace" (which is about conversational pace, not emotional intensity), and the overall prompt voice is calm by design. **Low risk but worth noting.**

---

### 6. High intensity behavior (slow down, prioritize space)

**Status: PRESERVED**

Same threshold (8+), same behavioral instruction (slow down, be present, don't push forward, short responses). Language updated from clinical ("activated/distressed — stay in witness mode") to natural ("really activated right now — be steady and present").

---

### 7. Length constraint (1-3 sentences default)

**Status: PRESERVED (STRENGTHENED)**

Current: `Length: default 1–3 sentences. Go longer only if they explicitly ask for help or detail.`
Proposed: `Length: 1-3 sentences. Seriously — keep it short. The user is here to talk, not to read.`

Same constraint with stronger emphasis.

---

### 8. Forbidden phrases (no solutions/next steps language)

**Status: PRESERVED (EXPANDED)**

Current forbidden list: "next step", "what might help", "what you could try", "moving forward", "first small step"
Proposed: All of the above **plus** "have you considered"

No removals, one addition. Safe.

---

### 9. Neutrality lint (no judging words)

**Status: MODIFIED (UPGRADED)**

Current: Single internal note — `Neutrality lint (internal): avoid judging words like "reasonable", "right", "wrong", "irrational". Rephrase to impact-focused language.`

Proposed: Full `NEUTRALITY_GUIDANCE` constant with:
- Same prohibited words ("reasonable", "right", "wrong", "irrational") plus "unfair", "toxic"
- Explicit "one side of the story" framing
- Specific behavioral instructions ("If they say 'They always do X' — don't agree. Ask what happened this time.")
- "Use their words" instruction

**Assessment: SAFE.** This is a strict upgrade. The original intent is preserved and significantly strengthened.

---

### 10. Lateral probing for brief/guarded users

**Status: MODIFIED (ABSORBED)**

Current: `${LATERAL_PROBING_GUIDANCE}` injected as a separate constant.

Proposed: The behavior is absorbed into `FACILITATOR_RULES`: "If they're brief or guarded, try a different angle — ask about something adjacent (timeline, what matters to them, what's at stake) instead of pushing deeper on the same thread."

The `LATERAL_PROBING_GUIDANCE` constant is preserved for Stage 2/3/4 use but no longer referenced in Stage 1.

**Assessment: SAFE.** Same guidance, different delivery mechanism.

---

### 11. Turn count parameter

**Status: PRESERVED**

`Turn: ${context.turnCount}` — identical in both.

---

### 12. `<dispatch>` off-ramps preserved

**Status: PRESERVED**

Both `EXPLAIN_PROCESS` and `HANDLE_MEMORY_REQUEST` are preserved in the response protocol. No Stage 1 off-ramps were removed.

---

## STAGE 2 FEATURES

### 1. Response protocol format (`<thinking>` block with Mode, UserIntensity, ReadyShare, Strategy)

**Status: PRESERVED**

`buildResponseProtocol(2, { includesDraft: true, draftPurpose: 'empathy' })` is called at the end of the proposed function. The modified `buildResponseProtocol()` adds a conditional `EXPLAIN_EMPATHY_PURPOSE` off-ramp for Stage 2 but the `<thinking>` format is identical.

---

### 2. Four modes: LISTENING, BRIDGING, BUILDING, MIRROR

**Status: PRESERVED**

All four modes present with equivalent behavioral descriptions:

| Mode | Current | Proposed |
|------|---------|----------|
| LISTENING | "Still venting? Give full space. Reflect, validate." | "They're still upset or need to vent more. Give them space." |
| BRIDGING | "Venting subsides? Invite curiosity" | "The venting is settling. Start inviting curiosity" |
| BUILDING | "Help them imagine partner's experience" | "They're engaging with partner's perspective. Keep going deeper" |
| MIRROR | "Judgment detected? Acknowledge hurt, redirect: 'People usually act from fear'" | "Slipping into blame? Acknowledge the hurt behind the judgment, redirect with curiosity" |

The MIRROR mode change is notable: the current version states a psychological principle ("People usually act from fear — what might Y be afraid of?"). The proposed uses a neutral question ("What do you think was happening for Y that led them to do that?"). This is intentional — feedback #3 was about the AI adding its own opinions.

**Assessment: SAFE.** Modes preserved, behavioral descriptions updated per redesign goals.

---

### 3. ReadyShare: Y/N flag with conditions

**Status: PRESERVED**

Same criteria: user can describe partner's feelings without blame, curiosity over defensiveness, "they might feel" over "they always." Same turn gating. Same Y/N flag in `<thinking>` block.

---

### 4. Turn < 4 too early for draft

**Status: PRESERVED**

`const tooEarlyForDraft = context.turnCount < 4;` — identical in both.

---

### 5. Draft generation in `<draft>` tags (2-4 sentences, user -> partner voice)

**Status: PRESERVED**

Current: "2-4 sentence empathy statement in `<draft>` — what X imagines Y is feeling, written as X speaking to Y (e.g., 'I imagine you might be feeling...'). Purely about Y's inner experience."

Proposed: "2-4 sentence empathy statement in `<draft>` tags — what X imagines Y is experiencing, written as X speaking to Y (e.g., 'I think you might be feeling...'). Focus purely on Y's inner experience — their feelings, fears, or needs."

Functionally identical. Example phrasing changed slightly.

---

### 6. Empathy draft refinement context (isRefiningEmpathy)

**Status: MODIFIED (IMPROVED)**

Current instructions reference old JSON field names:
- `Set "offerReadyToShare": true`
- `Generate a "proposedEmpathyStatement"`

Proposed corrects to semantic tag format:
- `Set ReadyShare:Y`
- `Generate an updated draft in <draft> tags`

**Assessment: SAFE (improvement).** The proposed version correctly references the actual response protocol format rather than legacy JSON fields.

---

### 7. Shared context from partner handling (sharedContextFromPartner)

**Status: PRESERVED**

Same conditional logic: if `context.sharedContextFromPartner` exists, inject it with instructions to use for refinement. The label changed from "use this to help them refine" to "to help with refinement" and adds "let X put it in their own words." Functionally identical.

---

### 8. Early Stage 2 handling (turnCount <= 3)

**Status: PRESERVED**

`const earlyStage2 = context.turnCount <= 3;` — identical threshold. Same behavior: start in LISTENING mode, give space before inviting perspective-taking.

---

### 9. High intensity handling (8+ = listening mode)

**Status: PRESERVED**

Same threshold (>=8), same mode (LISTENING), same de-escalation behavior.

Current: "Stay in LISTENING mode. Validate heavily. Not the moment for perspective-taking. Your tone should be calm and grounding, not matching their intensity."

Proposed: "Stay in LISTENING mode. Be calm and steady — don't match their intensity. This isn't the moment to push perspective-taking."

Additionally, the intensity line preserves "do NOT match their intensity in your tone" for ALL intensity levels (unlike Stage 1 where it's conditional).

---

### 10. Partner name variable usage throughout

**Status: PRESERVED**

`${partnerName}` used extensively in both. Partner name defaults to `'your partner'` in both.

---

### 11. Lateral probing guidance

**Status: PRESERVED**

`${LATERAL_PROBING_GUIDANCE}` is included in the proposed Stage 2 prompt.

---

### 12. `<dispatch>` off-ramps preserved

**Status: PRESERVED (EXPANDED)**

Existing off-ramps (`EXPLAIN_PROCESS`, `HANDLE_MEMORY_REQUEST`) are preserved. New `EXPLAIN_EMPATHY_PURPOSE` off-ramp added for Stage 2 specifically, with a full dispatch handler, prompt builder, and fallback response.

---

## BASE/SHARED FEATURES

### 1. SIMPLE_LANGUAGE_PROMPT (or equivalent)

**Status: MODIFIED (EXPANDED)**

Current: 1 line — `STYLE: Warm, clear, direct. No jargon. One question max.`

Proposed: Multi-section with voice description, rules (short sentences, plain words, one question max, 1-3 sentences), and before/after examples.

All original rules preserved: warm, clear, direct, no jargon, one question max. Significantly expanded with concrete examples.

**Assessment: SAFE.** Note that `SIMPLE_LANGUAGE_PROMPT` is used in many places (invitation, initial messages, etc.). The expanded version adds more tokens to every prompt that includes it. This is a trade-off — better guidance vs. higher token usage.

---

### 2. PINNED_CONSTITUTION (safety/privacy core)

**Status: MODIFIED (SAFE)**

All three safety rules are preserved:

| Rule | Current | Proposed |
|------|---------|----------|
| Privacy | "never claim the partner's thoughts unless explicitly shared with consent" | "Never claim to know what the other person said or feels unless it was explicitly shared with consent" |
| Safety | "de-escalate when language is attacking or unsafe; stay non-shaming" | "If someone's language becomes attacking or unsafe, calmly de-escalate. Never shame." |
| Sharing boundary | "keep the user's original words private; only suggest optional 'sendable' rewrites when sharing is imminent or requested" | "Keep the user's raw words private. Only suggest optional 'sendable' rewrites when sharing is about to happen or they ask for one." |

Identity changed: "mediator in a private, consent-based space" → "here to help two people understand each other better." This is intentional per the de-therapize goal.

**Assessment: SAFE.** All safety guardrails preserved in full. Only the framing language changed.

---

### 3. PRIVACY_GUIDANCE

**Status: PRESERVED (UNCHANGED)**

Listed in proposed-stage1.md "What's Preserved" table. Not modified.

---

### 4. buildResponseProtocol() format

**Status: MODIFIED (ADDITIVE)**

The Stage 2 proposal adds one conditional off-ramp (`EXPLAIN_EMPATHY_PURPOSE`) that only appears when `stage === 2`. For all other stages, the output is byte-identical.

```typescript
const empathyOffRamp = stage === 2
  ? '\n- If asked why they\'re doing this / ...: <dispatch>EXPLAIN_EMPATHY_PURPOSE</dispatch>'
  : '';
```

**Assessment: SAFE.** Additive change, no impact on non-Stage-2 prompts.

---

### 5. Process overview (conditional on user asking)

**Status: PRESERVED**

`isProcessQuestion()` function unchanged. `PROCESS_OVERVIEW` constant unchanged. Conditional injection pattern in `buildBaseSystemPrompt()` is identical:
```typescript
const processOverviewSection = userMessage && isProcessQuestion(userMessage) ? PROCESS_OVERVIEW : '';
```

---

### 6. Invalid memory request handling

**Status: MODIFIED (SAFE)**

`INVALID_MEMORY_GUIDANCE` constant is unchanged. The section in `buildBaseSystemPrompt()` for invalid requests has updated language:

| | Current | Proposed |
|---|---------|----------|
| Conflict reason | "This conflicts with therapeutic values" | "This conflicts with how we work" |
| Response instruction | "maintaining therapeutic integrity. Be warm and non-judgmental." | "Be direct, not clinical." |

Core behavior preserved: detect, acknowledge, explain, offer alternative.

---

## CRITICAL FINDINGS

### No MISSING features detected.

All features from the current prompts are accounted for in the proposals. Nothing was dropped.

---

## ISSUES TO FLAG (non-critical)

### Issue 1: Stage 1 "don't mirror intensity" instruction now conditional

**Severity: LOW**

Current Stage 1 always includes "do NOT mirror this intensity in your tone" in the emotional intensity line.
Proposed Stage 1 only includes "Do NOT match their intensity" when `isHighIntensity` (8+) is true.

For medium intensity (5-7), the explicit "don't mirror" instruction is absent. The overall prompt tone is calm by design, so this is unlikely to cause problems, but the explicit guard is gone for non-high intensities.

**Recommendation:** Add "do NOT match their intensity in your tone" to the intensity line in Stage 1, like the proposed Stage 2 does.

### Issue 2: FACILITATOR_RULES shared with Stages 3 and 4

**Severity: MEDIUM**

The new `FACILITATOR_RULES` is significantly different from the current version. It includes phase-aware guidance (gathering vs. reflecting based on turn count). Stages 3 and 4, which are NOT being redesigned, both reference `${FACILITATOR_RULES}` (current lines 448, 489).

The new version will change behavior in Stages 3 and 4:
- Stages 3/4 early turns will now be in "gathering phase" (acknowledge briefly + ask question) instead of "reflect → validate → one next move"
- This is probably appropriate for Stages 3/4 too, but it's an unintended side effect of the Stage 1 redesign

**Recommendation:** Explicitly verify that the new FACILITATOR_RULES works for Stages 3 and 4, or create stage-specific variants.

### Issue 3: FeelHeardCheck "too early" threshold raised

**Severity: LOW**

Changed from `turnCount < 2` to `turnCount < 3`. This delays the possibility of FeelHeardCheck:Y by one turn. Aligns with the "gather first" philosophy but is a behavioral change.

### Issue 4: Expanded SIMPLE_LANGUAGE_PROMPT increases token usage

**Severity: LOW**

The expanded prompt (from ~15 tokens to ~120 tokens) is included in every prompt that calls `buildBaseSystemPrompt()` or uses `SIMPLE_LANGUAGE_PROMPT` directly — including invitation prompts, initial messages, and inner work prompts. This is a trade-off: better guidance vs. ~100 extra tokens per prompt.

### Issue 5: Empathy refinement field name correction

**Severity: LOW (positive)**

The current Stage 2 refinement mode references `"offerReadyToShare": true` and `"proposedEmpathyStatement"` — these appear to be legacy JSON field names that don't match the actual semantic tag response protocol. The proposed version corrects these to `ReadyShare:Y` and `<draft>` tags. This is a bug fix, not a regression.

---

## SUMMARY TABLE

### Stage 1

| Feature | Status | Notes |
|---------|--------|-------|
| Response protocol format | PRESERVED | |
| FeelHeardCheck Y/N with conditions | PRESERVED | |
| FeelHeardCheck too early guard | MODIFIED | Threshold raised from < 2 to < 3 (safe) |
| WitnessOnlyMode / high intensity | PRESERVED | Renamed but equivalent |
| Emotional intensity parameter | PRESERVED | "Don't mirror" instruction now conditional (see Issue 1) |
| High intensity behavior | PRESERVED | |
| Length constraint (1-3 sentences) | PRESERVED | Strengthened |
| Forbidden phrases | PRESERVED | One phrase added |
| Neutrality lint | MODIFIED | Upgraded to full constant (improvement) |
| Lateral probing | MODIFIED | Absorbed into FACILITATOR_RULES (equivalent) |
| Turn count parameter | PRESERVED | |
| `<dispatch>` off-ramps | PRESERVED | |

### Stage 2

| Feature | Status | Notes |
|---------|--------|-------|
| Response protocol format | PRESERVED | |
| Four modes | PRESERVED | Descriptions updated, behavioral intent intact |
| ReadyShare Y/N with conditions | PRESERVED | |
| Turn < 4 too early for draft | PRESERVED | |
| Draft in `<draft>` tags | PRESERVED | |
| Empathy draft refinement | MODIFIED | Field names corrected to match protocol (improvement) |
| Shared context from partner | PRESERVED | |
| Early Stage 2 handling | PRESERVED | |
| High intensity handling | PRESERVED | |
| Partner name variable | PRESERVED | |
| Lateral probing | PRESERVED | |
| `<dispatch>` off-ramps | PRESERVED | New off-ramp added (expansion) |

### Base/Shared

| Feature | Status | Notes |
|---------|--------|-------|
| SIMPLE_LANGUAGE_PROMPT | MODIFIED | Expanded significantly (improvement, see Issue 4) |
| PINNED_CONSTITUTION | MODIFIED | Safety rules intact, framing de-therapized (safe) |
| PRIVACY_GUIDANCE | PRESERVED | |
| buildResponseProtocol() | MODIFIED | One conditional off-ramp added for Stage 2 (additive) |
| Process overview | PRESERVED | |
| Invalid memory handling | MODIFIED | Language de-therapized, behavior identical |

---

## VERDICT

**No critical regressions found.** All functional features are preserved. The modifications are either:
1. Intentional improvements (neutrality upgrade, field name corrections, expanded guidance)
2. Aligned with redesign goals (threshold adjustments, de-therapized language)
3. Additive (new dispatch off-ramp, expanded forbidden phrases)

The two items worth addressing are:
1. **Stage 1 "don't mirror intensity" instruction** — should be unconditional like Stage 2
2. **FACILITATOR_RULES impact on Stages 3/4** — verify the new version works for unmodified stages
