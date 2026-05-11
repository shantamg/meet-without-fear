# Create Darryl/Shantam Gold Scenario

Create the sanitized `darryl-shantam` gold scenario artifacts.

## Read First

- `docs/product/mwf-holistic-self-improvement-plan.md`
- `docs/product/source-material/golden-transcripts/README.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `eval/gold-scenarios.json`
- `eval/moments/README.md`
- `eval/moment-types.yaml`

Use the local Darryl/Shantam production transcripts only as private source evidence. Do not commit raw production text or exact private wording.

## Objective

Create a third gold scenario, `darryl-shantam`, covering:

- non-intimate neighbor/community conflict,
- lower shared history than intimate partners,
- one side terse, concrete, and frustrated by process questions,
- one side more reflective and broader/self-improvement oriented,
- low-knowledge empathy where "I don't know what is going on for him" is valid,
- observational empathy instead of forced mind-reading,
- concrete sanitation/health need capture,
- topic-frame continuity from Stage 0 through later stages,
- repeated rejected premise/process frustration as durable process state,
- non-empty share-offer content.

## Required Artifacts

Create or update:

- `docs/product/source-material/golden-transcripts/darryl-shantam.md`
- `eval/gold-profiles/darryl-shantam.json`
- `eval/gold-scenarios.json`
- `eval/moments/darryl-shantam-stage-2-low-knowledge-pivot.yaml`
- `eval/moments/darryl-shantam-stage-3-concrete-need-capture.yaml`
- `eval/moments/darryl-shantam-stage-3-offer-sharing-content.yaml`
- required `eval/scorer/judge-prompts/*.md` files if the moment format requires them.

Follow existing schema and style. Do not weaken existing scenarios.

## Transcript Requirements

The canonical transcript must be sanitized and generalized. Do not copy raw production text.

Include Stages 0-3, stopping at both needs captured / needs review-share readiness unless evidence clearly justifies adding Stage 4.

The transcript should demonstrate:

- Stage 1 witnessing arc, not just mechanical reflection,
- Stage 2 pivot from inner-state inference to observational empathy,
- Stage 2 topic-frame continuity,
- Stage 3 acceptance of concrete need without over-therapizing,
- Stage 3 share offer with usable suggested content or explicit unavailable state.

## Validation

Run:

```bash
python3 scripts/test_mwf_moment_eval.py
```

Run any other obvious scenario/moment schema checks discovered in the repo.

Do not run expensive real-LLM gold loops unless the repo docs make the command obvious and the new artifacts are ready.

## Final Report

Summarize:

- files changed,
- how the scenario generalizes the production failure without copying private text,
- validation commands and results,
- schema uncertainty or follow-up needed before the first real-LLM gate.

