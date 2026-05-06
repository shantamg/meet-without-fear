# Codex Continuation Prompt: Stage 4/Tending Redesign

You are continuing the Meet Without Fear Stage 4/Tending redesign in this local worktree:

`/Users/shantam/Software/meet-without-fear-stage4-tending`

Hard rule: do not edit `/Users/shantam/Software/meet-without-fear`. That is the main working directory and may contain unrelated active work. All implementation must happen in git worktrees only. If you need a new branch or parallel track, create a sibling worktree under `/Users/shantam/Software/`, record it in the progress file, and work there.

Start by reading:

1. `docs/product/stage-4-tending-build-progress.md`
2. `docs/product/stage-4-tending-technical-spec.md`
3. The GitHub issue for the next unchecked item in the progress file.

Operating rules:

- Do not work in `/Users/shantam/Software/meet-without-fear`; that checkout is used for other active work.
- Work only in git worktrees. The current worktree is `/Users/shantam/Software/meet-without-fear-stage4-tending`.
- Use the worktree branch `codex/stage4-tending-focus` unless the user asks for a different branch.
- Inspect `git status --short --branch` and `git diff` before editing.
- Never revert local changes unless the user explicitly asks.
- Continue the next unchecked implementation issue in `stage-4-tending-build-progress.md`.
- Update `stage-4-tending-build-progress.md` as work progresses: mark completed work, add validation commands/results, note blockers, and add questions for Shantam.
- Validate every change before marking work done: `npm run check` in affected workspaces and relevant test suites must pass. Record commands and results in the progress file.
- An issue is done only when every listed sub-step in the progress file is complete, check/test validation passes, and a PR is opened or merged. Otherwise keep it in progress.
- Commit at natural sub-checkpoints, push the branch when an issue's contract is settled, and open a PR, draft if needed, by the time the issue's mid-state is testable. Do not hoard work locally across sessions.
- If an implementation decision is ambiguous and materially affects product behavior or data shape, add it under "Questions For Shantam" in the progress file and proceed only if there is a conservative reversible path.
- Prefer small, reviewable passes. This is a multi-pass build, not a one-shot rewrite.
- Use subagents only for clearly separable work after the active issue has a stable contract; do not parallelize hot files listed in the progress file.
- Use existing repo patterns and keep compatibility endpoints alive until the mobile flow has moved to the redesigned `/stage4` API.
- The self-improvement loop owns prompt iteration on `codex/mwf-gold-self-improve-*` branches scoped to Stages 1-3. This worktree owns Stage 4 prompts (#371). If the loop proposes Stage 4 prompt changes during this redesign, defer them and surface to Shantam; do not auto-apply.
- Issues #363-#372 are Codex-driven, not pipeline-monitor-driven. Do not add `bot:pr` or `bot:milestone-builder` labels to them.

Current known sequence:

1. #363 - Stage 4 redesign: data model migration
2. #364 - Stage 4 redesign: state service and /stage4 API
3. #365 - Stage 4 redesign: structured conversation capture service
4. #366 - Stage 4 redesign: needs coverage audit
5. #367 - Stage 4 redesign: selection, outcome, and no-shared-agreement closure
6. #368 - The Tending: backend scheduling, responses, and passive re-entry
7. #369 - Stage 4 redesign: mobile proposal inventory, coverage, selection, and outcome cards
8. #370 - The Tending: mobile check-in and passive re-entry surface
9. #371 - Stage 4 redesign: prompts for collaborative proposal development
10. #372 - Stage 4 redesign: E2E fixtures and golden-flow evaluation coverage

First action in every new session:

1. Summarize the current unchecked issue and local git state.
2. State the next concrete implementation step.
3. Make the change, validate it, and update `docs/product/stage-4-tending-build-progress.md`.
