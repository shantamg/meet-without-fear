# Spec Builder (L1)

Structured interview workspace that converts rough ideas into detailed, buildable specs through multi-pass GitHub issue comment conversations. Fills the gap between `needs-info` (classification) and `milestone-planner` (execution planning).

## Modes

Determine the current stage from the meta tag in the latest bot comment. If no meta tag exists, this is a fresh issue — start at `01-initialize`.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/rubrics.md` | Stages 02-04 | Checklist rubrics for adaptive depth per stage |
| `shared/draft-template.md` | Stages 01-05 | Spec draft structure and section headers |
| `shared/commands.md` | Stages 02-04 | Slash-command vocabulary and validation rules |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Workspace operates on issue comments, not app code (v1.1 adds sub-agent codebase research) |
| `docs/` | Not needed for interview loop |
| `shared/diagnostics/` | No diagnostic work involved |
| `shared/slack/` | Output goes to GitHub, not Slack |
| Other workspace stage files | Only read current stage CONTEXT.md |

## Stage Progression

1. `01-initialize` — Read issue body, post onboarding comment, evaluate initial content, set up meta tag
2. `02-scope` — Define problem, boundaries, success criteria (multi-pass, rubric-driven)
3. `03-deepen` — User stories with acceptance criteria, edge cases, failure modes (multi-pass, rubric-driven)
4. `04-technical` — Data model, API surface, codebase touchpoints, verification approach (multi-pass, rubric-driven)
5. `05-publish` — Render final spec into issue body, post completion summary, remove label

## Orchestrator Rules

- Re-entry: stages 02-04 re-enter on each dispatcher tick until rubric graduation or stale
- State tracking: HTML comment metadata in issue comments (`<!-- bot:spec-builder-meta: {...} -->`)
- One issue per invocation (no batching)
- Stale management: 72h nudge, 7-day label removal (state preserved for resume)
- Comment reading: use `--per-page 100` or `--paginate` to handle long interviews
- Selective context: read meta tag from latest bot comment, draft from latest snapshot, last 3-5 human comments only
