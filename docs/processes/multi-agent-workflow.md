---
title: Multi-agent issue execution workflow
sidebar_position: 3
description: Coordination patterns for Codex, Claude Code, and humans working in parallel.
created: 2026-05-12
updated: 2026-05-12
status: living
---

# Multi-agent issue execution workflow

This process is the default way to run parallel delivery when multiple AI agents and a human engineer are active in the same repository.

## Goals

- Prevent merge collisions and duplicate work.
- Keep issue ownership and status explicit.
- Preserve quality gates (`npm run check`, `npm run test`) regardless of author (human or AI).
- Make handoff/resume easy when one agent session ends.

## Recommended ownership model

Use **single-owner issues with explicit handoff windows**.

- One active implementer per issue at a time (Codex, Claude Code, or human).
- Other agents can support with:
  - review comments,
  - test-only validation,
  - documentation alignment,
  - follow-up PRs for narrowly scoped fixes.

Avoid multiple agents committing to the same files on the same branch concurrently.

## Canonical task board fields

Track these fields in every active issue (GitHub issue body or project board custom fields):

- **Owner**: `codex`, `claude-code`, `human`, or specific name.
- **Status**: `todo`, `in_progress`, `blocked`, `review`, `done`.
- **Scope lock**: key paths the owner is editing (for collision prevention).
- **Validation required**: commands expected before PR.
- **Handoff note**: short resume context if ownership changes.

## Branch strategy

- Branch naming: `<owner>/<issue-number>-<short-slug>`
  - Examples: `codex/372-stage4-e2e-fixtures`, `claude/401-auth-cleanup`
- Never share the same working branch across different agents.
- Rebase on `main` before opening PR when practical.

## Work partitioning pattern (best for parallel AI tools)

When an epic has many tasks, split by boundary instead of by random TODOs:

1. **Contract first** (shared types / API contract)
2. **Backend behavior**
3. **Client integration**
4. **Tests and fixtures**
5. **Docs + rollout notes**

Assign one boundary per owner whenever possible.

## Collision prevention protocol

Before starting work:

1. Check open PRs + in-progress issues for overlapping paths.
2. Declare your **scope lock** in the issue:
   - exact directories/files you intend to touch.
3. If overlap exists, either:
   - sequence work (owner A then owner B), or
   - split into stacked PRs with explicit dependency.

## Handoff template

When handing an issue from one owner to another, include:

- Current commit SHA + branch
- What is complete
- What is intentionally unfinished
- Known risks / failing tests
- Next exact command to run

Suggested format:

```md
### Handoff
- Branch: `codex/372-stage4-e2e-fixtures`
- SHA: `<commit>`
- Completed: seeded fixtures + evaluator assertion wiring
- Remaining: mobile assertion update for readiness state
- Checks: `npm run check` ✅, `npm run test` ❌ (`live-ai-full-flow` timeout)
- Next step: `npm run test --workspace e2e -- stage4-eval.spec.ts`
```

## PR conventions for multi-agent teams

Each PR should include:

- Clear issue reference (`Closes #...` or `Part of #...`)
- Scope statement: what is and is not included
- Validation command results
- Follow-up tasks (if intentionally deferred)

## Suggested role split

A practical default with your current team setup:

- **Tron Jenkins (Codex instance):** implementation slices with strong file-level precision; medium-to-large refactors once boundaries are clear.
- **Claude Code:** exploratory debugging, architecture synthesis, docs-heavy alignment.
- **Second Codex / second AI lane:** isolated sub-issues with minimal shared-file overlap.
- **Human engineer:** scope arbitration, architectural decisions, final merge sequencing.

## Immediate rollout plan (this week)

1. Choose 1 active epic (for example Stage 4/E2E hardening) and decompose into issue-level slices.
2. Add `Owner`, `Status`, `Scope lock`, and `Validation required` to each issue.
3. Move each owner to separate branches named by the convention above.
4. Require validation evidence in every PR description before review.
5. Run a daily 10-minute async handoff update in issue comments.


## Plain-English: how I (Tron Jenkins) would work day to day

If we use this workflow, my behavior is simple and predictable:

1. **Pick one ticket, not five.** I only take one issue at a time so my scope is clear.
2. **Announce ownership before coding.** I post "Owner: tron-jenkins", set status to `in_progress`, and list the exact files/folders I plan to edit.
3. **Create my own branch.** I use a branch name like `codex/372-stage4-e2e-fixtures` so nobody else is coding on the same branch.
4. **Work inside the declared scope.** If I discover the fix needs other files, I update the issue first so the team sees the scope change.
5. **Report progress in the issue thread.** Short updates: what changed, what is left, and whether I am blocked.
6. **Run checks and publish results.** I include command output status in the PR so review is fast.
7. **Leave a handoff if I stop mid-way.** If my session ends, the next owner has branch + SHA + next command.

In short: I always make it obvious **what I am doing, where I am doing it, and what state it is in**.

## Concrete example: first outstanding ticket I would take

I would start with **Issue #372 (Stage 4 E2E fixtures and golden-flow evaluation coverage)** because it is currently unchecked in `docs/product/stage-4-tending-build-progress.md` and it provides high leverage: once the fixture/eval coverage is stable, other Stage 4 changes become safer to merge.

### Why this one first

- It is a clear "remaining work" item (not ambiguous discovery).
- It reduces regression risk across all recent Stage 4 behavior changes.
- It can be scoped to mostly test/fixture paths, reducing collisions with feature work.

### Exactly how I would execute it

1. **Claim it publicly** in the issue:
   - Owner: `tron-jenkins`
   - Status: `in_progress`
   - Scope lock: `e2e/**`, `docs/product/stage-4-tending-build-progress.md` (and any explicitly listed fixture files)
   - Validation required: issue-specific test command + repo check command
2. **Create branch**: `codex/372-stage4-e2e-coverage`.
3. **Implement in small commits**:
   - add/fix missing stage-4 fixtures,
   - add assertions for expected closure/tending behavior,
   - update progress doc checkboxes only when each criterion passes.
4. **Post progress notes** every meaningful checkpoint (for example: "fixtures added", "assertions passing locally", "one flaky test remains").
5. **Open PR with explicit scope**:
   - what was changed,
   - what was intentionally not changed,
   - validation results.
6. **If blocked**, leave handoff:
   - branch, SHA, failing command, suspected cause, next command to run.

### How others would know I am on it

They would see all three signals:

- Issue metadata updated (Owner/Status/Scope lock).
- A dedicated branch with issue number in the name.
- Ongoing issue comments with checkpoint updates and final PR link.

That prevents duplicate work from other Codex lanes, Claude Code, or a human engineer.

## Minimal operating rules

- No owner starts coding without a declared scope lock.
- No PR merges without validation output.
- No issue stays `in_progress` without a fresh handoff note for >24h.
- If two owners need the same file, sequence explicitly rather than race.

These four rules alone usually eliminate most multi-agent friction.
