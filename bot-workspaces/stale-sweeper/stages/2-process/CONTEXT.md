# Stage: Process Stale Items

## Input

- Categorized stale items from Stage 1

## Process

For each item, follow the prescribed action from the cron script:

- **Stale issues without bot labels**: Add `bot:investigate` so the dispatcher picks them up. Do NOT attempt code fixes — that's the bug-fix workspace's job.
- **Stale PRs needing comments**: Post specific, actionable comments. "This needs @shantamg to check the webhook URL" is good. "What should we do?" is bad.
- **Duplicate/overlapping PRs**: Comment noting the overlap, tag humans to decide which to keep.
- **Conflict resolution on PRs**: Resolve in worktree, push fix.

Rules:
- Never close issues or merge PRs — only humans do that
- Don't create duplicate PRs — check if one exists
- ~5 min per item max — if complex, post analysis and move on
- Clickable GitHub links in Slack: `<https://github.com/shantamg/meet-without-fear/issues/N|#N>`

After all items processed, post summary to #bot-ops (channel ID from `.claude/config/services.json` key `bot-ops`) via `shared/slack/slack-post.md`:
```
*Stale Sweeper — [Date]*
Triaged [N] items:
• #123 — [action taken]
• #456 — [action taken]
```

## Output

Summary of actions taken per item, posted to Slack.

## Completion

Final stage. Workspace run is complete after summary posted.

On completion, no label swap needed (cron-triggered).
