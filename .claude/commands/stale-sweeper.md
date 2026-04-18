# Stale Sweeper — Process Stale Items

You've been given a list of stale GitHub issues and PRs that need action. The cron script already triaged each item and told you what to do — follow its instructions.

## Arguments

`$ARGUMENTS` — Numbered list of items with the action to take for each.

## Guidelines

- **Use sub-agents with `isolation: "worktree"`** for any code changes (fix PRs, conflict resolution, addressing review feedback). Same pattern as fix-bugs.
- **Request reviewers** on new PRs: `--reviewer shantamg`
- **Never close issues or merge PRs** — only humans do that.
- **Don't create duplicate PRs** — check if one already exists for an issue.
- **Be specific in comments** — "This needs @shantamg to check the webhook URL" is good. "What should we do?" is bad.
- **Don't over-invest** — ~5 min per item max. If something is complex, post your analysis as a comment and move on.
- **Clickable GitHub links in Slack**: `<https://github.com/shantamg/meet-without-fear/issues/N|#N>` or `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>`

## Slack Summary

When done, post to `#agentic-devs` via `/slack-post`:

```
*Stale Sweeper — [Date]*

Triaged [N] items:
• #123 — [action taken]
• #456 — [action taken]
```
