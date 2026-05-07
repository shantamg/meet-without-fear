# MWF Gold Loop ICM

You are in the durable control plane for the MWF gold-loop self-improvement system.

## Start Here

Read `eval/icm/CONTEXT.md` first. It routes work through intake, triage, repair planning, implementation, verification, rerun, judging, reporting, and self-improvement.

## Folder Map

- `CONTEXT.md`: top-level task router.
- `GOVERNANCE.md`: change authority and non-weakening rules.
- `COMPLETION_CRITERIA.md`: clean-pass requirements.
- `FAILURE_TAXONOMY.md`: primary owner categories for failures.
- `references/`: policies and canonical command references.
- `references/skills-index.md`: repo-backed MWF gold skill source and runtime symlink setup.
- `stages/`: stage contracts with `Inputs`, `Process`, `Outputs`, and `Audit`.
- `self-improvement/`: backlog and proposal area for eval-machine improvements.
- `regressions/`: promoted regression records only.
- `cycles/`: final cycle reports copied from stage 08.

## Durable Rules

- Use the repo-backed MWF skills in `eval/skills/` as specialist modules. Runtime skill paths should symlink to these repo sources; see `references/skills-index.md`.
- Use existing Python and TypeScript harnesses for mechanical execution, especially `scripts/mwf_gold_loop.py`.
- Put working outputs in the current stage `output/` directory or in `cycles/<cycle-id>/`.
- Never modify completion criteria, scoring rubrics, hard invariants, or actor difficulty to make a failing run pass.
- Do not commit raw `eval/runs/`, `docs/product/gold-session-scratch/`, or generated transcript dumps unless explicitly promoted into fixtures, regression records, or gold references.
