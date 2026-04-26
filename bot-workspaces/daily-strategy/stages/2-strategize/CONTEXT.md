# Stage: Strategize and Post

## Input

- Gathered data from all sub-agents (stage 1)
- Previous briefing response summary (from sub-agent 0)
- Channel IDs for #most-important-thing and #daily-summary from `.claude/config/services.json`

## Process

### 0. Process previous briefing responses

Before composing the new briefing, act on responses from the previous one.

**Consensus rule:** Both Shantam and Darryl must agree before an item moves forward or is deferred. A single response is not enough — if only one person replied, the item stays in the carry-forward queue with a note about who has weighed in. The Most Important Thing is never skipped unless *both* agree to defer it or a genuinely new higher-priority item emerges (e.g., production outage).

**Greenlit items** — *Both* team members agreed to proceed. If the item doesn't already have a dispatch label (`bot:pr`, `bot:investigate`, etc.), apply one now so the dispatcher picks it up.

**Deferred items** — *Both* team members agreed to defer, with a reason. For each:
1. Post a comment on the GitHub issue recording the deferral:
   ```
   **Deferred by consensus** (via #most-important-thing, [date])

   Reason: [their stated reason]

   This item will not be re-presented in the daily strategy until the team re-raises it.
   ```
2. Remove from the carry-forward queue — do not re-present this item.

**Partial response** — Only one team member replied. The item carries forward. In the next briefing, note who has weighed in and who hasn't yet: "Shantam agreed — waiting on Darryl" or vice versa.

**Disagreement** — Team members gave conflicting responses (one wants to proceed, the other wants to defer). Do NOT move forward. Re-present the item with both perspectives noted, and ask them to align: "Shantam wants to proceed, Darryl wants to defer because [reason]. Please discuss and let me know how you'd like to handle this."

**Questions** — Team asked a follow-up. Include a brief answer or acknowledgment in the new briefing if possible.

**Unanswered items** — No response at all. These carry forward and appear prominently in the new briefing under "Still waiting on your input."

### 1. Select The Most Important Thing

This is the centerpiece of every briefing. Pick the *single* highest-priority item from all gathered data, including unanswered carry-forwards.

