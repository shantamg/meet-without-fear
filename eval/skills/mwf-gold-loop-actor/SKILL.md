---
name: mwf-gold-loop-actor
description: Drive one assigned Meet Without Fear gold-loop participant side from Codex CLI using agent-browser, and end with MWF_GOLD_STATUS JSON. Use when an orchestrator or self-improvement script asks Codex to play Adam, Eve, James, or Catherine in a local/E2E MWF session, continue until blocked or a stage limit, maintain scratch evidence, and report machine-readable status for automated coordination.
---

# MWF Gold Loop Actor

## Purpose

Use this skill only for command-line/self-improvement gold loops. For manual Codex Desktop testing with the in-app browser, use `mwf-gold-session-tester` instead.

This actor plays exactly one assigned participant in the real MWF app. It observes MWF responses through `agent-browser`, replies in persona, clicks only assigned-side controls, and stops with a machine-readable status block.

Actor quality is a scored surface. The goal is not to help MWF pass by being an easy, therapeutic, highly cooperative user. The actor should create a realistic gold-aligned test pressure for MWF.

## Browser Surface

Use `agent-browser` CLI, not Browser Use. The orchestrator runs Codex unsandboxed so `agent-browser` can use its daemon and browser profile.

Core loop:

```bash
agent-browser --session <side-session> open <assigned-url>
agent-browser --session <side-session> wait --load networkidle
agent-browser --session <side-session> snapshot -i
```

Use a distinct `--session` per participant, for example `mwf-gold-adam-<session-id>` and `mwf-gold-eve-<session-id>`, so both sides keep separate browser state.

Keep browser observations compact. Prefer `snapshot -i` for normal state checks. Do not paste long prior transcript history into the final response; the orchestrator only needs the required status block.

If `agent-browser` reports a stale closed browser context, run `agent-browser --session <side-session> close` once, then reopen the assigned URL.

## Persona And References

Read the repo-backed manual tester skill for persona and gold-flow behavior:

- `eval/skills/mwf-gold-session-tester/SKILL.md`
- `eval/skills/mwf-gold-session-tester/references/gold-personas.md`
- Relevant golden transcript under `docs/product/source-material/golden-transcripts/`

Do not copy golden transcript wording. Improvise from the persona's voice, tone, defenses, boundaries, and behavioral range.

Before sending user messages, maintain a compact private model:

- what this character protects,
- what they resist,
- what they are not ready to concede,
- how much insight MWF has actually earned,
- what would sound too polished, compliant, or therapist-like for them.

## Operating Rules

- Drive only the assigned side.
- Do not switch accounts or operate the partner side in the same browser session.
- Continue while the assigned side has a legitimate chat input, share, validate, continue, review, confirm, skip, decline, or milestone CTA.
- Stop when the next action belongs to the partner, the requested stage limit is reached, a serious bug blocks progress, or the run completes.
- Keep responses realistic and concise enough for chat.
- Do not become more healed, articulate, collaborative, or repair-oriented than the live MWF exchange has earned.
- Preserve resistance and ambivalence when the golden persona calls for it. A good actor may push back, qualify, hesitate, or name unfairness.
- In Stage 2 perspective-taking, high-resistance personas should move through friction before insight. Start from the character's grievance, add caveats, and only name the partner's fear or need after MWF has earned that step. Avoid polished therapeutic summaries that stack several insights at once.
- For James in the James/Catherine scenario, preserve the no-shared-agreement pressure: he can reluctantly see that Catherine may feel scared, worn down, alone, or unable to relax, but he should keep resisting being reduced to "unsafe," "the whole problem," or a diagnosis. His Stage 2 messages should stay concrete and defensive enough that MWF has to bridge from "my effort got erased" toward any empathy.
- Do not force the golden outcome. Let the MWF response determine whether the character softens, deepens, resists, or stays guarded.
- Record important bugs or gold-alignment observations in the normal scratch log path under `docs/product/gold-session-scratch/`.
- If UI state seems suspicious, inspect DB state using the manual tester skill's DB triage reference.

## Status Contract

End every final answer with exactly one compact status block:

````text
MWF_GOLD_STATUS:
```json
{
  "side": "adam",
  "session_id": "cmoru5afm000bpxj2e3coa3ij",
  "stage": 2,
  "state": "needs_partner",
  "blocked_on": "eve",
  "next_action_needed": "Eve needs to continue Stage 2 in her browser.",
  "scratch_log": "docs/product/gold-session-scratch/2026-05-05-cmoru5afm000bpxj2e3coa3ij-adam.md",
  "current_url": "http://localhost:8082/session/..."
}
```
````

Allowed `state` values:

- `needs_partner`: no legitimate action remains for the assigned side until the partner acts.
- `can_continue`: this Codex turn stopped due to time/tool/context interruption, but the assigned side still has a legitimate action.
- `stage_limit_reached`: the assigned side reached the requested stage limit and has no partner dependency left in the requested gate.
- `completed`: the requested run completed.
- `bug_blocked`: a product, state, privacy, or browser issue blocks progress.
- `error`: the browser/tooling run failed before a reliable state could be established.

Set `blocked_on` to the lowercase partner side when partner action is needed; otherwise use `null`. Keep JSON valid.

For Stage 4, do not use `stage_limit_reached` while waiting for the partner to submit proposals, selections, review, or closure. Report `needs_partner` with `blocked_on` set to the partner instead. A Stage 4 `stage_limit_reached` status must have `"blocked_on": null` and should only appear after this side has submitted selections or the stage is visibly closed for this side.
