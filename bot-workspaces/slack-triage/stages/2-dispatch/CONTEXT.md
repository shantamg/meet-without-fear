# Stage 2: Dispatch

## Inputs

| Source | What | Why |
|---|---|---|
| Stage 1 output | Classified messages list | Determines action per message |
| `references/response-templates.md` | Reply templates per type | Consistent, warm tone |
| `references/dispatch-<type>.md` | Per-type dispatch procedure | Steps for BUG/FEATURE/QUESTION/REQUEST/FEEDBACK/OBSERVATION |
| `shared/slack/slack-post.md` | Posting utility | Thread replies |
| `shared/references/slack-format.md` | Slack mrkdwn rules | Correct formatting |
| `shared/github/create-issue.md` | Issue creation | BUG/FEATURE/FEEDBACK issues |
| `shared/github/attach-image.md` | Image upload | Screenshots in issues |
| `shared/references/github-ops.md` | Labels, dedup, link format | Issue conventions |

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file to pre-filter duplicate checks before falling back to `gh issue list --search`. If the state file contains an open issue with a matching title, skip the `gh` call entirely.

## Process

For each classified message:

1. **Load the dispatch reference** for its type: `references/dispatch-<type>.md`
   - `dispatch-bug.md` — create issue with `bot:investigate` label, reply
   - `dispatch-feature.md` — dedup, create issue with `bot:pr` label, reply
   - `dispatch-question.md` — search docs, reply (escalate to REQUEST if deeper work needed)
   - `dispatch-request.md` — create issue with appropriate `bot:*` label, reply with issue link
   - `dispatch-prioritize.md` — find referenced issue/PR, apply `high-priority` label, reply
   - `dispatch-feedback.md` — create issue, reply
   - `dispatch-observation.md` — emoji react only

2. **Follow the steps** in the loaded dispatch reference

3. **Apply reply conventions** (all types except OBSERVATION):
   - Always reply in threads using `thread_ts` (or `message_ts` for top-level)
   - Use `slack-post.sh` per `shared/slack/slack-post.md` -- NOT MCP for posting
   - Format with Slack mrkdwn: `*bold*`, `<url|text>`, bullet `•`
   - Include clickable links: `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>`
   - Follow workspace Tone from `CLAUDE.md`: warm, non-technical, match message depth

## Checkpoints

- [ ] Each classified message has been acted on
- [ ] All replies posted as thread replies (never channel-level)
- [ ] Issues created with provenance blocks
- [ ] Duplicate check done before every issue creation
- [ ] Images downloaded and attached where applicable
- [ ] No sensitive data posted to Slack

## Output

Action log for each message:

```
{
  message_ts: string,
  type: string,
  action_taken: "replied" | "issue_created" | "pr_created" | "emoji_reacted" | "label_applied" | "skipped",
  issue_url?: string,
  pr_url?: string,
  reply_ts?: string
}
```

## Safety

- Never post sensitive data (env vars, tokens, DB contents, connection strings) in Slack
- If unsure whether something is a bug or a feature request, create an issue rather than attempting a fix
- Always check for duplicate issues before creating new ones
- When fixing bugs, work in an isolated worktree -- never on `main`

## Completion

This is the final stage. The workspace run is complete after all messages are dispatched.