**Selection criteria** (in priority order):
1. Unanswered carry-forward items (re-present the same top item if the team hasn't responded)
2. Production errors correlated with recent deploys (from Sentry scanner)
3. Session funnel breakage (from Mixpanel scanner — 0 completions is critical)
4. Critical/high-priority idle issues with all blockers resolved (from idle issue scanner)
5. High-severity dependency vulnerabilities (from code health scanner)
6. Newly unblocked work (human answered a `bot:needs-info` question)

For The Most Important Thing, clearly state:
- *What* it is (one sentence)
- *Why* it matters (one sentence)
- Whether it *needs team input* or the bot *will proceed unless told otherwise*

### 2. Classify remaining work items by autonomy tier

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
- Items greenlit by the team in the previous briefing

**Suggestion (wait for approval)**
Items the bot recommends but will NOT start without explicit approval:
- New feature work
- Large refactors or architectural changes
- Work that touches multiple services or has high blast radius
- Changes to production data, infrastructure plans, or pricing
- Scanner items classified as `suggestion` (feature abandonment, low-priority debt)

### 3. Compose #most-important-thing message

This message is intentionally short. One item, one rationale, done.

```
*[One-sentence description of the single most important thing]*
[One sentence: why it matters right now]
<issue/PR link>
```

Rules for the main message:
- **Maximum 3 lines**: what, why, link. That's it.
- No sections, no bullet lists, no pipeline summary, no "Proceeding" or "Suggestion" items
- Plain language — no file paths, function names, or jargon (Darryl reads this)
- Use `<https://github.com/shantamg/meet-without-fear/issues/N|#N>` for the link
- If there are unanswered carry-forward items, the carry-forward IS the most important thing — re-present it
- If there are genuinely no items, say: "Nothing urgent today — pipeline is healthy."

### 4. Compose thread reply (response prompt)

Post a single thread reply that prompts Shantam and Darryl to respond. Keep it short.

```
Reply here: agree, ask a question, or say "defer — [reason]".
```

That's the entire thread reply. No activity details, no scanner results, no pipeline summary.

### Action: apply labels for "Proceeding" items

For every item classified as "Proceeding", apply the appropriate dispatch label so the dispatcher picks it up:
- Bugs / investigation: `bot:investigate`
- Implementation work: `bot:pr`
- Security verification: `bot:investigate`

This makes the strategy briefing *actionable* — the bot doesn't just report what it plans to do, it actually starts the work. Only "Suggestion" items wait for human approval.

### 5. Compose daily summary for #daily-summary

Post the comprehensive briefing to #daily-summary (channel ID from `.claude/config/services.json`). This is where all the detail goes.

```
Good morning! / Evening check-in!

*The Most Important Thing:*
[Same item from step 3, with full context]
<issue/PR link>

*Still waiting on your input:*
[Unanswered items from the previous briefing, if any]

*Proceeding:*
[Items the bot is starting automatically — labels applied]

*Suggestion:*
[Items that need your approval before starting]

*Pipeline: N in research, N in spec, N in implementation, N in review, N in verification, N awaiting human review*
```

Post a thread reply on the daily summary with retrospective detail and scanner results:

```
*Recent Activity:*

*GitHub:*
[PRs merged/opened/closed]
[Issues opened/closed]

*App Usage:*
[Active users, events, funnel metrics]
[Funnel health from Mixpanel scanner]

*Errors & Health:*
[Sentry issues, production status]
[Error patterns from Sentry scanner]

*Slack:*
[Channel summaries, key conversations]

*Code Health:*
[Test coverage, technical debt, vulnerabilities from code health scanner]

*Idle Issues:*
[High-priority idle issues from idle issue scanner]

*Staging:*
[What's on bot/staging ahead of main]

*Deferrals recorded:*
[Items deferred since last briefing, with reasons — confirms documentation happened]
```

Only include sections that have content. If a scanner returned "clean" status, mention it briefly (e.g., "No new Sentry patterns detected") rather than omitting it entirely — this confirms the scan ran.

Use "Good morning!" for the 7 AM run, "Evening check-in!" for the 7 PM run.

Rules for the daily summary:
- Keep each bullet to one line with issue link
- Use `<https://github.com/shantamg/meet-without-fear/issues/N|#N>` for issue links
- Use `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>` for PR links
- If a section has no items, omit it entirely (except The Most Important Thing)
- If there are no actionable items at all, say so: "No new work items. Pipeline is [state]."
- Pipeline summary is always included as the last line

### 6. Post staging summary to #agentic-devs

If there are commits on `bot/staging` ahead of `main`, post a separate message to #agentic-devs with:
- Count of commits ahead
- List of changes with PR links
- Link to compare view: `<https://github.com/shantamg/meet-without-fear/compare/main...bot/staging|Compare view>`

### 7. Post to Slack

1. Post short #most-important-thing message, capture timestamp
2. Post thread reply with response prompt
3. Post comprehensive daily summary to #daily-summary, capture timestamp
4. Post thread reply with retrospective detail on the daily summary
5. Post staging summary to #agentic-devs (if applicable)

## Output

- Short strategy message posted to #most-important-thing with response prompt in thread
- Comprehensive daily summary posted to #daily-summary with retrospective in thread
- Staging summary posted to #agentic-devs (if applicable)
- Deferral comments posted on GitHub issues (if any deferrals from previous briefing)

## Error Handling

- If any data source failed in stage 1, note it in the #daily-summary thread reply: "Note: [source] data was unavailable"
- If Slack posting fails, log the error — do not retry indefinitely
- If the previous briefing response check failed, proceed without carry-forwards (note in #daily-summary thread reply)

## Completion

Single-pass workspace. Complete after messages posted.

On completion, no label swap needed (cron-triggered).
