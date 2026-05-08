# MWF Gold Loop Summary

Run directory: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-022725-james-catherine-iter-01`
Scenario: `james-catherine`
Iteration: `1`
Session: `cmova8thv0008pxyeenglav31`
Stop after stage: `2`
Target score: `4.0`

## Result

- Overall: `3.0` (`eval_fail`)
- `actor_fidelity`: `3` pass=`False`
- `mwf_handling`: `3` pass=`False`
- Hard invariants: none
- Improvement targets: `5`
- Target: owner=`actor_skill`, dimension=`actor_fidelity`, action=`patch_skill`
- Target: owner=`mwf_prompts`, dimension=`mwf_handling`, action=`patch_prompt`
- Target: owner=`mwf_prompts`, dimension=`mwf_handling`, action=`patch_prompt`
- Target: owner=`product_code`, dimension=`ui_state`, action=`patch_product`
- Target: owner=`product_code`, dimension=`realtime_ui`, action=`patch_product`
- Gold alignment: `present` actor_sides=`2` mwf_sides=`2`

## Actor Status

- `catherine` turn `1`: state=`stage_limit_reached`, stage=`2`, blocked_on=`james`
- `james` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`catherine`

## Artifacts

- Score: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-022725-james-catherine-iter-01/score.json`
- Run data: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-022725-james-catherine-iter-01/run.json`
- Transcripts: `6` file(s)
- Scratch logs: `2` file(s)

## Next Action

- Target not reached. Improver did not run for this iteration.

## Review

- Human review: `needs_human_review`
- Notes: The run is structurally scoreable through stop_after_stage=2 and all hard invariants passed. Human review should calibrate whether Catherine's compressed Stage 1 and James's unusually fluent Stage 2 empathy are actor-skill drift, prompt over-steering, or an acceptable live variation.
