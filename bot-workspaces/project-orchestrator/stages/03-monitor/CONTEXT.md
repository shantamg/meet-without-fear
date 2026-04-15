# Stage 03: Monitor (Recurring Tick)

## Input

- `dependency-graph.json` from Stage 02 (or updated from previous tick)
- Milestone branch state (open PRs, merged commits)
- `shared/review-conventions.md` for PR quality-check criteria
- `shared/milestone-conventions.md` for merge strategy

## Process (each tick)

Execute these steps in order. Maximum 3 sub-agents spawned per tick (across all steps).

### Step 1 — Promote unblocked issues

Check all `blocked` issues. For each, parse dependencies using `shared/dependency-parser.md` rules. If all dependencies have the `fix-merged` label (or are closed), promote: remove `blocked`, add the appropriate `bot:{workspace}` dispatch label.

### Step 2 — Quality-check and merge open PRs

List open PRs targeting the milestone branch. For each PR, apply the full quality-check and merge flow from `shared/review-conventions.md`:

- **Passes**: Comment summary, squash merge, post verification comment on linked issue (do NOT close — per `shared/review-conventions.md`), add `fix-merged` label to the issue
- **Needs fixes**: Comment with feedback, spawn fix agent (`isolation: "worktree"`), track review cycle count (max 3)
- **3 failed cycles**: Flag for human attention (cc @shantamg)

### Step 3 — Notify downstream

After any issue's PR is merged, comment on downstream issues that depended on it to inform them the dependency is now available on the milestone branch.

### Step 4 — Spawn builds for ready issues

Find ready issues (those with a `bot:{workspace}` dispatch label) with no open PR. For each (up to remaining agent budget), spawn a sub-agent with `isolation: "worktree"`. The sub-agent must:

1. Read the full issue body and comments
2. Read relevant existing code and docs
3. Implement what the issue describes
4. Create a PR targeting the milestone branch with `Related to #{N}` in body
5. Swap labels: remove the dispatch label, add `bot:pr`

### Step 5 — Check completion

If ALL sub-issues in the dependency graph have the `fix-merged` label (or a merged PR on the milestone branch), transition to Stage 04.

### Step 6 — Write progress

Update `progress.json` with current tick state (tick number, timestamp, lists of promoted/merged/spawned/blocked/ready/closed issue numbers, total count, complete flag).

## Output

- Updated labels on GitHub issues
- PRs merged (or feedback posted)
- Sub-agents spawned for ready issues
- Downstream issues notified
- `progress.json` updated

## Exit Criteria (per tick)

- All promotions applied
- All open PRs reviewed (merged or feedback given)
- Ready issues with no PR have agents spawned (up to budget)
- progress.json written

## Completion

- **If all sub-issues closed**: Proceed to `stages/04-finalize/`.
- **Otherwise**: Exit. The orchestrator will be re-invoked for the next tick. Each tick is idempotent.
