# MWF Gold Loop Summary

Run directory: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-024645-james-catherine-iter-01`
Scenario: `james-catherine`
Iteration: `1`
Session: `cmovaxokr0008px1tlfr2z18f`
Stop after stage: `2`
Target score: `4.0`

## Result

- Overall: `3.8` (`eval_warn`)
- `actor_fidelity`: `4` pass=`True`
- `mwf_handling`: `3` pass=`False`
- Hard invariants: none
- Improvement targets: `2`
- Target: owner=`mwf_prompts`, dimension=`mwf_handling`, action=`patch_prompt`
- Target: owner=`eval_harness`, dimension=`transcript_extraction`, action=`patch_eval`
- Gold alignment: `present` actor_sides=`2` mwf_sides=`2`

## Actor Status

- `catherine` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`james`
- `james` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`catherine`

## Artifacts

- Score: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-024645-james-catherine-iter-01/score.json`
- Run data: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-024645-james-catherine-iter-01/run.json`
- Transcripts: `6` file(s)
- Scratch logs: `2` file(s)

## Next Action

- Target not reached. Improver did not run for this iteration.

## Review

- Human review: `needs_human_review`
- Notes: Stage-limited score through Stage 2. Stage 3, Stage 4, non-agreement grace, needs coverage, and Tending were not reached in this run.
