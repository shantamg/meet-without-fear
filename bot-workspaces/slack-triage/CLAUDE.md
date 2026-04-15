# Slack Triage Workspace (L1)

Triage actionable messages from any Slack channel (DMs, #pmf1, #agentic-devs, #slam-bot). Classify each message and dispatch the appropriate action. **All substantive work must flow through GitHub issues with `bot:*` labels** — Slack is an intake channel, GitHub is where work happens visibly.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `.claude/config/services.json` | Always | Channel IDs (`pmf1: C0A3FF86FB7`), bot user ID (`U0ALQHDUVSM`) |
| `references/classification-guide.md` | Stage 1 | Classification criteria with examples |
| `references/dispatch-<type>.md` | Stage 2 | Per-type dispatch procedure (BUG/FEATURE/QUESTION/REQUEST/FEEDBACK/OBSERVATION) |
| `references/response-templates.md` | Stage 2 | Reply templates per message type |
| `shared/references/slack-format.md` | Stage 2 | Slack mrkdwn syntax (NOT Markdown) |
| `shared/slack/slack-post.md` | Stage 2 | Posting thread replies via `slack-post.sh` |
| `shared/github/create-issue.md` | Stage 2 (BUG/FEATURE/REQUEST/FEEDBACK) | Issue creation with provenance |
| `shared/github/attach-image.md` | Stage 2 (when images present) | Upload screenshots to GitHub issues |
| `shared/references/github-ops.md` | Stage 2 (BUG/FEATURE/REQUEST/FEEDBACK) | Duplicate check, labels, clickable links |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Triage only classifies and creates issues — investigation happens in workspaces |
| `shared/diagnostics/` | Not needed — investigation happens in the bug-fix workspace |
| `docs/` | Only load specific docs when answering a QUESTION-type message |
| Other workspaces | Irrelevant context |
| `CLAUDE.md` | Only load if you need the docs routing table to find a specific doc |

## Stage Progression

1. `1-fetch-and-classify` -- Fetch messages, scan for files, filter noise, classify each
2. `2-dispatch` -- Act on each classified message (reply, create issue, investigate, react)

Output from Stage 1 (classified message list) is passed directly to Stage 2.

## Tone

Adapt tone based on the source channel:

**#pmf1** — Product-team channel. Readers are testing the product, not engineers.
- Keep it non-technical: no file paths, function names, stack traces
- Be warm and informative

**#agentic-devs** — Dev/ops channel. Readers are engineers.
- Technical detail is fine
- Be concise and actionable

**#slam-bot** — General-purpose bot interaction channel. Visible to the whole team.
- Treat every message like a DM — route through the full workspace tree
- Technical detail is fine (team members watching)
- Be concise and actionable

**DMs** — Direct conversation with a team member.
- Match their tone and technical level

**All channels:**
- Match the message depth -- quick note gets quick reply
- Use Slack mrkdwn (`*bold*`, `<url|text>`, bullet `\u2022`)

**Do NOT (any channel):**
- Use Markdown syntax (`**bold**`, `[text](url)`, `- bullet`) — use Slack mrkdwn instead
- Post as a new channel message -- always reply in threads

## Image Handling

The Slack MCP server cannot see file attachments at all. Always scan for them in parallel with message fetch:

```bash
# Scan (fast, no download -- always run alongside MCP fetch)
SLACK_MCP_XOXB_TOKEN="$SLACK_MCP_XOXB_TOKEN" node scripts/slack-get-images.mjs C0A3FF86FB7 --scan

# Download specific message's images
SLACK_MCP_XOXB_TOKEN="$SLACK_MCP_XOXB_TOKEN" node scripts/slack-get-images.mjs C0A3FF86FB7 --ts <message_ts>
```

Images save to `/tmp/slack-images/`. View with the Read tool.

## GitHub API Budget (Policy #1649)

Slack-triage is a lightweight intake workspace — it classifies and dispatches, it does NOT investigate. Each message should use **at most 5 `gh` calls**. A full session should stay well under 50 total.

**Allowed `gh` calls per dispatch type:**

| Type | Allowed calls | Max |
|---|---|---|
| BUG | `gh issue list --search` (dedup) + `gh issue create` | 2 |
| FEATURE | `gh issue list --search` (dedup) + `gh issue create` | 2 |
| REQUEST | `gh issue list --search` (dedup) + `gh issue create` | 2 |
| FEEDBACK | `gh issue list --search` (dedup) + `gh issue create` | 2 |
| QUESTION | 0 (doc lookup only, no GitHub) | 0 |
| PRIORITIZE | `gh issue view` or `gh issue list --search` + `gh issue edit` | 3 |
| OBSERVATION | 0 (emoji react only) | 0 |

**Strict violations:**
- Do NOT use `gh api` for Sentry checks — that belongs in the investigate workspace, not triage
- Do NOT read issue/PR details, comments, or diffs — triage creates issues, it doesn't analyze them
- Do NOT run exploratory `gh` calls (browsing repos, checking PR statuses, listing labels)
- Do NOT use `gh issue list` or `gh issue view --json labels` for data available in the global state file (`$GITHUB_STATE_FILE`)

The dispatch-bug.md "quick triage" step means scanning the codebase and checking Sentry **only if MCP tools are available** — never via `gh api`. If Sentry MCP is unavailable, write "No immediate leads — needs full investigation" and move on.

## Safety

1. Never post sensitive data (env vars, tokens, DB contents) in Slack
2. If unsure whether something is a bug, create an issue rather than attempting a fix
3. Never post as a new channel message -- always reply in threads
