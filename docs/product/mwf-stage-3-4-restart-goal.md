# MWF Stage 3-4 Restart Goal

Start from latest `main` after PR #557 merges (squash `8a2683aa`). Do not resume the context-architecture-restart branch.

## Objective

Prove that **Adam/Eve and James/Catherine can complete Stages 3 and 4 cleanly** via real CTAs and real backend lifecycle state, starting from a fresh post-Stage-2 snapshot. No prompt or context-architecture changes should be made until Stage 3/4 has its own clean baseline.

The goal is the same shape as the Stage 2 restart that just merged: surface the real product/UI/state regressions that block Stages 3 and 4, fix them through real button-driven flows, and codify regression coverage so a transcript-only pass can never mask a stuck DB lifecycle.

## Hard Rules (carried forward)

- **Chat-typed text must never trigger CTA actions.** Stage 3 needs capture, Stage 3 proposal capture, Stage 4 inventory rank/select/submit, and Stage 4 commitments/closure all advance only through clicked buttons and their API endpoints. No regex over chat content, no intent detection that side-effects state. The user must press the button. See PR #557 commit body and `no-chat-text-intent-detection` memory.
- Use only Adam/Eve and James/Catherine. Do not introduce Darryl/Shantam or any other gold target.
- `StageProgress.status`, `Message.stage`, and the visible stage label must agree at every step.
- If the AI says "next step" while backend state stays behind, treat it as a hard blocker — not a scoring nuance.
- Stage 1 still advances only through the feel-heard CTA. Stage 2 still uses the empathy draft/share/reveal/validation lifecycle.

## Snapshot Strategy

We already have snapshot infrastructure:

- `backend/scripts/create-snapshot.ts`, `reset-to-snapshot.ts`, `export-db.ts`
- Registry at `eval/gold-snapshot-registry.json` (currently 3 entries, all dated 2026-05-07)
- `mwf_gold_loop.py` accepts `--snapshot-session-id`

The May 7 snapshots predate the Stage 2 fixes in PR #557. **Regenerate fresh Stage-2-pass snapshots from yesterday's clean runs** rather than trusting the older ones:

- **Adam/Eve**: source session `cmp215i9y0008pxo60p0l94lj` (the 19:47 run — first clean 4.0, mutual VALIDATED, just entered Stage 3 `IN_PROGRESS`). Keep `cmp226d8h0008pxi97k7l89ue` (20:15) and `cmp23fpus0008px5qafdt77pq` (20:51) as backups.
- **James/Catherine**: source session `cmp262vnl0008pxlp0mm5lxci` (the 22:05 clean 4.0 run).

Register them under new IDs in `eval/gold-snapshot-registry.json` with `starts_at_stage: 2` (entering 3) and a clear `purpose` line referencing PR #557.

Mark the three May 7 entries as deprecated in the same commit — leave the `.sql` files on disk for now, but new gates should point at the new snapshots.

## Work Order

### 1. Regenerate snapshots

- Confirm `create-snapshot.ts` produces a self-contained `.sql` for a single session ID (Session, Relationship, both Users, all StageProgress, Messages, EmpathyAttempts, ReconcilerResults, ReconcilerShareOffers, and any Stage 3/4 child rows that already exist).
- Generate the two new snapshots above. Commit the `.sql` files under `backend/snapshots/`.
- Update `eval/gold-snapshot-registry.json` and adjust any tests in `scripts/test_mwf_moment_eval.py` that assert registry shape or specific snapshot IDs.

### 2. Verify snapshot replay round-trip

For each new snapshot:

- Reset DB to it with `reset-to-snapshot.ts`.
- Query Postgres directly:
  - `StageProgress` for both users: 0, 1, 2 `COMPLETED`, 3 `IN_PROGRESS`.
  - Both `EmpathyAttempt`s `VALIDATED`, `revealedAt` set, validations recorded for the partner.
  - No leftover Stage 4 rows.
- Open the session URL in agent-browser and confirm the visible Stage 3 starting state matches.
- This round-trip becomes the regression baseline. Add a test for it.

### 3. Add stuck-Stage-3 and stuck-Stage-4 regression coverage

Mirror what PR #557 added for Stage 2 in `scripts/test_mwf_gold_loop.py`:

- Stage 3 must require real `Need` rows (or whatever the Stage 3 capture model is — confirm by reading the schema) attached to both users, not just chat-narration claims.
- Stage 4 must require real proposal/selection/commitment rows, not just chat that says "we agreed."
- A `db_stage_state_matches_stop_gate` style invariant for the Stage 4 stop should fail if either user is still at Stage 3 `IN_PROGRESS` or has no completed selections/commitments.

### 4. Run Adam/Eve from the new snapshot through Stage 4

