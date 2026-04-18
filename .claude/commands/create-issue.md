# Create GitHub Issue

Create a GitHub issue in the shantamg/meet-without-fear repo for a bug, feature request, or investigation finding.

## Arguments

`$ARGUMENTS` — Description of the issue to create. Can be:
- A bug description: `session pipeline stuck for user X`
- An investigation summary: (output from `/investigate`)
- A feature request: `add retry logic to reconciler service`

## Step 1: Gather context

If not already provided, collect:
- **Title** — concise summary (under 80 chars)
- **Description** — what's happening, what's expected
- **Evidence** — Sentry links, session IDs, log excerpts, time windows
- **Impact** — number of users/sessions affected
- **Root cause** — if known from investigation
- **Suggested fix** — if identified

## Step 2: Check for duplicates

Follow the `/github-ops` duplicate check pattern. If a matching open issue exists, ask the user whether to comment on it instead of creating a new one.

## Step 3: Attach images (if any)

If you have screenshot files (e.g., from Slack, Sentry, or the user), use `/attach-image` to upload and get the `<img>` tag, then embed it in the issue body.

## Step 4: Add provenance

Every issue must include a **Provenance** section so the team can trace how the work was initiated:

```markdown
## Provenance
- **Channel:** (use the value from the [PROVENANCE] block if available, otherwise #channel-name)
- **Requested by:** (use the value from the [PROVENANCE] block if available, otherwise @username)
- **Original message:** (use the EXACT value from the [PROVENANCE] block if available — do NOT paraphrase)
- **Prompt(s) used:** brief description of the approach / slash commands invoked
```

This applies to all issues — whether created from Slack requests, cron jobs, or manual triggers.

**Important:** If a `[PROVENANCE]` block is present in your prompt context, use those exact values for Channel, Requested by, and Original message. Do NOT paraphrase the original message or re-derive the requester name — the provenance was resolved programmatically and is authoritative.

## Step 5: Determine assignees

Follow the `/github-ops` "Issue assignment rules" to determine whether to add an `--assignee` flag:

- **Bot-generated** (no explicit human request): do NOT assign anyone
- **Human-requested** (someone asked for this via Slack): assign the requester

Use the `[PROVENANCE]` block (if present) and the `slack_to_github_users` mapping in `.claude/config/services.json` to resolve identities.

## Step 6: Create the issue

Follow the `/github-ops` issue creation pattern. Use the repo and label conventions documented there. Only add `--assignee` if Step 5 identified a specific assignee.

## Step 7: Cross-reference

Follow the `/github-ops` cross-referencing pattern for related issues.

## Step 8: Notify if critical

For critical issues, ping the repo owner directly:
```bash
gh issue comment ISSUE_NUMBER --repo shantamg/meet-without-fear --body "@shantamg — This needs attention. [reason]"
```

## Output

Return the created issue URL and number.
