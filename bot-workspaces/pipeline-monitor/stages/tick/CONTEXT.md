# Stage: Tick (Monitor)

Re-enters every cron cycle via `--resume`. Each tick runs the full failure mode checklist.

## Input

- Parent milestone issue number (from prompt)
- GitHub state: sub-issue labels, PR targets, comment metadata
- Session memory: what was checked and fixed on prior ticks
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File (MANDATORY)

Source the helper library and verify freshness at the start of every tick:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

The state file contains metadata for all open PRs and issues, updated every ~60 seconds. You **MUST** read issue/PR metadata from this file. You **MUST NOT** call `gh issue view --json labels,state`, `gh issue list`, `gh pr list --json ...`, or `gh issue view --json state` for fields already in the state file.

**Available fields** (do NOT re-fetch via `gh`):
- Issues: `number`, `title`, `state`, `labels`, `assignees`, `updatedAt`, `author_login`
- PRs: `number`, `title`, `baseRefName`, `headRefName`, `labels`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `statusCheckRollup`, `head_sha`, `updatedAt`, `author_login`, `isDraft`

Re-fetching these via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh api repos/shantamg/meet-without-fear/issues/$N/comments --paginate` — to read issue **comments** (not in state file)
- `gh issue view <number> --repo shantamg/meet-without-fear --comments` — to read issue **comments** (not in state file)

Write operations (`gh issue edit`, `gh pr edit`, `gh issue comment`) are unaffected — those use the REST budget.

Any other `gh` read call indicates a bug.

## Process

Run these checks in order. For each, log what you found and any action taken.

### 1. Check sub-issue labels

For each open sub-issue referenced in the milestone plan:
```bash
# Use state file — NOT gh issue view
STATE=$(github_state_issue_field "$N" state)
LABELS=$(github_state_issue "$N" | jq -r '[.labels[]] | join(",")')
```

**Wrong labels** — sub-issues should never have:
- `bot:spec-builder` (upstream workspace, not implementation)
- `bot:milestone-planner` (upstream workspace)
- `bot:milestone-builder` (parent workspace, not sub-issue)

If found: `gh issue edit $N --remove-label "bot:spec-builder" --add-label "bot:pr"`

**Missing dispatch labels** — open sub-issues with no `bot:*` label and no `blocked` label:
- Check if their blockers (from `<!-- blocked-by: -->` comments) are all closed
- If all closed: `gh issue edit $N --add-label "bot:pr"`
- If some open: `gh issue edit $N --add-label "blocked"` (if not already)

### 2. Check PR targets

List PRs from sub-issue branches using the state file:
```bash
# Use state file — NOT gh pr list
for PR_NUM in $(github_state_pr_numbers); do
  BASE=$(github_state_pr_field "$PR_NUM" baseRefName)
  HEAD=$(github_state_pr_field "$PR_NUM" headRefName)
  # check if HEAD matches a milestone sub-issue branch
done
```

For PRs whose branch names match milestone sub-issues but target `main` instead of the milestone branch:
- Comment: "This PR should target `milestone/{plan-name}`, not `main`. Retargeting."
- `gh pr edit $N --base milestone/{plan-name}`

### 3. Check for stale `bot:in-progress`

Sub-issues with `bot:in-progress` label but no active agent:
```bash
# Check _active/ directories for agents working on this issue
ls /path/to/bot-workspaces/_active/agent-*/meta.json 2>/dev/null
```

If the label has been present for >30 minutes with no active agent, remove it so the dispatcher can re-pick the issue:
- `gh issue edit $N --remove-label "bot:in-progress"`

### 4. Check wave promotion

For each sub-issue labeled `blocked`:
- Parse `<!-- blocked-by: X,Y -->` from comments
- Check if all blockers are CLOSED via state file: `github_state_issue_field "$B" state`
- If ALL closed: promote
  ```bash
  gh issue edit $N --repo shantamg/meet-without-fear --remove-label "blocked" --add-label "bot:pr"
  ```

### 5. Check for repeated failures

If you've fixed the same issue (same issue number + same failure type) 3+ times across ticks:
- Stop self-healing for that issue
- Post a comment on the parent milestone issue:
  ```
  ⚠️ Pipeline monitor: #N has had its labels fixed 3 times but keeps reverting.
  This suggests the milestone-builder is overwriting corrections. Needs human attention.
  @shantamg
  ```

### 6. Progress summary

If any actions were taken this tick, post a brief summary comment on the parent issue:
```
🔍 Pipeline monitor tick (HH:MM):
- Fixed: #225 label bot:spec-builder → bot:pr
- Promoted: #289 (blockers #288, #292 now closed)
- No issues: 12/18 sub-issues closed, 3 in progress, 3 blocked
```

If no actions were taken and no new progress since last tick, do NOT post a comment (avoid noise).

### 7. Detect human responses on waiting issues

Issues in interview-style workspaces (`bot:spec-builder`, `bot:needs-info`, `bot:research`) may stall when the bot asked a question and is waiting for a human reply. The dispatcher re-invokes these workspaces on each tick, but if the workspace exited without detecting a new response (e.g., timing issue, or the workspace checked before the human commented), the issue sits idle.

For each open issue with one of these labels (use state file — NOT `gh issue list`):
```bash
SPEC_ISSUES=$(github_state_issues_with_label "bot:spec-builder")
NEEDS_INFO_ISSUES=$(github_state_issues_with_label "bot:needs-info")
RESEARCH_ISSUES=$(github_state_issues_with_label "bot:research")
```

For each issue found:
1. Fetch the comments (most recent first):
   ```bash
   gh api repos/shantamg/meet-without-fear/issues/$N/comments --paginate --jq 'sort_by(.created_at) | reverse | .[] | {user: .user.login, created_at: .created_at, bot: (.user.type == "Bot" or .user.login == "slam-paws" or .user.login == "github-actions[bot]")}' | head -20
   ```
2. Find the most recent bot comment and the most recent non-bot comment.
3. **If a non-bot user commented AFTER the bot's last comment**, the issue is unblocked — clear the waiting-human marker and re-trigger the current workspace:
   ```bash
   # Clear the waiting-human marker so the dispatcher will pick this up
   rm -f "${CLAIMS_DIR:-/opt/slam-bot/state/claims}/waiting-human-${N}.txt"
   CURRENT_LABEL="bot:spec-builder"  # or whichever label the issue has
   gh issue edit $N --repo shantamg/meet-without-fear --remove-label "$CURRENT_LABEL"
   # Brief pause to ensure label removal is registered
   gh issue edit $N --repo shantamg/meet-without-fear --add-label "$CURRENT_LABEL"
   ```
4. Post a Slack notification (see check 10 for format).

**Skip** issues where the bot's last comment is less than 5 minutes old (the workspace may still be processing).

### 8. Detect PR approvals missing verification

PRs that have received a human approval review but have no `bot:verify` label may need verification triggered. This catches cases where a human approved a PR outside the normal bot flow.

```bash
# Use state file for PR labels and review decision — NOT gh pr list
# The state file has reviewDecision (APPROVED/CHANGES_REQUESTED/etc.) and labels.
# Filter locally:
for PR_NUM in $(github_state_pr_numbers); do
  REVIEW=$(github_state_pr_field "$PR_NUM" reviewDecision)
  HAS_VERIFY=$(github_state_pr_has_label "$PR_NUM" "bot:verify" && echo "yes" || echo "no")
  HAS_HUMAN=$(github_state_pr_has_label "$PR_NUM" "bot:needs-human-review" && echo "yes" || echo "no")
  # Check: REVIEW == "APPROVED" && HAS_VERIFY == "no" && HAS_HUMAN == "no"
