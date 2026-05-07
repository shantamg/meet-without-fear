# MWF Gold Loop Summary

Run directory: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-020609-adam-eve-iter-01`
Scenario: `adam-eve`
Iteration: `1`
Session: `cmov9hgva0008px8h37a1x1kf`
Stop after stage: `2`
Target score: `4.0`

## Result

- Overall: `4.0` (`eval_warn`)
- `actor_fidelity`: `4` pass=`True`
- `mwf_handling`: `4` pass=`True`
- Hard invariants: none
- Improvement targets: `2`
- Target: owner=`product_code`, dimension=`ui_state`, action=`patch_product`
- Target: owner=`mwf_prompts`, dimension=`mwf_handling`, action=`human_review`
- Gold alignment: `present` actor_sides=`2` mwf_sides=`2`

## Actor Status

- `adam` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`eve`
- `eve` turn `1`: state=`needs_partner`, stage=`2`, blocked_on=`adam`

## Artifacts

- Score: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-020609-adam-eve-iter-01/score.json`
- Run data: `/Users/shantam/Software/meet-without-fear/eval/runs/20260507-020609-adam-eve-iter-01/run.json`
- Transcripts: `6` file(s)
- Scratch logs: `2` file(s)

## Next Action

- Target reached. Expand the scenario/stage scope or raise the target.

## Review

- Human review: `needs_human_review`
- Notes: Automated score is usable through stop_after_stage=2. Review suspected UI header/name mismatch and calibrate whether Stage 2 praise/formula language is acceptable.
