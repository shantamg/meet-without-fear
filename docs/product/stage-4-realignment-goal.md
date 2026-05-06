# Codex Goal — Stage 4 Gold-Posture Realignment

This file is shaped for Codex's goal-with-success-criteria mode. Paste the **Goal Statement** and **Success Criteria** sections; the rest is supporting context Codex must read before starting.

## Goal Statement

Land the four must-fix gold-posture violations identified by the Stage 4 audit on branch `codex/stage4-tending-focus`, before PR #373 ships. Each fix has a defined behavior change, a defined test, and an audit doc citing the gold-transcript evidence for why the fix is required. The goal is reached when all four fixes are committed, pushed, all tests in scope pass, and the build progress doc is updated.

Out of scope for this goal: Should-fix and Lower-priority items in the audit docs (declined-AI-ideas no-re-offer rule, coverage audit register, capture kind inference, XCircle warning color, selection-chips-after-closure guard, Tending check-in form-led drift, stale `stage-4-repair.md` doc, coverage `needsAddressed` underreporting, `/strategies` deprecation timeline). Those are tracked separately.

## Success Criteria

Each criterion is verifiable by running a command. Codex must self-verify before declaring the goal reached.

### Fix 1 — Passive Tending re-entry is private

1. **Behavior change implemented.**
   - File: `backend/src/services/tending.service.ts`
   - The `createPassiveReentry` function MUST NOT publish any partner-visible Ably event or trigger any partner notification on initial passive re-entry.
   - Actor-side state mutation and actor-side notification remain.
   - A separate code path (function or flag) must exist for the eventual partner-involving choice that re-enables partner notification later. That path is not exercised by initial passive re-entry.

2. **Regression test added and passes.**
   - Test file: `backend/src/services/__tests__/tending.service.test.ts`
   - Test name: includes the phrase "passive re-entry does not notify partner" (case insensitive).
   - The test seeds a resolved session with two participants, calls `createPassiveReentry` on behalf of one user, and asserts that no `notifySessionMembers` / `publishSessionEvent` call was made for the partner. Use jest mocks on the realtime service.
   - Command: `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts --runInBand`
   - Expected: exit 0; the new test is among the passing ones.

3. **Backend typecheck passes.**
   - Command: `npm run check --workspace backend`
   - Expected: exit 0.

### Fix 2 — Capture remove-pattern matches non-imperative phrasings

4. **Behavior change implemented.**
   - File: `backend/src/services/stage4-capture.service.ts`
   - The remove-pattern detection MUST recognize at least these five phrasings as removal intent (case-insensitive, with surrounding sentence context allowed):
     - "That comes off the list"
     - "Take that off"
     - "Remove that one"
     - "I'm taking it back"
     - "Let's drop that"
   - The higher-confidence threshold for destructive operations must remain. Low-confidence matches must still be discarded per the existing v1 contract.

5. **Unit test added and passes.**
   - Test file: `backend/src/services/__tests__/stage4-capture.service.test.ts`
   - One test case per phrasing variant from criterion 4 (5 cases total). Each must seed a session with one active proposal that semantically matches the variant's referent and assert that the proposal moves to `REMOVED` status with a `Stage4ProposalRevision` history row recording the removal.
   - Command: `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage4-capture.service.test.ts --runInBand`
   - Expected: exit 0; all five new cases pass.

### Fix 3 — Mobile guard on close-without-agreement

6. **Behavior change implemented.**
   - File: `mobile/src/components/Stage4RedesignPanel.tsx`
   - The "Close with no shared agreement" action MUST be disabled (not just hidden) when the API state shows `partnerSelections.length === 0`.
   - Disabled state may be visible with explanatory copy ("Available once both partners have made selections" or similar). It MUST NOT be enabled, and MUST NOT permit the close action to fire.

