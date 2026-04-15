# Needs Info — Workspace Context

## Purpose

Handle vague or incomplete requests by running a structured interview loop on GitHub issues. The bot asks clarifying questions, polls for user responses on subsequent ticks, and graduates the issue to the appropriate downstream workspace once enough context is gathered.

## Stage Pointers

- `stages/01-create-issue/CONTEXT.md` — Validate issue, post initial interview comment
- `stages/02-interview/CONTEXT.md` — Looping: read responses, ask follow-ups, nudge, or mark stale
- `stages/03-graduate/CONTEXT.md` — Summarize info, swap label to downstream workspace

## Shared Resources Used

- `shared/question-templates.md` — Common clarifying questions organized by category
- `shared/graduation-criteria.md` — Rules for determining when enough info has been gathered
- `shared/references/github-ops.md` (root) — Label swap operations

## Key Conventions

- State is tracked via HTML comment metadata in issue comments: `<!-- bot:needs-info-meta: {"questions_asked": N, "last_response": "ISO", "category": "bug|feature|question"} -->`
- Nudge after 24h of no response; mark stale after 72h
- Graduation swaps `bot:needs-info` to `bot:bug-fix` (bugs) or adds `ready-for-review` (features)
- Questions should be specific and actionable — avoid open-ended "tell me more"
