# Cycle Report: 20260507-self-improvement-01

## Outcome

Bounded clean pass achieved. The required live-enabled Stage 2 gates now pass with `MOCK_LLM=false`: `adam-eve` scored `4.0`, and the final `james-catherine` rerun scored `4.0`.

## What Passed

- `adam-eve` bounded Stage 2 gate passed with score `4.0`.
- All hard invariants passed in all runs.
- The verbal felt-heard path worked in the `adam-eve` run: DB/stage artifacts show `feelHeardConfirmed: true`, and transcripts advanced into Stage 2.
- Services started by all loop runs were stopped.
- Final process check found no remaining `mwf_gold_loop`, app dev server, Metro/Expo, codex actor, or `agent-browser` daemon.

## What Changed

- Eval-machine actor guidance tightened in `eval/skills/mwf-gold-loop-actor/SKILL.md`.
- Runtime actor skill was mirrored at `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md` for the rerun because the runtime copy was not symlinked to repo source.
- MWF Stage 0 prompt guidance tightened in `backend/src/services/stage-prompts.ts` so neutral topic framing preserves concrete behavioral signals such as yelling and personal attacks.
- Focused Stage 0 prompt coverage added in `backend/src/services/__tests__/stage-prompts.test.ts`.
- Versioned Stage 0 prompt proposal added at `eval/prompt-versions/mwf/stage-0/v01.md`.
- Product UI patch added in `mobile/src/screens/UnifiedSessionScreen.tsx`: after the invitation modal is closed/shared, ghost dots remain visible until the background Ably AI transition response or error arrives.
- Product Stage 2 sequencing patch added in `mobile/src/hooks/useUnifiedSession.ts`, `mobile/src/hooks/useSharingStatus.ts`, and `mobile/src/utils/shareOfferEligibility.ts`: share-offer fetching is disabled until the current user has submitted their own empathy attempt, so the backend cannot mark a pending offer `OFFERED` during perspective-taking.
- Focused share-offer eligibility coverage added in `mobile/src/utils/__tests__/shareOfferEligibility.test.ts`.

## Reruns

- `eval/runs/20260507-020609-adam-eve-iter-01`: `adam-eve`, fresh Stage 2, score `4.0`, invariants pass.
- `eval/runs/20260507-022725-james-catherine-iter-01`: `james-catherine`, fresh Stage 2, score `3.0`, invariants pass.
- `eval/runs/20260507-024645-james-catherine-iter-01`: `james-catherine`, fresh Stage 2 after actor patch, score `3.8`, invariants pass.
- `eval/runs/20260507-073948-james-catherine-iter-01`: interrupted partial `james-catherine` attempt after Stage 0 prompt patch. No `score.json`, `invariants.json`, complete transcripts, or loop summary; not valid clean-pass evidence.
- `eval/runs/20260507-075001-james-catherine-iter-01`: `james-catherine`, fresh Stage 2 after Stage 0 prompt patch, score `3.5`, invariants pass. Exposed premature share-offer/context-share sequencing.
- `eval/runs/20260507-080727-james-catherine-iter-01`: `james-catherine`, fresh Stage 2 after share-offer fetch gating patch, score `4.0`, invariants pass, verdict `eval_pass`.

## Fix Result

The actor patch addressed the primary first-run failure:

- Before patch: `actor_fidelity` score `3`, James Stage 2 too compliant/articulate.
- After patch: `actor_fidelity` score `4`, pass. James kept caveats and resistance while reaching the perspective stretch.

The Stage 0 prompt patch fixed the topic-shaping failure in the next completed rerun, but that run exposed a separate Stage 2 product sequencing issue. The share-offer fetch gating patch fixed that issue: the final James transcript shows his empathy statement submitted at `2026-05-07 15:21:49`, then the share suggestion at `2026-05-07 15:22:27`.

## Remaining Issues

- Optional full-flow Stage 4 gates were not run; all-stage readiness is not claimed.
- Runtime skill installation risk: runtime `mwf-gold-loop-actor` was not repo-symlinked at intake. The file was mirrored manually for this cycle; durable fix should make runtime skills repo-backed.

## Budget Decision

Human approval allowed up to at least `4` completed fresh real-LLM `james-catherine` runs. This cycle used `4`; the final run reached target.

## Verification And Cleanup

- `npm --workspace backend test -- stage-prompts.test.ts --runInBand`: pass.
- `npm --workspace mobile test -- shareOfferEligibility.test.ts --runInBand`: pass.
- `npm --workspace mobile run check`: pass.
- `git diff --check`: pass.
- Latest final-run service cleanup: `eval/runs/20260507-080723-james-catherine-services/cleanup.json` shows backend and web stopped.
- Process check: no `mwf_gold_loop`, app dev server, Metro/Expo, codex actor, or `agent-browser` daemon remains.
