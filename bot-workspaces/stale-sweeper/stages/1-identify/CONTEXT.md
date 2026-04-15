# Stage: Identify Stale Items

## Input

- Pre-triaged list from cron script (via `$ARGUMENTS`)
- Each item includes: issue/PR number, title, and prescribed action
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file to verify item existence and current state (labels, open/closed). You **MUST NOT** call `gh issue view --json state,labels` or `gh pr view --json state,labels` for fields already in the state file. Re-fetching them via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Verify issue still exists and check state
STATE=$(github_state_issue_field "$N" state)
LABELS=$(github_state_issue "$N" | jq -r '[.labels[]] | join(",")')

# Verify PR state
PR_STATE=$(github_state_pr_field "$N" mergeStateStatus)
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make:
- `gh issue view <number> --repo shantamg/meet-without-fear` — to read issue **body** or **comments** (not in state file)
- `gh pr view <number> --repo shantamg/meet-without-fear` — to read PR **body** or **comments** (not in state file)
- `gh pr diff <number>` — to check for merge conflicts (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. Parse the numbered list of items from arguments
2. Verify each item still exists and is in the expected state via the **state file**
3. Categorize: which need comments, which need code fixes, which need conflict resolution

## Output

Validated and categorized item list ready for processing.

## Completion

Proceed to `stages/2-process/` with the categorized list.