7. **Component test added and passes.**
   - Test file: `mobile/src/components/__tests__/Stage4RedesignPanel.test.tsx`
   - Two new test cases: (a) when `partnerSelections` is empty, the close-without-agreement button is rendered as disabled; (b) when `partnerSelections.length > 0`, the close-without-agreement button is rendered as enabled.
   - Command: `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
   - Expected: exit 0; both new cases pass.

8. **Mobile typecheck passes.**
   - Command: `npm run check --workspace mobile`
   - Expected: exit 0.

### Fix 4 — Stage 4 prompt contradictions removed

9. **Old contradicting rules removed.**
   - File: `backend/src/services/stage-prompts.ts`
   - The following must be deleted (or rewritten so they no longer contradict the new conversation-led rules):
     - Line ~901 directive: `"a strategy without a follow-up is incomplete"` (current MUST/REQUIRED phrasing).
     - The `FOLLOW-UP CHECK-IN (REQUIRED)` block that mandates follow-up cadence on every experiment.
     - `CELEBRATING` mode references and grading-style example responses such as `"Solid experiment"`.
   - Replacements (where applicable) must use observational, non-grading voice consistent with the gold transcript register.

10. **Prompt regression tests added and pass.**
    - Test file: `backend/src/services/__tests__/stage-prompts.test.ts`
    - Three new test cases covering:
      a. `buildStage4Prompt` invoked with a no-shared-agreement scenario produces a prompt context whose rendered string contains no failure-language tokens (`"failed"`, `"unsuccessful"`, `"incomplete"`, `"didn't reach"`, `"couldn't"` — used in the failure sense).
      b. `buildStage4Prompt` invoked with an individual-only commitment produces no follow-up mandate language.
      c. `buildStage4Prompt` produces no grading praise tokens (`"solid experiment"`, `"good idea"`, `"that's a great"`, etc.).
    - Command: `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand`
    - Expected: exit 0; all three new cases pass alongside the existing 79.

### Integration criteria

11. **All four fixes committed as separate commits and pushed.**
    - Command: `git log --oneline origin/codex/stage4-tending-focus | head -10`
    - Expected: at least four commits with messages referencing fix 1 / fix 2 / fix 3 / fix 4 (or audit-aligned naming) in the order they were landed (smallest scope first per the audit's ordering recommendation: Fix 1, Fix 3 capture, Fix 4 mobile, Fix 2 prompts).

12. **Aggregate test suites pass.**
    - Command: `npm run check --workspace backend && npm run check --workspace mobile && npm run check --workspace shared`
    - Expected: exit 0 for each.
    - Command: `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts src/services/__tests__/stage4-capture.service.test.ts src/services/__tests__/stage-prompts.test.ts --runInBand`
    - Expected: exit 0; all targeted suites pass.
    - Command: `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
    - Expected: exit 0.

13. **Build progress doc updated.**
    - File: `docs/product/stage-4-tending-build-progress.md` must contain a new section titled "Audit Fixes Applied" listing each of the four fixes with: the commit sha, the file:line where the fix lives, the test reference, and the validation command output (test-pass count).

14. **PR #373 description updated.**
    - The PR description must include a section noting the four audit must-fix items have landed, with links to the audit docs (`docs/product/stage-4-audit-*.md`). Use `gh pr edit 373 --body-file <path>` or equivalent.

15. **No regressions in pre-existing tests.**
    - Command: `npm test --workspace backend --runInBand 2>&1 | tail -5` (full backend suite)
    - Expected: failure count is the same or lower than the baseline recorded at the start of this work. Baseline must be recorded in the build progress doc before any fix lands.

## Stop conditions (declare goal NOT reached and ask Shantam)

Codex must stop and ask if any of these occur:

- An audit-cited line number does not exist as described (e.g. `stage-prompts.ts:901` does not contain "a strategy without a follow-up is incomplete"). Document the discrepancy in the build progress doc and stop.
- A fix would require changing a contract that is exercised by other in-flight tests or hot paths outside the four audit items. Document and stop.
- A test reveals a deeper issue (e.g. the partner-notification path in Fix 1 is also used legitimately elsewhere and stripping it breaks unrelated functionality). Document and stop; do not paper over with a flag.
- The pre-existing test baseline (criterion 15) cannot be cleanly captured because the suite is currently failing on unrelated grounds. Record the baseline anyway, mark which failures are pre-existing, and proceed cautiously.

