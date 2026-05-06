# Codex Realignment Prompt — Stage 4 Gold-Posture Fixes

Paste the block below to a fresh Codex session. It assumes the Codex session is operating in the Stage 4 worktree at `/Users/shantam/Software/meet-without-fear-stage4-tending` on branch `codex/stage4-tending-focus`.

---

## Prompt to paste

```
Continue Stage 4 / Tending work in the worktree at:

  /Users/shantam/Software/meet-without-fear-stage4-tending

Branch: codex/stage4-tending-focus.

Hard rule: do not edit /Users/shantam/Software/meet-without-fear. Work only in this worktree.

Four parallel audits ran against the Stage 4 redesign and the gold transcripts. Findings live in these audit docs (read all four before starting):

  docs/product/stage-4-audit-backend-foundation.md
  docs/product/stage-4-audit-closure-and-tending.md
  docs/product/stage-4-audit-mobile-ui.md
  docs/product/stage-4-audit-prompts.md

Cross-cutting reference (read first; this is the source of truth for the gold posture):

  docs/product/stage-4-gold-question-analysis.md

Build progress doc with the resolved questions and the running fix tally:

  docs/product/stage-4-tending-build-progress.md

Operating rules from stage-4-tending-continuation-prompt.md still apply:
- worktree-only edits, no main checkout edits
- validate every change with npm run check + relevant test suites
- record commands and results in the build progress doc
- commit at natural sub-checkpoints, push when an issue's contract is settled
- if a decision is ambiguous and materially affects product behavior, add it to "Questions For Shantam" and proceed only if there is a conservative reversible path
- prefer small reviewable passes; do not parallelize hot files
- Stage 4 prompts are owned by this worktree, not the self-improvement loop. Do not auto-apply loop-suggested Stage 4 prompt changes.

Your task: land the four MUST-FIX gold-posture violations from the audit on this branch, before #373 ships. Each fix should be its own commit so reviewers can read them independently.

Fix 1: Stop notifying partner on passive Tending re-entry.
- File: backend/src/services/tending.service.ts (around lines 329-333)
- Current behavior: createPassiveReentry calls publishSessionEvent which invokes notifySessionMembers with only the actor excluded, so the partner receives a tending_reentry_created notification.
- Required behavior: re-entry is private. The partner is only notified after the user chooses a partner-involving path (continue together, propose new round, etc.). Initial passive re-entry must produce no partner-visible side effect.
- Reference: docs/product/stage-4-gold-question-analysis.md Q2 (resolved, high confidence). Evidence: core-protocol-update.md lines 248/289/295, adam-eve.md line 1039 ("We'll hold your choices until [partner]'s check-in is complete").
- Implementation note: keep the actor-side state mutation and the actor-side notification. Strip only the partner-visible publish/notify path on initial passive re-entry. Add a separate code path or flag for the eventual partner-involving choice that re-enables the notification.
- Tests: add a regression test that asserts createPassiveReentry does not cause a partner-visible event to be published.

Fix 2: Resolve the three Stage 4 prompt contradictions.
- File: backend/src/services/stage-prompts.ts
- Current state per the prompts audit: #371 added conversation-led rules on top of the old micro-experiments prompt without removing the contradicting MUST/REQUIRED scaffolding from the old version. Three concrete contradictions:
  a. New rule "do not describe no-overlap as failure" vs old line 901 "a strategy without a follow-up is incomplete" (MUST/REQUIRED).
  b. New rule "ask for follow-up only when shared agreement is forming" vs old FOLLOW-UP CHECK-IN (REQUIRED) block that mandates follow-up on every experiment, including individual ones.
  c. New "effect over formula" guidance vs persisting CELEBRATING mode and "Solid experiment" grading-style praise.
- Required: remove the old contradicting rules. Where the old MUST/REQUIRED language conflicts with the new conversation-led rules, the new rules win. Voice should be observational, not graded. Follow-up cadence is conditional on shared agreement forming, not mandatory per experiment.
- Reference: docs/product/stage-4-audit-prompts.md (full list of contradictions with file:line); docs/product/stage-4-gold-question-analysis.md (cross-cutting posture).
- Tests: extend backend/src/services/__tests__/stage-prompts.test.ts to cover:
  - no-shared-agreement scenario produces no failure-language in the prompt context.
  - individual-only commitment produces no follow-up mandate.
  - assistant praise/grading language ("Solid experiment", "good idea") does not appear in expected output.

Fix 3: Capture remove-pattern must match "That comes off the list" and similar non-imperative phrasings.
- File: backend/src/services/stage4-capture.service.ts
- Current behavior: the remove-pattern regex requires verb+noun and would miss Catherine's literal gold transcript line "That comes off the list" (james-catherine.md, around the proposal-removal moment).
- Required: extend the remove pattern to handle:
  - "that comes off the list"
  - "take that off"
  - "remove that one"
  - "I'm taking [it] back"
  - similar non-imperative removal phrasings
- Maintain the higher confidence threshold for destructive operations; do not lower it. Add unit-test coverage for each phrasing variant.
- Tests: extend backend/src/services/__tests__/stage4-capture.service.test.ts with the verbatim "That comes off the list" line from the transcript and the four similar variants above.

Fix 4: Block "Close with no shared agreement" until partner has submitted at least one selection.
- File: mobile/src/components/Stage4RedesignPanel.tsx (around lines 209-213 and 326-344)
- Current behavior: the close-without-agreement action becomes enabled in COVERAGE_REVIEW phase, allowing one user to unilaterally close before the partner has made any selection. The backend has a partner-inactivity guard but the UI invites the user past it.
- Required: disable the close-without-agreement button until the API state shows partner has submitted at least one Stage4ProposalSelection. The button can become visible earlier with explanatory copy ("Available once both partners have made selections") but it cannot be enabled to commit closure.
- Tests: add component test asserting the close button is disabled when partnerSelections is empty and enabled when partnerSelections.length > 0.

Order of work and validation gate:

- Land Fix 1 first (smallest scope, isolated to one service method, regression test trivial). Commit and push.
- Land Fix 3 (capture regex; clean unit-test scope). Commit and push.
- Land Fix 4 (mobile UI guard; component test scope). Commit and push.
- Land Fix 2 last (prompt cleanup; largest scope and broadest test surface). Commit and push.

After each commit:
- npm run check in affected workspaces (backend, mobile, shared as needed)
- npm test for the relevant test suite using --runInBand
- Update docs/product/stage-4-tending-build-progress.md with: which fix landed, the commit sha, the validation commands used, and the test-pass counts.

After all four fixes commit and push:
- Update PR #373 description to note the 4 must-fix items have landed.
- Add a brief section to docs/product/stage-4-tending-build-progress.md under "Audit Fixes Applied" recording each fix with file:line and test reference.

Do not pick up the Should-fix or Lower-priority items in the audit docs in this pass. Those stay open and are listed at the end of each audit doc for a later pass or for the moment evaluator to handle.

If anything is ambiguous about how a fix should be implemented, add the question under "Questions For Shantam" in the build progress doc and proceed only along a conservative reversible path. Do not guess.

When all four fixes are merged or the contract is settled, update the build progress doc's Continuation Prompt section to point at the next workstream (resolving the Should-fix items, or moving #372 forward).
```

---

## Notes for Shantam (do not paste to Codex)

- The four fixes total roughly: ~50 lines in `tending.service.ts`, ~30 lines in `stage-prompts.ts` (mostly deletions), ~40 lines in `stage4-capture.service.ts` (regex + tests), ~10 lines in `Stage4RedesignPanel.tsx` plus a small test. So total under ~150 lines of meaningful change plus tests.
- Fix 2 (prompts) is the largest scope. If Codex wants to scope this further, splitting it into "remove failure language" + "remove mandatory follow-up" + "remove grading voice" as three commits is reasonable.
- After this lands, the remaining Should-fix items (declined-AI-ideas no-re-offer rule, coverage audit "yours to hold beyond this" register, capture kind inference, XCircle warning color, selection-chips-after-closure guard, Tending check-in form-led drift, stale `stage-4-repair.md` doc) are a natural follow-up pass — or they become the first workload for the Moment Evaluator once that's online.
- The audit docs themselves have not been committed to the branch yet. They live only in the agent worktree results that this session piped to disk. Before pasting this prompt, copy the four audit docs and the gold-question-analysis doc to `docs/product/` in the Stage 4 worktree and commit them so Codex can read them.
