# ICM Workspace Conventions

Rules enforced by the workspace-builder when scaffolding and auditing workspaces. Adapted from ICM `_core/CONVENTIONS.md` for the Lovely bot context.

## File Structure

Every workspace must contain:

```
<workspace-name>/
  CLAUDE.md          # L1 router: What to Load / What NOT to Load tables
  CONTEXT.md         # Purpose, stage pointers, shared resources used
  stages/
    <stage-name>/
      CONTEXT.md     # Input / Process / Output contract
```

## CLAUDE.md (L1) Requirements

1. **Title line**: `# <Workspace Name> (L1)`
2. **One-line description**: what the workspace does
3. **What to Load table**: `| Resource | When | Why |` — lists every file loaded per stage
4. **What NOT to Load table**: `| Resource | Why |` — explicit exclusions to prevent context bloat
5. **Stage Progression**: numbered list of stages with one-line descriptions

## CONTEXT.md (Workspace Level) Requirements

1. **Purpose**: 1-2 sentence description
2. **Stage Pointers**: bullet list of stage CONTEXT.md paths with descriptions
3. **Shared Resources Used**: bullet list of shared/ files this workspace references
4. **Key Conventions**: workspace-specific rules (branch naming, PR format, etc.)

## Stage CONTEXT.md Requirements

Every stage CONTEXT.md must have exactly four sections:

1. **Input**: what the stage receives (from prompt, previous stage output, or external source)
2. **Process**: numbered steps the agent follows
3. **Output**: what the stage produces (written to `output/` or passed to next stage)
4. **Completion**: what happens next (proceed to next stage, or final stage report)

### Size Limits

- Stage CONTEXT.md: **under 80 lines**. If longer, split into sub-stages.
- Reference files: **under 200 lines**. If longer, split and use selective section routing.

## Stage Handoffs

- Stage N writes structured output (discovery.md, design.md, etc.)
- Stage N+1 reads that output as its primary input
- Output format should be parseable (markdown with clear headings, not prose)

## CONTEXT.md is Routing, Not Content

CONTEXT.md files tell the agent what to read and what to do. They must NOT contain:
- Inline reference material (put it in `shared/references/` or workspace `references/`)
- Long code examples (put them in templates)
- Historical context or rationale (put it in docs)

## Naming Conventions

| Element | Pattern | Example |
|---|---|---|
| Workspace directory | lowercase, hyphenated | `sentry-alerts` |
| GitHub label | `bot:<workspace-name>` | `bot:sentry-alerts` |
| Stage directory | `NN-<name>` (zero-padded) | `01-discover` |
| Branch (new workspace) | `feat/ws-<workspace-name>` | `feat/ws-sentry-alerts` |

## Label Registry

Every workspace must be registered in `bot-workspaces/label-registry.json`:

```json
{
  "bot:<name>": {
    "workspace": "<name>/",
    "entry_stage": "<first-stage-name>",
    "trigger": "label|cron|webhook|manual"
  }
}
```

## Root Routing Table

Every workspace must have a corresponding entry in `bot-workspaces/CLAUDE.md` routing table:

```markdown
| `<job-slug>` | `<workspace>/` | `<entry-stage>` |
```

## Trigger Types

| Trigger | Description |
|---|---|
| `label` | Activated when `bot:*` label is applied to a GitHub issue |
| `cron` | Runs on a schedule via EC2 cron |
| `webhook` | Triggered by GitHub webhook events (PR, comment, etc.) |
| `manual` | Invoked by human command |

## Completion Labels

Every final stage should specify label transitions:
- Remove the `bot:*` label
- Add a completion label (e.g., `bot:pr-created`, `brainstorm-complete`)

This prevents re-triggering and provides audit trail.
