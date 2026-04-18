# Daily Digest — Overnight Activity Summary

Generate a comprehensive daily digest of all project activity and post it to #daily-summary.

## Arguments

`$ARGUMENTS` — Optional. Examples:
- (empty) → digest for the last 24 hours
- `last 2 days` → extend the window
- `since Monday` → custom start date

## Channel

Post to `#daily-summary` — see `.claude/config/services.json` for the channel ID.

## Step 1: Gather data in parallel

Launch **four sub-agents in parallel**, each responsible for one data source:

### Agent 1: Slack Activity

Perform a full Slack audit — check ALL channels for any activity in the last 24h.

1. First, list all channels using `mcp__slack__channels_list` with `channel_types: "public_channel,private_channel"`
2. For each channel, fetch messages from the last 24h using `mcp__slack__conversations_history`
3. Skip channels with no activity in the window
4. Skip bot messages (see `.claude/config/services.json` for bot user ID)
5. For each active channel, summarize: who posted, key topics, any decisions made, any action items
6. Note any unresolved questions or requests

**Output**: A structured summary per channel with message counts, key highlights, and notable conversations.

### Agent 2: GitHub Activity

Use `gh` CLI to gather:

1. **Pull Requests** — opened, merged, and closed in the last 24h:
   ```bash
   gh pr list --repo shantamg/meet-without-fear --state all --json number,title,state,author,createdAt,mergedAt,closedAt,url --limit 50 | python3 -c "
   import json, sys
   from datetime import datetime, timedelta, timezone
   cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
   prs = json.load(sys.stdin)
   for pr in prs:
       created = datetime.fromisoformat(pr['createdAt'].replace('Z', '+00:00'))
       merged = pr.get('mergedAt')
       closed = pr.get('closedAt')
       if created > cutoff or (merged and datetime.fromisoformat(merged.replace('Z', '+00:00')) > cutoff) or (closed and datetime.fromisoformat(closed.replace('Z', '+00:00')) > cutoff):
           print(json.dumps(pr))
   "
   ```

2. **Issues** — opened, closed, and commented on in the last 24h:
   ```bash
   gh issue list --repo shantamg/meet-without-fear --state all --json number,title,state,author,createdAt,closedAt,url,labels --limit 50 | python3 -c "
   import json, sys
   from datetime import datetime, timedelta, timezone
   cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
   issues = json.load(sys.stdin)
   for issue in issues:
       created = datetime.fromisoformat(issue['createdAt'].replace('Z', '+00:00'))
       closed = issue.get('closedAt')
       if created > cutoff or (closed and datetime.fromisoformat(closed.replace('Z', '+00:00')) > cutoff):
           print(json.dumps(issue))
   "
   ```

3. **Recent commits** on main:
   ```bash
   gh api repos/shantamg/meet-without-fear/commits?sha=main&per_page=20 --jq '.[] | {sha: .sha[:8], message: .commit.message | split("\n")[0], author: .commit.author.name, date: .commit.author.date}'
   ```

**Output**: Lists of PRs (opened/merged/closed), issues (opened/closed), and commits with links.

### Agent 3: Mixpanel Usage Patterns

Run `/check-mixpanel` with no arguments to get the last 24h summary. From the results, extract:

1. **Total events** and breakdown by event name
2. **Active users** — count of distinct_id values
3. **Key flows**:
   - App opens → sessions started → sessions resolved (funnel)
   - Any new users (first `app.opened` events)
4. **Usage patterns**:
   - Peak activity hours
   - Most active users
   - Feature adoption (which screens are viewed, which actions taken)
5. **Anomalies**:
   - Significant changes vs typical daily patterns
   - Missing expected events
   - Error events

**Output**: Usage summary with event counts, user counts, funnel metrics, and any notable patterns.

### Agent 4: Sentry & Production Health

Run `/check-sentry` with no arguments. Also run `/render-logs errors` to check for production errors. Summarize:

1. **New Sentry issues** in the last 24h (both backend and mobile)
2. **Recurring issues** — high event count or user impact
3. **Production errors** from Render logs
4. **Overall health status**: healthy / degraded / issues detected

**Output**: Error summary with issue links, event counts, and health status.

## Step 2: Compose the digest

After all four agents report back, analyze the combined results and compose two messages:

### Main message (posted to #daily-summary channel)

Format:
```
📋 *Daily Digest — [Day of Week], [Month] [Day], [Year]*

[1-2 sentences capturing the most interesting/important highlights of the day. What would someone need to know at a glance? Lead with impact, not just activity.]
```

Guidelines for the main message:
- Use emojis sparingly but effectively
- The date should be prominent and clear
- The summary should be conversational and highlight what MATTERS, not just list counts
- Focus on: shipped features, bugs fixed, user activity trends, anything surprising
- Examples of good summaries:
  - "Shipped the Slack solo flow and fixed the reconciler lock bug — 3 PRs merged. App usage was steady with 12 sessions across 4 users. No new errors in production. 🚀"
  - "Quiet day on code but busy on planning — 2 new issues filed from Slack feedback. Usage dipped slightly (8 sessions vs 15 yesterday). One new Sentry issue on the empathy reconciler worth watching. 👀"

### Thread reply (posted as reply to main message)

Format:
```
*📊 Details*

*GitHub*
• PRs merged: [list with links]
• PRs opened: [list with links]
• Issues opened: [list with links]
• Issues closed: [list with links]
• Commits: [count] on main

*📱 App Usage (Mixpanel)*
• Active users: N
• Total events: N
• Sessions: N started → N resolved
• Peak activity: [time window]
• [Any notable patterns]

*🐛 Errors & Health*
• Sentry: N new issues, N total unresolved
• [List any notable issues with links]
• Production: [healthy/degraded]

*💬 Slack*
• [Channel summaries — key conversations, decisions, action items]
```

Guidelines for the thread reply:
- Use bullet points (`•`) throughout — scannable, not prose
- Each bullet MUST be on its own line (separated by `\n`)
- Each section header MUST be separated by a blank line (`\n\n`)
- Include links to PRs, issues, and Sentry issues where relevant using `<url|text>` format
- Only include sections that have content — skip empty sections
- Keep each bullet to one line

## Step 3: Post to Slack

Use `/slack-post` for all message posting. Post to `#daily-summary` (channel ID in `.claude/config/services.json`). Post the main message first, then use the returned timestamp as `thread-ts` for the details reply.

## Error handling

- If any agent fails, still post a digest with the data that succeeded. Note which sources failed.
- If Slack posting fails, log the error but don't retry — the cron will run again tomorrow.
- If all agents fail, post a brief message: "⚠️ Daily digest failed to gather data. Check bot logs."
