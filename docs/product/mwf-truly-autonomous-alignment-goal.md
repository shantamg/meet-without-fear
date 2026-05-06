# Codex Goal — Truly Autonomous Gold-Alignment System

This is the goal that gets you out of the loop entirely. After it lands, your role is: drop a gold transcript, review auto-PRs. Nothing else. No hand-authored moments, no rubric writing, no manual coverage gaps.

The previous gold-alignment system goal (`mwf-gold-alignment-system-goal.md`, shipped in #375) built the autonomous loop infrastructure but left moment authoring as a human task and shipped a regularization bug that blocks PR creation when baselines are below threshold. This goal closes both gaps.

Paste **Goal Statement** + **Success Criteria** + **Constraints** to a Codex goal session.

## Goal Statement

Make the gold-alignment system genuinely autonomous. After this goal lands:

1. **Drop a gold transcript file** into `docs/product/source-material/golden-transcripts/` and run a single command. The system parses the transcript, identifies every AI turn in it that's worth evaluating, generates the seed state from the prior context, generates moment-specific rubrics (anchored to the transcript content), generates deterministic hard invariants, and writes complete moment yamls + judge prompts ready for the loop to consume. **No human authoring required.**

2. **Cross-moment regularization works correctly:** a revision is accepted when no other moment's score drops below its *previous baseline*, not below an absolute threshold. The system can ship incremental improvements even when most moments are below the eventual target.

3. **Coverage parity:** when transcript B is added after transcript A, the system auto-creates parallel moments in B for every moment-type that exists in A. If A has stage-1-fact-reflection, B gets stage-1-fact-reflection-james-catherine (or however named) automatically. Cross-couple coverage is structural, not aspirational.

4. **The loop is genuinely set-and-forget.** Once installed via cron, it runs weekly, opens auto-PRs labeled `loop:auto-improvement` for revisions that pass real-LLM judging + cross-moment regularization (delta-based) + E2E outer-loop validation. The user reviews PRs. That's the entire human role.

The previous goal built the loop infrastructure. This goal makes it autonomous in the sense the user actually meant.

## Success Criteria

### Phase 1 — Fix the regularization bug (quick unblock)

1. **Delta-based cross-moment regularization.** In `scripts/mwf_alignment_loop.py`, the cross-moment check accepts a revision if every other moment's score is `>= its previous baseline - 0.05` (small tolerance for judge noise). It rejects when any other moment's score drops by more than 0.05 from its baseline. The current threshold-based check is replaced.

2. **Baseline tracking.** The loop persists per-moment baseline scores at `eval/baselines/<moment-id>.json`. Baseline updates only when a revision is merged (not on every run). New moments get an initial baseline from their first real-mode run.

3. **Test coverage.** Add tests covering: (a) revision improves A and keeps B equal → accepted; (b) revision improves A and degrades B by 0.03 → accepted; (c) revision improves A and degrades B by 0.10 → rejected with logged baseline.

4. **Verification.** Re-run the loop on the current library. At least 3 PRs should open (since current production scores have many low-baseline moments where small improvements no longer trip the over-strict threshold check).

### Phase 2 — Auto-extraction of moments from gold transcripts

5. **Transcript parser.** New module `scripts/mwf_extract_moments.py` that takes a transcript path and produces a structured representation: ordered list of turns with role, content, line range, inferred stage (from `## Stage N` markers or content heuristics), and inferred sub-state (e.g. "fact reflection," "emotional pivot," "empathy validation," etc.).

6. **AI-turn identification.** For each AI turn in the parsed transcript, the system identifies which turns are worth becoming moments. Heuristics: turns that demonstrate a stage-specific posture (reflection, consent gate, validation prompt, closure language); turns that follow a clear user trigger; turns that anchor a known sub-state. The system picks 4-8 moments per transcript by default; configurable via `--max-moments`.

7. **Seed state generation.** For each chosen AI turn, the system generates the seed state needed to reproduce that moment: prior message history, stage progress gates implied by the prior conversation, vessel content, etc. Output: a serializable seed shape compatible with `backend/src/scripts/mwf-moment-real.ts`.

8. **Rubric generation via LLM.** For each chosen AI turn, the system uses Bedrock Haiku to generate moment-specific rubric dimensions (3-5 per moment) anchored to the gold posture demonstrated by THAT turn. The rubric generation prompt includes: the full transcript context, the chosen AI turn, the surrounding line range, the protocol-level posture for that stage. Output: yaml-compatible rubric block with verbatim transcript excerpts as evidence.

9. **Hard invariant generation.** For each chosen AI turn, the system identifies stage-jump violations (any later-stage vocabulary that should not appear), advice/solutioning patterns (regex-detectable), and grading-voice patterns. Some are universal (no advice), some are stage-specific (no Stage 2 vocabulary in Stage 1). Output: deterministic Python checks added to the moment's yaml's `hard_invariants` block.

10. **End-to-end onboarding command.** `python3 scripts/mwf_add_gold_example.py docs/product/source-material/golden-transcripts/<new>.md --auto` runs the full pipeline: parse → identify → seed → rubric → invariants → write yamls + judge prompts → run unit tests against the new moments → exit 0 if everything works. The `.draft` suffix from the previous goal is removed; outputs are ready-for-loop.

11. **Idempotence.** Running the onboarding command twice on the same transcript is a no-op (or only updates baselines if line ranges shifted).

### Phase 3 — Coverage parity across gold transcripts

12. **Moment-type taxonomy.** Define a fixed set of moment types that any well-formed gold transcript should have at least one example of: `stage-N-fact-reflection`, `stage-N-emotional-handling`, `stage-N-consent-gate`, `stage-N-validation`, etc. Documented in `eval/moment-types.yaml`.

13. **Coverage check.** New command `python3 scripts/mwf_alignment_status.py --coverage-check` reports per-transcript: which moment types are covered, which are missing. Missing types are scaffolded automatically by the onboarding command on the next run, OR can be manually backfilled.

14. **Cross-couple parity gate.** When a revision is being considered for a stage-N prompt, the cross-moment check now requires the revision to pass against moments from at least 2 transcripts in that stage. If only one transcript covers stage-N, the gate logs a coverage-blind warning and proceeds (graceful degradation).

### Phase 4 — Backfill the existing library

15. **Run the onboarding pipeline against existing transcripts.** Apply `mwf_add_gold_example.py --auto` to each of the three already-checked-in transcripts (`adam-eve.md`, `james-catherine.md`, `core-protocol-update.md`). The output augments the existing 14 hand-authored moments with auto-generated ones to fill coverage gaps.

16. **De-duplicate.** When a hand-authored moment and an auto-generated moment cover the same (transcript, line range, sub-state), prefer the hand-authored one but record the auto-generation evidence in a comment. The hand-authored set is the seed; auto-generation extends it.

17. **Result.** After backfill, every stage has at least 2 moments per existing transcript (where the transcript has stage content). Stage 1 has Adam/Eve AND James/Catherine moments. Stage 2 has same. Stage 3 has same. Stage 4 already had cross-couple coverage and stays balanced.

### Phase 5 — Re-run and validate

18. **Real-mode loop run.** With the bug fixed (Phase 1) and the library backfilled (Phase 4), run `python3 scripts/mwf_alignment_loop.py --real --real-judge`. Expected outcome: PRs are created for the moments where production prompts genuinely don't match gold, and they pass cross-moment regularization (delta-based) + cross-couple parity (Phase 3 gate).

19. **End-to-end gold-flow validation.** Run `python3 scripts/mwf_gold_loop.py browser-smoke` to confirm the existing E2E loop still functions. Run an actual Adam/Eve gold session via the existing skill if available; record the result.

20. **Documentation.** Update `mwf-moment-evaluator-plan.md` with the new auto-extraction architecture. Update `mwf-alignment-status.md` regenerator to include coverage-check output.

### Cross-cutting

21. **Existing 14 moments still pass.** The hand-authored moments must continue to score and improve correctly under the new regularization. Any existing test that breaks must be either fixed or explicitly retired with reasoning.

22. **Tests pass.** `python3 scripts/test_mwf_moment_eval.py` exit 0; total tests grow appropriately.

23. **Backend typecheck passes.** `npm run check --workspace backend`.

24. **Cost cap.** Cumulative Bedrock cost for this goal stays under $50. The Phase 2 rubric/invariant generation is the highest cost driver; budget ~$0.10–0.30 per moment to generate. With ~20-30 new moments across backfill, that's $4–10. Phase 5 verification is ~$1. Total comfortably under cap.

## Stop conditions

- Auto-extraction quality on a sample transcript is bad enough that the generated rubrics are clearly off-target (e.g. they're scoring grammatically rather than for posture). Document the divergence with examples and stop. The fix may be prompt engineering on the rubric-generator, not abandoning the approach.
- Cross-couple parity gate (criterion 14) cannot be implemented because the moment-type taxonomy doesn't cleanly map across transcripts. Document the mismatches.
- Cumulative cost approaches $50.
- Hand-authored moments break in ways that can't be reconciled with the new regularization (criterion 21). Document and stop; the regularization may need tuning.
- The existing E2E loop becomes incompatible with anything Phase 5 needs (it shouldn't — that loop is unmodified — but flagging the stop in case).

## Constraints

- Working directory: `/Users/shantam/Software/meet-without-fear` (main checkout). Branch from main as `feat/autonomous-alignment-<datestamp>`.
- The previous goal's constraints still apply: no direct push to main, no `--apply-to-source` from the loop, branch protection enforced.
- Auto-extraction must NOT modify the gold transcripts. Transcripts under `docs/product/source-material/golden-transcripts/` are read-only.
- Auto-extraction outputs (yamls, judge prompts, baselines) ARE committable. They're treated like generated code: regenerable but checked in for traceability.
- The rubric-generation LLM call MUST use prompt caching for the gold transcript content (it's the same gold across many moment generations).
- If a phase hits a session limit, document where you stopped in the build progress doc; the next session resumes at that phase.
- Each phase commits to the branch incrementally. PR opens at the end of the whole goal.

## Required reading

1. `docs/product/mwf-gold-alignment-system-goal.md` — what the previous goal shipped.
2. `docs/product/mwf-moment-evaluator-plan.md` — moment evaluator architecture.
3. `docs/product/mwf-moment-evaluator-build-progress.md` — what's already built.
4. `docs/product/mwf-gold-alignment-system-build-progress.md` — what shipped in #375.
5. `eval/moments/stage-1-fact-reflection.yaml` and `eval/scorer/judge-prompts/stage-1-fact-reflection.md` — the hand-authored shape that auto-generation should produce.
6. The three gold transcripts in `docs/product/source-material/golden-transcripts/`.
7. `scripts/mwf_alignment_loop.py` — the loop to fix.
8. `scripts/mwf_add_gold_example.py` — the existing scaffolder (to extend).
9. `scripts/mwf_moment_eval.py` and `backend/src/scripts/mwf-moment-real.ts` — the runner pair.

## Build progress

Maintain `docs/product/mwf-truly-autonomous-alignment-build-progress.md`. Phase sections, criterion checkboxes, commits, validation outputs, decisions, questions for Shantam.

## Before declaring goal reached

1. Run the full sequence: extract moments from all 3 existing transcripts → confirm yamls are valid → run the alignment loop with real flags → at least one auto-PR opens → existing browser smoke still passes.
2. Update build progress doc with all 24 criteria validated.
3. Open the PR with the full body of work.
4. Only then declare goal reached.

---

## Notes for Shantam (do not paste to Codex)

- This is the **terminal goal** for the gold-alignment workstream. After it lands, you genuinely walk away.
- The regularization fix (Phase 1) is small — should ship in the first session. PRs may start flowing after that even before the rest of the goal completes.
- Phase 2 (auto-extraction) is the substantive new build. The rubric-generation LLM call is the bet; if it produces reliable rubrics, the system is genuinely autonomous. If rubric quality is hit-or-miss, you'll need a brief manual review pass per new moment — still way less than full hand-authoring.
- Phase 4's backfill is where you'll see the real Stage 1 + Stage 2 + Stage 3 cross-couple coverage land. Worth eyeballing the auto-generated James/Catherine moments before they get committed; if rubrics look off, that's the place to catch it.
- Estimated total Codex runtime: 4-6 sessions. Cost: $20-40 in Bedrock.
- After this lands, your usage flow is exactly: drop transcript → review PRs. The cron handles cadence. The loop handles iteration. The auto-extractor handles coverage.
