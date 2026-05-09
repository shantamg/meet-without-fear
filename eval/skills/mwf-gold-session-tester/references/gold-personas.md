# Gold Personas And Stories

Use the golden transcripts as scenario/persona source material for one-side interactive evaluation runs. Do not use them as line-by-line scripts unless the user explicitly asks for a deterministic replay.

## Principle

Extract the story, character voice, emotional posture, resistance patterns, needs, boundaries, and relational stance from the gold data. Then drive the assigned user naturally through the live app.

Good:

- "Drive James as skeptical, tired, defensive, and wanting his effort to count."
- "Drive Catherine as resolved but fair, carrying grief and strong safety/accountability boundaries."
- "Let the actual MWF responses determine the next user message, while staying inside the persona."

Bad:

- Copying the exact golden user lines into the app.
- Trying to force MWF to produce the exact golden facilitator wording.
- Treating a different but high-quality response as a failure because phrasing differs.

## Scenario Discovery

When a prompt names a character, first discover which gold transcript contains that character. Check `docs/product/source-material/golden-transcripts/README.md` and the transcript filenames/content. For the bundled examples:

- Adam -> `adam-eve.md`
- Eve -> `adam-eve.md`
- James -> `james-catherine.md`
- Catherine -> `james-catherine.md`

If a new gold transcript is added, do not assume it follows the Adam/Eve or James/Catherine patterns. Read that transcript and infer the scenario, characters, tone, sentiment, and role behavior from the transcript itself. If multiple transcripts contain the same character name or no character is named and the current browser/session does not make the role obvious, ask which gold character/scenario to play.

Use bundled examples only as calibration examples, not as a closed taxonomy:

Use `adam-eve.md` for the successful resolution benchmark:

- Observed process shape: both users can move toward shared experiments.
- Core tension: stability/safety versus aliveness/growth.
- Adam's side: fears he is not enough, values the stable life they built, withdraws when change feels like threat.
- Eve's side: feels she is disappearing through accommodation, wants aliveness, growth, and an open future, still loves him and has not decided to leave.
- Useful test pressure: can MWF help each person see the other's real need without collapsing the tension into "travel more" or "be content"?

`james-catherine.md` is a no-shared-agreement benchmark:

- Observed process shape: no forced shared agreement; dignified closure, individual commitments, unresolved needs named.
- Core tension: James feels unseen, criticized, and reduced to a diagnosis; Catherine feels exhausted by volatility and is mostly resolved that communication will not fix it.
- James's side: skeptical of the process, tired, defensive, proud of providing/staying, aware he has a temper but resists being made the whole problem.
- Catherine's side: therapist lens, names volatility/verbal abuse, owns some sharpness but maintains a strong boundary that reacting is not the same as causing the pattern.
- Useful test pressure: can MWF honor safety and non-agreement without pressuring Catherine to reconcile or casting James as a villain?

Use `core-protocol-update.md` as the process contract:

- Private parallel tracks.
- Nothing shared without explicit consent.
- Stage 1 listening without narrative agreement.
- Stage 2 perspective stretch with venting, bridging, building, and mirror handling.
- Stage 3 user-articulated needs, consented side-by-side reveal, open noticing, no AI-authored common ground.
- Stage 4 inventory, needs coverage, individual commitments as first-class possibilities, no-agreement as valid.
- Tending re-entry without pretending an agreement exists when none was made.

## Persona Extraction Checklist

Before driving a gold scenario, skim the relevant transcript and write a compact private model for the assigned character:

```md
Scenario:
Assigned user:
Partner:
Surface complaint:
Underlying hurt/fear:
What they need:
What they resist:
What they can own:
What they should not concede:
Consent posture:
Likely Stage 2 empathy arc:
Likely Stage 3 needs:
Likely choice/closure posture:
Gold risks to test:
```

Use this model to improvise.

## Gold Persona Extraction Protocol

Before playing any gold character, extract the transcript as a behavioral benchmark, not just a story summary. The goal is to understand the character the way a careful reader would: what kind of person they are in this conflict, how they protect themselves, what MWF earns from them, what MWF does not earn, and where they ultimately land.

Do not begin by deciding whether the character "should be cooperative" or "should resist." Begin by reading the transcript for evidence. The behavior model must be inferred from:

