# Spec Builder — Workspace Context

## Purpose

Conducts a structured interview over GitHub issue comments to transform rough ideas into detailed, buildable specifications. Asks progressively deeper questions across scope, user stories, and technical design until the idea is fully specified, then outputs a spec ready for milestone planning.

## Stage Pointers

- `stages/01-initialize/CONTEXT.md` — Read issue, post onboarding comment, evaluate initial content, create meta tag
- `stages/02-scope/CONTEXT.md` — Multi-pass: define problem, boundaries, success criteria via rubric-driven questions
- `stages/03-deepen/CONTEXT.md` — Multi-pass: user stories with acceptance criteria, edge cases, failure modes
- `stages/04-technical/CONTEXT.md` — Multi-pass: data model, API surface, codebase touchpoints, verification approach
- `stages/05-publish/CONTEXT.md` — Render final spec, post summary, remove label, prompt for milestone-planner

## Shared Resources Used

- `shared/rubrics.md` — Checklist rubrics per stage (3-5 items each) that drive adaptive depth
- `shared/draft-template.md` — Spec draft structure with section headers and empty-section placeholders
- `shared/commands.md` — Slash-command vocabulary (`/pause`, `/skip-to-technical`, `/publish-now`, `/restart-stage`)

## Key Conventions

- **State tracking**: all state lives in `<!-- bot:spec-builder-meta: {...} -->` HTML comments appended to bot comments
- **Source of truth**: draft snapshots live in comments (append-only); issue body is a rendered convenience view regenerated from latest snapshot
- **Draft updates**: gated by `draft_hash` (SHA-256 prefix) in meta tag to avoid unnecessary notifications
- **Question batching**: ask ALL independent questions at once — if multiple rubric items are `missing` or `partial` and the answers don't depend on each other, bundle them into a single comment so the user can brain-dump. Only hold back questions that genuinely build on earlier answers. Goal: minimize round-trips, get to a finished spec fast.
- **Tone**: collaborative design partner, not interrogative form — ask "what happens when X fails?" not "define failure mode for X"
- **Nudges**: single-line comments restating the pending question with available commands
- **Handoff**: manual — user adds `bot:milestone-planner` when ready (no auto-escalation)
