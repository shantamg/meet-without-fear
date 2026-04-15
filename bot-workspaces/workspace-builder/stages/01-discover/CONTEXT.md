# Stage: Discover

## Input

- GitHub issue body (from prompt or `gh issue view`)
- Issue comments (may contain clarifications or follow-ups)
- `references/existing-workspaces.md` — what already exists
- `label-registry.json` (root) — registered labels

## Process

1. **Read the issue** carefully. Extract:
   - **Purpose**: what workflow does this workspace automate?
   - **Trigger type**: label, cron, webhook, or manual?
   - **Inputs**: what does the workspace receive? (issue body, transcript, alert, etc.)
   - **Outputs**: what does it produce? (PR, issue, Slack message, report, etc.)
   - **Stages**: what sequential steps are needed?

2. **Check for overlap** with existing workspaces:
   - Read `references/existing-workspaces.md`
   - Search `label-registry.json` for similar labels
   - If this is a modification of an existing workspace, note which workspace and what changes

3. **Identify shared resources needed**:
   - Does it need diagnostics? (Sentry, DB, Mixpanel, logs)
   - Does it post to Slack? (`shared/slack/`)
   - Does it create GitHub issues? (`shared/github/`)
   - Does it create PRs? (`shared/skills/pr.md`)

4. **For "modify existing" mode**: read the target workspace's CLAUDE.md and CONTEXT.md to understand current structure

5. **Resolve ambiguities**: if the issue is unclear about stages or triggers, check comments for clarifications. If still ambiguous, document assumptions.

## Output

Discovery document containing:
- Workspace name (lowercase, hyphenated)
- Purpose (1-2 sentences)
- Trigger type
- Proposed stages (name + one-line description each)
- Inputs and outputs per stage
- Shared resources needed
- Whether this is new or modifying existing
- Any assumptions made

## Completion

Proceed to `stages/02-design/` with the discovery document.