- their first private story,
- what they repeat or defend,
- what they correct MWF about,
- what language they accept, reject, or reframe,
- what they can own without collapsing,
- where empathy opens them and where it does not,
- how they respond to partner content,
- what they consent to share versus what they actually agree to do,
- their choices, refusals, commitments, and unresolved needs.

Build this private persona model before sending the first in-character message:

```md
Scenario:
Assigned user:
Partner:
Voice and diction:
  - Their sentence length, directness, formality, vocabulary, profanity, clinical language, humor, and rhythm.
Tone and sentiment:
  - Their emotional temperature, tenderness, anger, guardedness, grief, hope, contempt, fear, shame, or exhaustion.
Default posture:
  - How they enter the process before MWF earns trust.
Defensive style:
  - What they push back on, correct, reject, minimize, intellectualize, deflect, repeat, or refuse to discuss.
Core self-protection:
  - What they are trying not to feel, lose, admit, concede, or be turned into.
Relational stance toward partner:
  - How much care, suspicion, loyalty, attraction, fear, blame, protectiveness, or finality is present.
What MWF can earn:
  - The kind of clarity, softness, accountability, curiosity, regulation, or action the transcript shows this character can reach.
What MWF cannot earn cheaply:
  - The shifts that require substantial evidence, may remain unavailable, or would violate the character.
Non-concessions:
  - Things they must not agree to, soften, apologize for, validate, select, or imply unless the transcript supports it.
Consent and agreement boundaries:
  - What it means when they consent to share, validate a reflection, choose a strategy, pause, decline, or close.
Stage 1 stance:
Stage 2 empathy arc:
Stage 3 needs and reveal posture:
Stage 4 strategy/selection posture:
Choice/closure posture:
Anti-smoothing risks:
  - Ways an AI actor might become too articulate, fair, agreeable, insightful, or repair-oriented.
```

Then drive the live app from this model. If a live MWF prompt is warmer, more leading, or more coherent than the gold facilitator, stay faithful to the character's discovered voice, sentiment, defenses, and relational posture. Better facilitation can earn clarity, regulation, or a small new insight; it should not make the character sound more balanced, fluent, hopeful, forgiving, agreeable, or therapeutic than the transcript supports.

### Behavioral Range

The behavioral range is inferred from the transcript. It is the guardrail against accidentally playing every gold character as a high-insight therapy participant.

For each stage, classify the assigned character's demonstrated or implied range:

- **Voice:** how they sound at this stage.
- **Sentiment:** what emotional temperature they carry.
- **Defenses:** what they resist, avoid, correct, or repeat.
- **Reachable insight:** what they can genuinely see or own here.
- **Unreachable insight:** what would sound too polished, premature, compliant, or unlike them.
- **Action posture:** whether they tend to continue, pause, share, revise, choose, refuse, or defer.

Never exceed the character's behavioral range just because the product asks for the next step. If the product pressures a shift that is not yet earned, treat that as the test: respond in the character's discovered voice with the kind of resistance, qualification, refusal, ambivalence, or boundary the transcript supports.

### Choices Are Evidence, Not Anchors

Do not anchor on the transcript outcome as a predetermined path. The character's choices and ending are evidence about the persona, not marching orders.

Use later transcript choices to understand:

- what kinds of prompts move them,
- what kinds of prompts do not,
- what they mean by "yes," "that fits," "share it," or "I'm ready,"
- where consent differs from emotional agreement,
- when they are complying, genuinely softening, performing fairness, buying time, or becoming clearer,
- what they protect even after insight.

During the live run, answer the actual MWF prompt from the persona model. If the live interaction earns a slightly different response than the gold transcript, allow that difference as long as the tone, sentiment, defenses, and integrity of the character remain faithful. Do not force the old ending; do not smooth the character into the ending you think the app wants.

### Anti-Smoothing Rules

When improvising, avoid making the user more balanced than the transcript. Gold users often contradict themselves, repeat grievances, resist useful prompts, and accept only part of what MWF offers. Preserve that texture.

Watch for these actor errors:

- offering a perfect "both things can be true" formulation before the gold character earns it,
- converting defensiveness into clean accountability too early,
- converting grief or exhaustion into willingness,
- treating a consent/share CTA as emotional agreement rather than only permission to reveal content,
- selecting strategies because they are reasonable rather than because the character would actually choose them,
- using clinical or mediator-like language when the character would be angry, guarded, blunt, or ambivalent,
- making the character easier for the app than the gold transcript made them.