## Constraints

- Worktree-only edits. Do not edit `/Users/shantam/Software/meet-without-fear`.
- Branch: `codex/stage4-tending-focus` only.
- Operating rules from `stage-4-tending-continuation-prompt.md` apply: validate before marking done, commit at sub-checkpoints, push when an issue's contract is settled, no `--no-verify`, no `--amend` on pushed commits, no `--force-push`.
- Commit ordering per the audit: Fix 1, Fix 3 (capture), Fix 4 (mobile), Fix 2 (prompts). Smallest scope first; largest scope last.
- Do not pick up Should-fix or Lower-priority items from the audit docs in this goal. They are out of scope.
- Stage 4 prompts are owned by this worktree, not the self-improvement loop. Do not auto-apply any loop-suggested Stage 4 prompt change while this goal is in flight.
- If an ambiguous decision arises that materially affects product behavior or data shape, add it under "Questions For Shantam" in the build progress doc and proceed only along a conservative reversible path.

## Required reading

In this order:

1. `docs/product/stage-4-gold-question-analysis.md` — the cross-cutting gold posture; especially the resolved Q2 (re-entry private until cross) and the cross-cutting "private-by-default but binding-on-cross" principle.
2. `docs/product/stage-4-audit-backend-foundation.md` — Fix 2 evidence is in here.
3. `docs/product/stage-4-audit-closure-and-tending.md` — Fix 1 evidence is in here.
4. `docs/product/stage-4-audit-mobile-ui.md` — Fix 3 evidence is in here.
5. `docs/product/stage-4-audit-prompts.md` — Fix 4 evidence is in here.
6. `docs/product/source-material/golden-transcripts/james-catherine.md` — the "That comes off the list" line for Fix 2 plus the no-shared-agreement closure for Fix 4.
7. `docs/product/source-material/golden-transcripts/adam-eve.md` — line 1039 ("We'll hold your choices...") for Fix 1.
8. `docs/product/source-material/golden-transcripts/core-protocol-update.md` — protocol-level posture.
9. `docs/product/stage-4-tending-build-progress.md` — the parent build doc; updates land here.
10. `docs/product/stage-4-tending-continuation-prompt.md` — operating rules.

## Build progress

Codex must record progress in `docs/product/stage-4-tending-build-progress.md` under a new top-level section "Audit Fixes Applied" added after the existing "Implementation Issues" section. For each criterion as it is met, record:

- Criterion number, brief description.
- Commit sha when applicable.
- Validation command and exit code.
- Test-pass count where applicable.
- Date and time.

If a criterion is hit and then later re-broken by a subsequent fix, mark the earlier check as superseded with the date and the reason. Never silently un-tick a criterion.

## Before declaring goal reached

1. Run all 15 success criteria commands in sequence.
2. Paste each command and its outcome into the build progress doc.
3. Confirm `gh pr view 373` shows the updated description (criterion 14).
4. Confirm `git log --oneline origin/codex/stage4-tending-focus | head -10` shows the four fix commits in the expected order.
5. Only then declare goal reached.

---

## Notes for Shantam (do not paste to Codex)

- The 15 criteria are mostly "did this exact thing happen, verifiable by command." Goal mode will be more useful for forcing rigor than for finding novel solutions — these fixes have known answers per the audits.
- Criterion 11's commit-ordering check is somewhat strict; if Codex chooses to land them in a different order with good reason, that's fine — relax the check at review time.
- Criterion 15 (no regressions) requires capturing a baseline before fixes start. Codex is instructed to do this; if you see it skip the baseline capture, that's worth flagging.
- The audit docs aren't in the Stage 4 worktree yet. Before pasting this goal to Codex, copy them in and commit:
  - `docs/product/stage-4-gold-question-analysis.md`
  - `docs/product/stage-4-audit-backend-foundation.md`
  - `docs/product/stage-4-audit-closure-and-tending.md`
  - `docs/product/stage-4-audit-mobile-ui.md`
  - `docs/product/stage-4-audit-prompts.md`
  Otherwise Codex can't read its own briefing.
