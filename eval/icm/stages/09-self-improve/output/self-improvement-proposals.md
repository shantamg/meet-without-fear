# Self-Improvement Proposals

## Proposal 1: Make Runtime Gold Skills Repo-Backed

- Evidence: `readlink /Users/shantam/.codex/skills/mwf-gold-loop-actor` returned empty, and the runtime skill differed from `eval/skills/mwf-gold-loop-actor/SKILL.md` before mirroring.
- Diagnosis: the self-improvement loop can patch repo skill source without affecting the active runtime skill unless the runtime copy is also updated.
- Files to change: runtime setup, likely by running or improving `scripts/install_mwf_gold_skills.sh`.
- Regression coverage: add a preflight check in `scripts/mwf_gold_loop.py` or ICM Stage 01 to fail loudly when runtime skills are not repo-backed.
- Rollback: remove the preflight if it blocks legitimate non-Codex environments.
- System effect: tightens eval-machine reproducibility.
- Human approval: may be required if replacing non-symlink runtime skill directories.

## Proposal 2: Add Transcript Evidence For Draft Review/Approval

- Evidence: `eval/runs/20260507-024645-james-catherine-iter-01/score.json` says Stage 2 review/approval is not clearly auditable in stable transcripts, while scratch logs show actors reviewed and shared.
- Diagnosis: stable transcript extraction captures submitted empathy statements but not enough visible review/approval state.
- Files to change: transcript extraction code under `backend/scripts/transcripts/` or related transcript metadata generation.
- Regression coverage: fixture or test that Stage 2 transcript includes review/share evidence without exposing private internal analysis.
- Rollback: revert extractor metadata additions if they leak internal implementation details.
- System effect: tightens evidence quality without reducing required fresh gates.
- Human approval: not required for code/test work; required before another real-LLM rerun this cycle.

## Proposal 3: Preserve Concrete Topic Signal In Stage 0

- Evidence: `eval/runs/20260507-024645-james-catherine-iter-01/score.json` and Stage 0 transcripts show Catherine named yelling/personal attacks but the invite topic became generic conflict.
- Diagnosis: topic shaping over-neutralized the safety/volatility signal that the James/Catherine benchmark requires.
- Files to change: MWF Stage 0 prompt/topic shaping in `backend/src/services/stage-prompts.ts` and focused prompt tests.
- Regression coverage: test that user-described yelling/personal attacks remain present as topic-level issue signal without exposing private details.
- Rollback: revert prompt change if it overexposes details in invitee handoff.
- System effect: tightens MWF behavior; does not weaken privacy or completion criteria.
- Human approval: not required for code/test work; required before another real-LLM rerun this cycle.
