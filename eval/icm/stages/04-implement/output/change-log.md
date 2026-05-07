# Change Log

## Eval-Machine Changes

- `eval/skills/mwf-gold-loop-actor/SKILL.md`
  - Added explicit Stage 2 guidance for high-resistance personas to move through friction before insight.
  - Added James/Catherine-specific calibration: James can reluctantly see Catherine's fear or exhaustion, but should resist being reduced to "unsafe," "the whole problem," or a diagnosis, and should stay concrete and defensive enough for MWF to earn empathy.
  - Evidence: `eval/runs/20260507-022725-james-catherine-iter-01/score.json` actor-fidelity target.

## Runtime Mirror

- `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md`
  - Mirrored the same patch so the immediate rerun used the changed actor guidance.
  - Risk: runtime skill is not a symlink to repo source. This should be fixed with `scripts/install_mwf_gold_skills.sh` or equivalent human-approved runtime cleanup.

## Product, Prompt, Snapshot, Regression Changes

- Product code: none.
- MWF production prompts: none.
- Snapshot registry: none.
- Prompt-version proposals: none added.
- Regression records: none added. Remaining confirmed issues are tracked in this cycle report rather than closed.
