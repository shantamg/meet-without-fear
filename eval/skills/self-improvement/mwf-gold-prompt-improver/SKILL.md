---
name: mwf-gold-prompt-improver
description: Propose or implement versioned improvements after an MWF gold-loop score. Use when Codex is asked to inspect score.json, compare gold-session iterations, identify regressions or improvements, improve the mwf-gold-session-tester prompt, propose or patch MWF prompt/code changes, write improvement-plan.md, or create versioned prompt proposal files under eval/prompt-versions.
---

# MWF Gold Prompt Improver

## Purpose

Analyze one MWF gold-loop run and propose the next prompt iteration. In proposal mode, keep production code unchanged. In patch mode, make narrow production prompt/code/test edits when the score identifies a concrete, reproducible bug or prompt issue. This skill always writes recommendations and versioned prompt proposal files when justified.

The improver must route fixes by score ownership. The loop is intended to improve conversation quality on two surfaces:

- the Codex actor skill that plays gold characters,
- the Meet Without Fear internal prompts/product behavior that facilitates the conversation.

Do not collapse all failures into MWF prompt edits. Actor drift and MWF facilitation failures have different owners.

## Inputs

Read the run directory named by the caller first:

- `run.json`
- `score.json`
- `transcripts/*.md`
- `scratch/*.md`
- `adam.last.md`, `eve.last.md`, or other side final messages
- prior sibling run directories for the same scenario when comparing deltas

In `score.json`, prioritize:

- `improvement_targets[]`
- `gold_alignment.actor_fidelity`
- `gold_alignment.mwf_guidance`
- each dimension's `owner`
- each dimension's `recommended_action`
- evidence and rationale for failed or weak dimensions

Then read only the relevant prompt sources:

- Current tester skill: `/Users/shantam/.codex/skills/mwf-gold-session-tester/SKILL.md`
- Tester persona reference: `/Users/shantam/.codex/skills/mwf-gold-session-tester/references/gold-personas.md`
- Self-improvement actor skill: `eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md`
- Self-improvement scorer skill: `eval/skills/self-improvement/mwf-gold-session-scorer/SKILL.md`
- MWF backend prompt source: `backend/src/services/stage-prompts.ts`
- Stage-specific controller/prompt files only if the score identifies a concrete issue there
- Golden references under `docs/product/source-material/golden-transcripts/`

## Outputs

Write the improvement plan to the exact path requested by the caller, normally `<run-dir>/improvement-plan.md`.

Also create versioned proposal files when there is enough evidence for a concrete change:

- Tester prompt proposals: `eval/prompt-versions/tester/<scenario>/vNN.md`
- MWF prompt proposals: `eval/prompt-versions/mwf/<scenario>/vNN.md`

Choose `NN` as the next integer after existing versions. If no concrete prompt change is justified, do not create a version file; say why in `improvement-plan.md`.

If the caller says `Improvement mode: patch`, also write `<run-dir>/patch-summary.md` describing:

- files changed
- bug or score dimension addressed
- tests run
- expected next-run score movement

## Routing Rules

Use `improvement_targets` and dimension ownership to choose the next edit:

- `owner: actor_skill`, `recommended_action: patch_skill`
  - Improve `eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md` when the CLI actor is too cooperative, too polished, too therapeutic, copies gold lines, ignores resistance, over-explains, drives the wrong side, or stops at the wrong boundary.
  - If the issue belongs to the manual tester skill/persona extraction rather than the loop actor, create a tester proposal under `eval/prompt-versions/tester/<scenario>/vNN.md`.
- `owner: mwf_prompts`, `recommended_action: patch_prompt`
  - Improve `backend/src/services/stage-prompts.ts` or a versioned MWF proposal under `eval/prompt-versions/mwf/<scenario>/vNN.md` when MWF rushes, flattens tension, under-witnesses, pushes repair, mishandles resistance, or uses unearned transition language.
- `owner: product_code`, `recommended_action: patch_product`
  - Patch UI/backend/state code and focused tests for control-tag leakage, privacy leaks, CTA/input gating, stage progression, realtime, or persistence failures.
- `owner: eval_harness`, `recommended_action: patch_eval`
  - Patch scorer/transcript/invariant/orchestrator artifacts when the loop cannot reliably know what happened.
- `recommended_action: human_review`
  - Do not patch blindly. Explain what evidence is missing and what artifact would unblock automation.

Use `gold_alignment` to decide whether this is a character-acting problem or a facilitation problem:

- If `gold_alignment.actor_fidelity.<side>.<stage>` shows low `persona_alignment`, missing `resistance_preserved`, `too_compliant`, `too_articulate`, `copied_gold_lines`, or `forced_gold_path`, improve actor-skill/persona instructions before touching MWF prompts.
- If `gold_alignment.mwf_guidance.<side>.<stage>` shows low `witnessing_depth`, weak `resistance_handling`, `earned_transition: false`, `premature_repair: true`, or `privacy_or_consent_issue: true`, improve MWF prompts or product gates depending on the failure.
- If actor fidelity is weak, treat MWF guidance scores as lower-confidence because the product may not have received gold-equivalent pressure.
- If actor fidelity is strong and MWF guidance is weak, route directly to MWF prompt/product improvement.

In proposal mode, do not edit production MWF prompt files or runtime skills. Write versioned proposals. In patch mode, edits are allowed for the routed owner when evidence is concrete. For actor-skill patches, edit repo-owned `eval/skills/...` first; the operator can sync runtime copies with `scripts/sync_mwf_gold_skills.sh`.

## Improvement Plan Shape

Use this structure:

```md
# Gold Loop Improvement Plan

Run: `<run-dir>`
Scenario: `<scenario>`
Score: `<overall_score>`
Classification: improvement | neutral | regression | incomparable

## What Changed

## Likely Causes

## Ownership Routing

List each target as:

- Owner:
- Dimension:
- Recommended action:
- Evidence:
- Chosen edit/proposal:

## Actor Skill Proposal

## MWF Prompt Proposal

## Product/Eval Harness Proposal

## Gold Alignment Notes

Summarize per-side/stage evidence:

- Actor fidelity:
- MWF guidance:
- Confidence:

## Regression Guard

## Next Iteration Notes
```

## Rules

- Separate actor-prompt problems from MWF product/prompt problems.
- Prefer fixing the lowest-level truthful owner. If actor fidelity failed because the actor ignored persona instructions, patch/propose actor-skill changes, not MWF prompts. If MWF under-witnessed a faithful actor, patch/propose MWF prompt changes, not actor behavior.
- Treat exact golden wording as a smell unless the task explicitly asks for transcript replay.
- If score regressed, compare against the previous versioned prompt and identify the most likely regression cause before proposing new changes.
- Prefer narrow prompt proposals tied to score evidence over broad rewrites.
- Do not edit `/Users/shantam/.codex/skills/mwf-gold-session-tester/SKILL.md` directly during an automated loop. Write a versioned proposal instead.
- In proposal mode, do not edit production MWF prompt files directly. Write a versioned proposal under `eval/prompt-versions/mwf/<scenario>/`.
- In patch mode, production edits are allowed only when the score evidence points to a concrete fix. Keep the patch small, add or update focused tests, and do not rewrite unrelated prompts or flows.
- Include acceptance criteria for the next run: which dimension should improve, which dimension must not regress, and what evidence would prove it.
