# Gold Evaluation

Evaluate MWF behavior against effect and process fidelity, not exact wording.

## Canonical Gold Anchors

- `adam-eve.md`: successful resolution path.
- `james-catherine.md`: no-shared-agreement path where closure still has dignity.
- `core-protocol-update.md`: protocol-level principles derived from the examples.
- `gold-flow-eval-harness-spec.md`: rubric and evaluation harness direction.
- `stage-3-golden-alignment-plan.md` and `stage-3-golden-alignment-audit.md`: current Stage 3 target and known drift.

## Rubric Dimensions

Use 1-5 scores when asked for evaluation:

- Listening depth: reflects facts, emotion, meaning, and stakes before moving forward.
- Resistance handling: treats correction/refusal/ambivalence as information.
- Need universality: needs are underlying human needs, not specific demands.
- Needs coverage audit accuracy: agreements honestly address or leave unaddressed confirmed needs.
- Boundary honoring: sharing, validation, continuing, and agreeing remain voluntary.
- Non-agreement grace: no forced compromise; unresolved needs are named with care.
- Tending re-entry quality: follow-up matches actual outcome, not imagined agreement.
- Prompt formula avoidance: uses user context rather than golden-template mimicry.

## Stage 3 Target

The gold-aligned Stage 3 flow is:

1. AI retains Stage 1-2 context but does not present pre-extracted needs as user-owned truth.
2. Each user articulates what matters through conversation.
3. AI offers needs language as suggestion, not correction.
4. Each user confirms their own needs.
5. Each user consents before needs are shared.
6. After both consent, both users see side-by-side needs.
7. AI asks an open noticing prompt such as "What do you notice?"
8. AI does not identify, label, or score common ground for the users.
9. Users process the reveal and validate whether both lists are valid before Stage 4 opens.

Flag any active AI-authored common-ground analysis as drift unless it is clearly inert compatibility.

## Finding Format

Use this shape for actionable findings:

```md
Finding: concise title
Type: prompt | UI | backend-state | realtime | privacy | eval-coverage
Severity: blocker | high | medium | low
Evidence: DOM/DB/code/transcript evidence
Expected gold-aligned behavior: what should have happened
Likely fix: files or contracts to change
Test/eval coverage: suggested regression or rubric check
```

## Fix Framing

For prompt changes:

- Tighten stage instructions around what data is confirmed vs inferred.
- Tell MWF not to summarize partner needs as confirmed unless Stage 3 shared needs are available.
- Prefer "It sounds like you may need..." over "What you need is..." until the user confirms.
- Preserve the user's wording; do not introduce extra needs.

For product/state changes:

- Gate reveal language on DB-backed confirmation/consent.
- Hide chat input during partner-wait states.
- Render explicit waiting copy: who, what action, and whether the user can do anything.
- Keep private AI messages scoped by `forUserId`.
- Add regression tests for stage gates and privacy boundaries.

For eval harness work:

- Create scenario fixtures separate from mock LLM output fixtures.
- Drive user messages with personas while using live AI.
- Extract structured transcripts from DB after runs.
- Store `eval-score.json` with rubric scores, rationales, evidence references, and human review status.
