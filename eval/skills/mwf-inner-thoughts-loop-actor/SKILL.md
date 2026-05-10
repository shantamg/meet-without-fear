---
name: mwf-inner-thoughts-loop-actor
description: Drive one Inner Thoughts self-improvement scenario from the home composer using agent-browser, maintain scratch evidence, and end with MWF_INNER_THOUGHTS_STATUS JSON.
---

# MWF Inner Thoughts Loop Actor

## Purpose

Use this skill for command-line Inner Thoughts self-improvement loops. The actor drives the current app from the home page composer, continues one solo reflection scenario, records evidence, and stops with machine-readable status.

This is not a gold transcript persona skill. The actor should create realistic pressure for the solo reflection and partner-CTA surfaces without forcing the desired outcome.

## Required References

Read these before acting:

- `eval/inner-thoughts/scenarios.json`
- `eval/inner-thoughts/references/actor-policy.md`
- `eval/inner-thoughts/references/browser-policy.md`
- `eval/skills/mwf-inner-thoughts-loop-actor/references/actor-scenarios.md`
- `eval/skills/mwf-inner-thoughts-loop-actor/references/browser-driving.md`

## Browser Surface

Use `agent-browser` CLI, not the in-app browser.

Core loop:

```bash
agent-browser --session mwf-inner-<run-id> open http://localhost:8082/
agent-browser --session mwf-inner-<run-id> wait --load networkidle
agent-browser --session mwf-inner-<run-id> snapshot -i
```

If the context is stale or closed, run `agent-browser --session mwf-inner-<run-id> close` once, then reopen.

## Operating Rules

- Start at the home page composer.
- Type the scenario's exact starting message first.
- Continue in the actor posture for that scenario.
- Click only local/E2E test CTAs that belong to the actor.
- Do not create a partner session unless the scenario and product behavior make that the legitimate next step.
- Stop when the scenario target is reached, partner setup is needed, a serious bug blocks progress, or the app/tooling fails.
- Keep responses plausible chat length.
- Record evidence under `docs/product/inner-thoughts-scratch/<YYYY-MM-DD>-<run-id>-<scenario-id>.md`.

## Scratch Log

Initialize the scratch log with:

```md
# Inner Thoughts Scratch Log

Date: <YYYY-MM-DD>
Run ID: `<run-id>`
Scenario ID: `<scenario-id>`
Browser URL: `<current URL>`

## Timeline

## Findings
```

Log only evidence that matters: session creation, reflection quality, CTA timing, dismissal, new-session handoff, Stage 0 context use, UI overlap, browser/tooling blockers, and actor drift.

## Status Contract

End every actor run with exactly one compact status block:

````text
MWF_INNER_THOUGHTS_STATUS:
```json
{
  "scenario_id": "journal-organize-ambition",
  "run_id": "example",
  "state": "completed",
  "blocked_on": null,
  "next_action_needed": null,
  "scratch_log": "docs/product/inner-thoughts-scratch/2026-05-10-example-journal-organize-ambition.md",
  "current_url": "http://localhost:8082/inner-work/self-reflection/..."
}
```
````

Allowed `state` values:

- `completed`: scenario target reached.
- `can_continue`: this turn stopped but the actor still has legitimate work.
- `needs_partner_setup`: the CTA/new-session flow needs partner setup or invitation mechanics next.
- `stage0_reached`: partner session reached Stage 0 with Inner Thoughts context.
- `bug_blocked`: product or browser state blocks the run.
- `error`: tooling or setup failed before reliable evaluation.

Keep JSON valid. Use `blocked_on: null` unless a concrete app/tool/human dependency is known.
