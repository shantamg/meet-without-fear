# Stage 06: Create PR

## Input

- Branch with verified fix pushed to remote (from Stage 05)
- Issue number, title, and labels
- Root cause summary (from Stage 02)
- Files changed (from Stage 04)

## Process

### 1. Create pull request

Use the `shared/skills/pr.md` workflow. Follow `references/pr-conventions.md` for:
- PR title format (varies by label)
- PR body HEREDOC template
- Issue linking: always use `Related to #N` (never `Fixes #N`) — all issues stay open for human verification
- Post verification comment on the issue after PR creation
- Required reviewers: `shantamg`
- Never force-push

### 2. Post-PR label management

For `bot-pr` issues, remove the label after PR creation:
```bash
gh issue edit <issue-number> --repo shantamg/meet-without-fear --remove-label bot-pr
```

The shell script `fix-bugs.sh` also performs this cleanup programmatically after the session ends, as a safety net.

## Output

- PR URL
- Issue linked via `Related to #N`
- Labels updated (bot-pr removed if applicable)

## Completion

This is the final stage. Report back to the orchestrator:

| Field | Value |
|---|---|
| Issue | `#<number>: <title>` |
| Root cause | One-line summary |
| Fix | What was changed |
| PR | URL |
| Review | Awaiting human review from shantamg |

The orchestrator collects reports from all sub-agents and produces a final summary table.
