# Stage: Strategize and Post

## Input

- Gathered data from all sub-agents (stage 1)
- Channel ID for #daily-summary from `.claude/config/services.json`

## Process

### 1. Synthesize scanner findings into top recommendation

Review findings from the proactive scanners (sub-agents 6-9) and select the single most impactful opportunity:

**Top Recommendation criteria** (pick the highest-priority item):
1. Production errors correlated with recent deploys (from Sentry scanner)
2. Session funnel breakage (from Mixpanel scanner — 0 completions is critical)
3. Critical/high-priority idle issues with all blockers resolved (from idle issue scanner)
4. High-severity dependency vulnerabilities (from code health scanner)

Format the top recommendation prominently in the main message.

### 2. Classify work items by autonomy tier

Review all gathered data — including proactive scanner findings — and classify every actionable item into one of three tiers. Scanner items come with a pre-classified `autonomy tier` that should be respected unless the strategize stage has additional context to override.

**Proceeding (auto-start)**
Items the bot will handle autonomously. Apply the appropriate `bot:*` label to each issue to trigger dispatch:
- Bug fixes (issues labeled `bug` with clear reproduction)
- Documentation fixes
- CI/build fixes
- Stale PR cleanup (rebase, conflict resolution)
- Issues labeled `bot:pr` or `bot:investigate` with no blockers
- Unblocked pipeline work (human answered a `bot:needs-info` question)
- Issues where `blocked` label was just removed
- Spec work where research is complete
- Follow-up tasks from merged PRs
- Security verifications and dependency updates
- Test coverage gaps for existing code
- Scanner items classified as `proceed` or `will-start`

**Suggestion (wait for approval)**
Items the bot recommends but will NOT start without explicit approval:
- New feature work
- Large refactors or architectural changes
- Work that touches multiple services or has high blast radius
- Changes to production data, infrastructure plans, or pricing
- Scanner items classified as `suggestion` (feature abandonment, low-priority debt)

### 3. Compose main message

Format as a forward-looking strategy briefing:

```
Good morning! Here's today's plan:

*Top recommendation:* [highest-impact opportunity from scanner findings, with reasoning and issue link]

*Proceeding:*
• [items the bot is starting automatically — labels applied]

*Suggestion:*
• [items that need human approval before starting]

*Pipeline: N in research, N in spec, N in implementation, N in review, N in verification, N awaiting human review*
```

Rules for the main message:
- Lead with the highest-impact items
- Keep each bullet to one line with issue link
- Use `<https://github.com/shantamg/meet-without-fear/issues/N|#N>` for issue links
- Use `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>` for PR links
- If a section has no items, omit it entirely
- If there are no actionable items at all, say so: "No new work items today. Pipeline is [state]."
- Pipeline summary is always included as the last line

### Action: apply labels for "Proceeding" items

For every item classified as "Proceeding", apply the appropriate dispatch label so the dispatcher picks it up:
- Bugs / investigation: `bot:investigate`
- Implementation work: `bot:pr`
- Security verification: `bot:investigate`

This makes the strategy briefing *actionable* — the bot doesn't just report what it plans to do, it actually starts the work. Only "Suggestion" items wait for human approval.

### 4. Compose thread reply

Post a thread reply with the retrospective detail (what happened overnight) and full scanner results:

```
*Overnight Activity:*

*GitHub:*
• [PRs merged/opened/closed]
• [Issues opened/closed]

*App Usage:*
• [Active users, events, funnel metrics]
• [Funnel health from Mixpanel scanner]

*Errors & Health:*
• [Sentry issues, production status]
• [Error patterns from Sentry scanner]

*Slack:*
• [Channel summaries, key conversations]

*Code Health:*
• [Test coverage, technical debt, vulnerabilities from code health scanner]

*Idle Issues:*
• [High-priority idle issues from idle issue scanner]

*Staging:*
• [What's on bot/staging ahead of main]
```

Only include sections that have content. If a scanner returned "clean" status, mention it briefly (e.g., "No new Sentry patterns detected") rather than omitting it entirely — this confirms the scan ran.

### 5. Post staging summary to #agentic-devs

If there are commits on `bot/staging` ahead of `main`, post a separate message to #agentic-devs (channel ID from `.claude/config/services.json` key `agentic-devs`) with:
- Count of commits ahead
- List of changes with PR links
- Link to compare view: `<https://github.com/shantamg/meet-without-fear/compare/main...bot/staging|Compare view>`

### 6. Post to Slack

1. Post main strategy message to #daily-summary, capture timestamp
2. Post thread reply with overnight activity details
3. Post staging summary to #agentic-devs (if applicable)

## Output

- Main strategy message posted to #daily-summary
- Thread reply with retrospective breakdown
- Staging summary posted to #agentic-devs (if applicable)

## Error Handling

- If any data source failed in stage 1, note it in the thread reply: "Note: [source] data was unavailable"
- If Slack posting fails, log the error — do not retry indefinitely

## Completion

Single-pass workspace. Complete after messages posted.

On completion, no label swap needed (cron-triggered).