done
# Note: reviewDecision covers "has any approval". If you need to confirm the
# approver is NOT the bot, that detail is not in the state file — use
# gh pr view $N --json reviews as an escape hatch for that specific check.
```

For each such PR:
1. Verify the approval is from a human (not the bot).
2. Check the PR does not already have `bot:verify` or `bot:needs-human-review`.
3. Add the verification label:
   ```bash
   gh pr edit $N --repo shantamg/meet-without-fear --add-label "bot:verify"
   ```
4. Post a comment on the PR: `Pipeline monitor: human approval detected — triggering verification.`
5. Post a Slack notification (see check 10 for format).

### 9. Detect completed milestone sub-issues

Parent issues with a `bot:milestone-builder` label where ALL sub-issues are now closed should be graduated so the milestone-builder can proceed to its finalize stage. This catches cases where the milestone-builder's own monitor tick missed the completion.

For each open issue with the `bot:milestone-builder` label (use state file — NOT `gh issue list`):
```bash
MILESTONE_ISSUES=$(github_state_issues_with_label "bot:milestone-builder")
```

For each parent issue:
1. Parse the issue body for sub-issue references (lines matching `- [ ] #N` or `- [x] #N` or `Fixes #N` or `#N` in a task list).
2. Check if ALL referenced sub-issues are closed (use state file — NOT `gh issue view`):
   ```bash
   STATE=$(github_state_issue_field "$SUB" state)
   ```
3. If ALL sub-issues are closed but the parent is still open with no recent milestone-builder activity (no bot comment in the last 30 minutes):
   - Re-trigger by removing and re-adding the `bot:milestone-builder` label:
     ```bash
     gh issue edit $N --repo shantamg/meet-without-fear --remove-label "bot:milestone-builder"
     gh issue edit $N --repo shantamg/meet-without-fear --add-label "bot:milestone-builder"
     ```
   - Post a Slack notification (see check 10 for format).

### 10. Slack notifications for auto-graduations

When checks 7, 8, or 9 take action, post a brief Slack notification to the `daily-summary` channel. Use `shared/slack/slack-post.md` for formatting conventions.

```bash
${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
  --channel "C0AMGACJN9E" \
  --text "🔄 *Pipeline monitor*: <DESCRIPTION> on <https://github.com/shantamg/meet-without-fear/issues/$N|#$N>"
```

Message templates:
- **Human response detected** (check 7): `"🔄 *Pipeline monitor*: Human responded on <https://github.com/shantamg/meet-without-fear/issues/$N|#$N> — re-triggering $CURRENT_LABEL"`
- **PR approval detected** (check 8): `"🔄 *Pipeline monitor*: Human approval on <https://github.com/shantamg/meet-without-fear/pull/$N|PR #$N> — triggering bot:verify"`
- **Milestone complete** (check 9): `"🔄 *Pipeline monitor*: All sub-issues closed on <https://github.com/shantamg/meet-without-fear/issues/$N|#$N> — re-triggering milestone-builder"`

Keep messages short. Do NOT include technical details about what the monitor checked.

## Output

- Labels corrected (if needed)
- PRs retargeted (if needed)
- Stale labels cleaned (if needed)
- Waves promoted (if needed)
- Human responses re-triggered (if needed)
- PR approvals routed to verification (if needed)
- Milestone completions re-triggered (if needed)
- Slack notifications posted (if actions taken)
- Summary comment posted (if actions taken)

## Completion

Exit. Next cron tick will resume this session with `--resume`.
