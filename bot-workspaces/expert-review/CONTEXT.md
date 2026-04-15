# Expert Review — Workspace Context

## Purpose

Analyze GitHub issues through multiple expert personas with devil's advocate pushback, producing a final synthesis. All review content is posted to a **separate review issue** so the original issue stays clean and uncluttered.

## Stage Pointers

- `stages/01-initialize/CONTEXT.md` — Create review issue, select experts, post roster
- `stages/02-review-cycle/CONTEXT.md` — Iterative review/pushback/response loop (on review issue)
- `stages/03-synthesize/CONTEXT.md` — Final synthesis combining all perspectives (on review issue)
- `stages/04-complete/CONTEXT.md` — Label swap, close review issue, post summary link on original

## Shared Resources Used

- `shared/references/github-ops.md` — Issue comment patterns, label operations

## Key Conventions

- Execute exactly ONE action per invocation, then exit
- State tracked via `<!-- bot-expert-review-meta: {...} -->` in comments on the **review issue**
- Meta tag includes `review_issue` field — the issue number where all review content lives
- A brief link comment is posted on the original issue at init and completion — nothing else
- Product engineer always goes LAST (grounds idealism in reality)
- Later experts MUST build on earlier reviews (sequential accumulation)
- If a human comments mid-review, incorporate their input
- Requires `bot:expert-review` label on the original issue

## API Budget Rules

- Stage 01 fetches the original issue ONCE and writes a state file to `/tmp/slam-bot/expert-review-state-<issue>.json`
- Stages 02–04 read the state file for issue metadata — they MUST NOT re-fetch the original issue
- The only `gh` read call in stages 02–03 is `gh issue view <review_issue> --comments`
- Stage 04 uses a single batched `gh issue edit` for label changes (not separate add/remove calls)
- Stage 04 cleans up the state file
