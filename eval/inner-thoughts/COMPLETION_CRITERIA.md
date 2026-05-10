# Completion Criteria

The Inner Thoughts goal is complete only when all requirements below are met with actual artifacts.

## Product Pass

- The home composer creates a real Inner Thoughts session from the typed message and does not route through `comingSoonMode`.
- The initial user message is saved as the first user message before the AI response.
- Solo reflection remains useful for journaling, ambitions, ideas, and thought organization without forcing partner-session routing.
- Person-specific relational conversations can earn a polished, dismissible `start_partner_session` CTA.
- Ambiguous person mentions do not reflexively create or promote a partner session.
- The partner CTA opens the existing session drawer/new-session flow with `partnerName` and `innerThoughtsId` carried forward.
- `POST /inner-thoughts/:id/generate-context` creates a usable summary for the new session flow.
- The created partner session starts in Stage 0 and has durable traceability back to the originating `InnerWorkSession` through the `innerThoughtsId` contract or an equivalent persisted link.
- Stage 0 prompt context uses the Inner Thoughts summary to frame the topic faster while making clear that the partner has not participated yet.

## Eval Pass

- Every live-enabled scenario in `scenarios.json` has a completed actor run or an explicit blocker report.
- Each completed actor run ends with `MWF_INNER_THOUGHTS_STATUS` JSON.
- Each run has a scratch log under `docs/product/inner-thoughts-scratch/`.
- Stage outputs map failures, fixes, tests, reruns, scores, screenshots or DOM evidence, and remaining risks.
- Confirmed product or prompt bugs have regression coverage or a tracked exception.
- Any eval-machine weakness found during a run is recorded in Stage 09 with proposed remediation.

## Not A Pass

- UI re-enablement alone is not a pass.
- Passing tests alone is not a pass unless tests cover the product and eval requirements above.
- A mocked-LLM run cannot prove reflection or CTA timing quality.
- A scenario summary without cited artifacts is not a pass.
