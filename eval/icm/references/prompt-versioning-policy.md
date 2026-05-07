# Prompt Versioning Policy

The self-improvement loop may patch production prompts when artifact evidence justifies it, but durable prompt proposals should be versioned by stage and scenario scope.

## Directories

Use:

- `eval/prompt-versions/mwf/stage-1/`
- `eval/prompt-versions/mwf/stage-2/`
- `eval/prompt-versions/mwf/stage-3/`
- `eval/prompt-versions/mwf/stage-4/`
- `eval/prompt-versions/tester/`
- `eval/prompt-versions/actor/`

Stage-level MWF prompt proposals belong under the matching stage directory. Scenario-specific proposals may use a subdirectory or filename that includes the scenario id.

## Proposal Requirements

Each proposal must include:

- source evidence;
- owner (`mwf_prompts`, `actor_skill`, or another taxonomy owner);
- intended behavior change;
- expected score or invariant movement;
- regression risk;
- rollback notes;
- focused verification command;
- required fresh or snapshot replay gate.

## Patch Mode

Patch mode may edit production prompt sources only when the repair plan cites concrete artifact evidence and verification coverage. Do not use version files as a way to bypass production tests or hard invariants.
