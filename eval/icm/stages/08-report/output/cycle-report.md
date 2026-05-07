# Cycle Report: 20260507-self-improvement-01

## Outcome

Clean pass not achieved. The prior budget stop has been lifted: the user approved allowing at least `4` full fresh real-LLM runs. `james-catherine` has used `2` of `4`, so the cycle can continue after focused fixes.

## What Passed

- `adam-eve` bounded Stage 2 gate passed with score `4.0`.
- All hard invariants passed in all runs.
- The verbal felt-heard path worked in the `adam-eve` run: DB/stage artifacts show `feelHeardConfirmed: true`, and transcripts advanced into Stage 2.
- Services started by all loop runs were stopped.
- `cleanup-browsers` reported no remaining `mwf-gold` sessions to close.

## What Changed

- Eval-machine actor guidance tightened in `eval/skills/mwf-gold-loop-actor/SKILL.md`.
- Runtime actor skill was mirrored at `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md` for the rerun because the runtime copy was not symlinked to repo source.

## Reruns

- `eval/runs/20260507-020609-adam-eve-iter-01`: `adam-eve`, fresh Stage 2, score `4.0`, invariants pass.
- `eval/runs/20260507-022725-james-catherine-iter-01`: `james-catherine`, fresh Stage 2, score `3.0`, invariants pass.
- `eval/runs/20260507-024645-james-catherine-iter-01`: `james-catherine`, fresh Stage 2 after actor patch, score `3.8`, invariants pass.

## Fix Result

The actor patch addressed the primary first-run failure:

- Before patch: `actor_fidelity` score `3`, James Stage 2 too compliant/articulate.
- After patch: `actor_fidelity` score `4`, pass. James kept caveats and resistance while reaching the perspective stretch.

Clean pass still failed because `mwf_handling` scored `3`.

## Remaining Issues

- `mwf_prompts`: Stage 0 topic shaping softened Catherine's concrete concern about yelling and personal attacks into a generic conflict topic. Evidence: `eval/runs/20260507-024645-james-catherine-iter-01/score.json`, `transcripts/catherine-stage0.md`, `transcripts/james-stage0.md`.
- `eval_harness`: Stage 2 stable transcripts do not clearly show the separate review-and-approve step before submitted empathy statements. Scratch logs show review/share occurred, but stable transcripts should make it auditable. Evidence: same run `score.json`, Stage 2 transcripts, and scratch logs.
- Runtime skill installation risk: runtime `mwf-gold-loop-actor` was not repo-symlinked at intake. The file was mirrored manually for this cycle; durable fix should make runtime skills repo-backed.

## Budget Decision

Human approval received to continue up to at least `4` full fresh real-LLM runs. Next recommended action: fix Stage 0 topic shaping and/or Stage 2 transcript auditability, then rerun `james-catherine` bounded Stage 2 within the updated budget.
