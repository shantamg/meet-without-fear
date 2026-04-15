# Stage: Monitor

Re-enters each tick. Each invocation performs one pass of the promote→close→dispatch loop.

**Important**: The milestone-builder does NOT review or merge PRs. The `pr-reviewer` workspace handles that autonomously (triggered by `bot:needs-review` label on PRs). The monitor tick focuses on orchestration: promoting blocked issues, closing issues whose PRs were merged, and checking milestone completion.

## Input

- Parent issue number (from prompt)
- Milestone branch name (from parent issue comments or derived from title)
- `shared/dependency-parser.md` — parse blocked-by metadata

## Process

1. **Promote blocked→ready**: For each sub-issue labeled `blocked`:
   - Parse its dependencies
   - Check if all dependency issues have the `fix-merged` label (or are closed)
   - If all resolved → post milestone context comment if not already present (see stage 01 format), then swap label from `blocked` to `bot:pr` (NOT `bot:general-pr` — use the registry label, not the workspace name). Only use a different `bot:*` label if the issue explicitly needs a different workspace. **NEVER use `bot:spec-builder` or `bot:milestone-planner`.** Reference `bot/label-registry.json` for valid labels.

2. **Mark issues with merged PRs**: Check for sub-issues that are still open and have a merged PR targeting the milestone branch:
   - Search: `gh pr list --base milestone/{plan-name} --state merged --search "Related to #<issue>"`
   - If a merged PR exists for a sub-issue without the `fix-merged` label:
     - Post a verification comment per `shared/review-conventions.md` (do NOT close the issue)
     - Add the `fix-merged` label to the issue

3. **Notify downstream**: After marking an issue as `fix-merged`, check if any `blocked` issues
   now have all dependencies resolved (all dependency issues have `fix-merged` label). If so, promote them (handled in step 1 next tick).

4. **Check completion**: If ALL sub-issues have the `fix-merged` label → transition to stage 03 (finalize).
   **Do NOT close the parent issue or post "closing milestone" — the parent issue must stay open so the dispatcher continues invoking the milestone-builder for stage 03.**

5. **Comment on parent issue** with tick summary:
   - Issues promoted, issues closed this tick
   - Current status: X/Y sub-issues complete
   - If all complete: "All sub-issues closed — proceeding to finalize (milestone → main PR)"

## Output

- Labels updated (promoted, closed)
- Tick summary comment on parent issue

## Completion

- If all sub-issues closed → proceed to `stages/03-finalize/`
- Otherwise → exit. Next tick re-enters this stage.