- `mwf_gold_loop.py --scenario adam-eve --snapshot-session-id <new-id> --stop-after-stage 4 --target-score 4.0`
- Drive only through real CTAs (Stage 3 needs capture inputs, "Add proposal", rank/select, submit, mark done, etc.). When something is stuck, do the same playbook as Stage 2: inspect `useChatUIState` / `chatUIState` derived flags first, then the relevant `ai-orchestrator` or stage controller, then the API endpoints.
- Capture `db-stage-state.json` and verify hard invariants per run.

### 5. Run James/Catherine from the new snapshot through Stage 4

Same protocol. Do **not** start this until Adam/Eve has at least one clean 4.0 run through Stage 4.

### 6. Confirm no Stage 2 regression

After every product code change in steps 4-5, rerun a Stage-2-only verification from a fresh (non-snapshot) start for at least Adam/Eve. If a fix for Stage 3/4 inadvertently weakens the Stage 2 lifecycle (e.g. broadens a UI gate, changes prompt context that affects feel-heard timing), the goal must catch it before continuing.

## Done

- New Stage-2-pass snapshots for Adam/Eve and James/Catherine are committed and registered.
- Adam/Eve and James/Catherine both complete Stages 3 and 4 from snapshot at `score=4.0`, `target_reached=True`.
- DB state at completion: both users at Stage 4 `COMPLETED` with real proposal/selection/commitment rows; no orphaned `IN_PROGRESS`.
- Stage 2 still passes from a fresh start (no regression).
- Regression tests for stuck-Stage-3 and stuck-Stage-4 exist and would fail if the DB lifecycle stops without the chat narration catching it.
- No chat-text intent detection introduced in any controller. No Darryl/Shantam.
- Progress doc records commits, run dirs, DB invariant outcomes, residual risks.

## Cost Estimate

Per the Stage 2 restart cost data: 16 runs at $0.36–$0.62 each totaled $7.32 of MWF backend LLM spend. Stage 3-4 runs from snapshot will be cheaper per iteration (skip Stages 0-2, which were ~half the conversation turns) but Stages 3-4 also generate more structured-output calls (needs/proposals), so call it roughly the same per-run cost. Budget ~$10-15 of backend LLM spend plus Codex orchestration cost, assuming ~15-20 iterations before both scenarios land clean.

## Known Production Hot Spots (from issue #173)

The Stage 3-4 work has a direct production counterpart in [issue #173](https://github.com/shantamg/meet-without-fear/issues/173). As of the most recent investigation comment (2026-05-12):

- **NEED_MAPPING (Stage 3) completion is at 11%** — 18 starts, 2 completions over the measured window.
- **`/needs/validate` fired 8 `VALIDATION_ERROR` responses in ~5 seconds** for one real session on 2026-05-11. A real user was hard-stuck submitting their needs and could not progress out of Stage 1.
- Strategies UI bugs ([#553](https://github.com/shantamg/meet-without-fear/issues/553)) and Stage 4 proposal-quality regressions (PR [#554](https://github.com/shantamg/meet-without-fear/pull/554)) sit on the Stage 4 path.

Treat these as **specific verification targets** during the actor-driven phase (steps 4-5):

1. Reproduce the `/needs/validate` failure mode against the resumed snapshot — submit needs via the real CTA and confirm the API does not return `VALIDATION_ERROR` repeatedly. Capture the failing payload if it does.
2. Verify the actor can navigate the Strategies screen (#553) without UI overlap blocking selection — and if not, surface as a `BLOCKED` finding rather than working around it.
3. Verify Stage 4 proposals are not literal restatements of `topicFrame` (PR #554's guard) — and if PR #554 lands first, the actor's behavior should reflect those new prompt constraints.

## Watch Items (for monitoring)

When monitoring a run of this goal, flag immediately if any of these appear:

- Any regex over chat content in `backend/src/controllers/messages.ts`, `backend/src/controllers/stage2.ts`, or new Stage 3/4 controllers.
- Any code path that writes to a `Need`, `Proposal`, `Commitment`, `Selection`, or equivalent table as a side-effect of `sendMessageStream` rather than via the dedicated Stage 3/4 API endpoints.
- Any test that asserts "typed confirmation is allowed for X CTA."
- Re-introduction of Darryl/Shantam scenario files.
- A `target_reached: True` result on a run whose `db-stage-state.json` shows either user still `IN_PROGRESS` at Stage 4.
- Repeated `VALIDATION_ERROR` responses from `/needs/validate` or any other Stage 3/4 endpoint without a corresponding UI surface that explains what the user must change. The Stage 1 prod incident in #173 happened because errors were silent; if our actor sees the same shape, it's a real product bug, not actor-side mishandling.