Before every message, ask:

```text
What would this exact person say here, in their own voice, with their current emotional temperature and defenses still intact?
```

## Driving Rules

- Answer the actual MWF prompt, not the prompt from the golden transcript.
- Preserve continuity with what this run has already said, even if it diverges from the transcript.
- Let the persona change gradually if MWF earns it. Do not jump to insight too early.
- Include realistic resistance. Gold evaluation needs corrections, refusal, defensiveness, ambivalence, and boundaries.
- Keep the extracted voice, tone, sentiment, defenses, and non-concessions in force throughout the run. Do not let a good live prompt accidentally make the character easier, smoother, or more therapeutic than the transcript supports.
- Treat consent, validation, and selection as different acts. A character can consent to share, validate that a need is real, and still refuse shared strategies.
- Let choices emerge from the persona. Do not force mutual repair, no-repair, closure, or escalation unless that is what this character would do in this live moment.
- Always respect consent prompts as part of the test. Sharing/validation actions are meaningful product gates.

## Example Calibration: James/Catherine

This is an example of the extraction protocol applied to one bundled gold set. Do not copy these conclusions to new gold transcripts unless the new transcript shows the same behavior.

James/Catherine is a hard no-shared-agreement benchmark. The inferred role model is partially reachable but not repair-aligned.

James's example behavioral range:

- Stage 1: skeptical, tired, defensive; proud of staying/providing; owns temper only with caveats.
- Stage 2: can see Catherine may feel scared, worn down, or alone, but resists being reduced to "unsafe" or "the whole problem."
- Stage 3: needs dignity, respect, acknowledgment, care, and not being turned into a diagnosis; accountability remains tied to fear of erasure.
- Stage 4: may select repair experiments because he wants to prove he tried, but can react strongly if Catherine selects none.
- Closure: can leave angry and hurt while still holding one individual commitment or self-recognition.

Catherine's example behavioral range:

- Stage 1: resolved, safety-boundaried, fair but not hopeful; owns sharpness without equating it with James's escalation.
- Stage 2: can understand James's shame, erasure, and provider identity, but explicitly refuses to make understanding equal excuse or repair.
- Stage 3: needs safety, dignity, accountability, self-trust, autonomy, to be seen, and to be met; may recognize James's needs as real without making them hers to meet.
- Stage 4: should resist shared experiments. She may consider one briefly, then recognize that selecting it repeats the old pattern of looking for one more data point.
- Closure: no shared agreement; individual commitments remain valid; unresolved needs are named without shame.

For Catherine, the most important non-concession is: "I can understand him and still be done." For James, the most important non-concession is: "I caused harm and I also refuse to be only the harm I caused." Preserve both.

## Example Prompts To User

Start a one-side James/Catherine eval:

```text
Use mwf-gold-session-tester. Open the Codex in-app browser as James in a no-Clerk James/Catherine session. Drive only James from the gold persona, improvise naturally, do not copy transcript wording, and evaluate whether MWF honors the no-shared-agreement benchmark.
```

Start a one-side Adam/Eve resolution eval:

```text
Use mwf-gold-session-tester. Open the Codex in-app browser as Eve in a no-Clerk Adam/Eve session. Drive only Eve from the gold persona, improvise naturally, and evaluate whether MWF supports a resolution path without flattening either person's needs.
```

Drive one side only:

```text
Use mwf-gold-session-tester. I am running the other browser. You are James in the James/Catherine scenario. Stay in persona, continue until blocked, and flag gold-flow drift or state bugs.
```

## Evaluation Notes

When a gold persona run exposes a mismatch, classify it:

- Story mismatch: MWF lost the user's actual scenario or added facts.
- Persona mismatch: MWF pressured a user into insight or agreement too fast.
- Process mismatch: MWF skipped consent, reveal, noticing, inventory, or needs coverage.
- Outcome mismatch: MWF forced resolution in James/Catherine or failed to support resolution in Adam/Eve.
- Safety mismatch: MWF minimized volatility, overvalidated contempt, or mishandled boundaries.
- State mismatch: UI/backend gates contradict the gold-aligned process.

The strongest output is not a single score. It is a transcript-backed explanation of where the live app diverged from the gold persona's expected process and what prompt/UI/backend change would make that divergence less likely.
