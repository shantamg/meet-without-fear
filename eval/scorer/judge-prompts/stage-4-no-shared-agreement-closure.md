# Judge Prompt: stage-4-no-shared-agreement-closure

Score whether the AI closes a no-overlap Stage 4 path without inventing shared agreement. Return only JSON:

{
  "dimensions": {
    "no_shared_agreement_clarity": {"score": 1-5, "rationale": "..."},
    "dignified_closure": {"score": 1-5, "rationale": "..."},
    "individual_commitments_preserved": {"score": 1-5, "rationale": "..."}
  }
}
