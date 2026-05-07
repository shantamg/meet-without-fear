# Cycle Report: 20260507-self-improvement-01

See canonical report at `eval/icm/stages/08-report/output/cycle-report.md`.

Clean pass was not achieved. `adam-eve` passed; `james-catherine` improved from `3.0` to `3.8` after an actor-skill patch but remained below the `4.0` target. The user later approved raising the fresh real-LLM run allowance to at least `4` full runs, so the prior two-run budget stop is lifted for continued focused fixes and reruns.

Primary artifacts:

- `eval/runs/20260507-020609-adam-eve-iter-01`
- `eval/runs/20260507-022725-james-catherine-iter-01`
- `eval/runs/20260507-024645-james-catherine-iter-01`

Changed file:

- `eval/skills/mwf-gold-loop-actor/SKILL.md`

Remaining recommended fixes:

- Preserve the concrete yelling/personal-attacks signal in Stage 0 topic shaping.
- Make Stage 2 draft review/approval auditable in stable transcripts.
- Make runtime MWF gold skills repo-backed instead of manually mirrored.
