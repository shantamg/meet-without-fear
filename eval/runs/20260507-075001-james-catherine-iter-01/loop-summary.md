# MWF Gold Loop Summary

Run directory: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-075001-james-catherine-iter-01`
Scenario: `james-catherine`
Iteration: `1`
Session: `cmovlroif0008pxo06rymivsz`
Stop after stage: `2`
Target score: `4.0`

## Result

- Overall: `3.5` (`eval_fail`)
- `actor_fidelity`: `4` pass=`True`
- `mwf_handling`: `3` pass=`False`
- Hard invariants: none
- Improvement targets: `2`
- Target: owner=`product_code`, dimension=`mwf_handling`, action=`patch_product`
- Target: owner=`mwf_prompts`, dimension=`mwf_handling`, action=`patch_prompt`
- Gold alignment: `present` actor_sides=`2` mwf_sides=`2`

## Actor Status

- `catherine` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`james`
- `james` turn `1`: state=`stage_limit_reached`, stage=`2`, blocked_on=`catherine`

## Artifacts

- Score: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-075001-james-catherine-iter-01/score.json`
- Run data: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-075001-james-catherine-iter-01/run.json`
- Transcripts: `6` file(s)
- Scratch logs: `2` file(s)

## Next Action

- Target not reached. Improver did not run for this iteration.

## Review

- Human review: `needs_human_review`
- Notes: First iteration with no regression baseline. Human review should focus on whether the James Stage 2 share-suggestion timing is a product sequencing defect, transcript rendering artifact, or acceptable reconciler prefetch behavior.
