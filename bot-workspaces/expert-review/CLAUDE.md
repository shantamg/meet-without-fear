# Expert Review (L1)

Multi-expert issue analysis with devil's advocate pushback. All review content goes to a **separate review issue** — the original issue stays clean. Stateful — uses comment-based state tracking with HTML metadata. Each invocation performs exactly ONE action.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/github-ops.md` | Always | Issue comment and label patterns |
| State file (`/tmp/slam-bot/expert-review-state-<issue>.json`) | Stages 02–04 | Issue metadata + review issue number (avoids re-fetching) |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Expert review is analytical, not diagnostic |
| `shared/slack/` | All output goes to GitHub issue comments |
| repo root source code | Only load if the issue discusses implementation |
| Other workspaces | Irrelevant context |

## State File (API Budget Optimization)

Stage 01 writes a state file to `/tmp/slam-bot/expert-review-state-<original_issue>.json` containing the original issue body/title, review issue number, and experts list. Stages 02–04 read from this file instead of re-fetching the original issue via `gh`. This eliminates redundant GitHub API calls — the biggest source of GraphQL budget exhaustion (#1649).

**Rules:**
- Stage 01 creates the state file after fetching the issue and creating the review issue
- Stages 02–04 **MUST** read from the state file — they must NOT call `gh issue view` on the original issue
- Stage 04 cleans up the state file after completion
- The only `gh` read call stages 02–03 make is `gh issue view <review_issue> --comments` (to get the latest meta tag and prior reviews)

## Stage Progression

1. `01-initialize` — Read original issue, create separate review issue, select 4 expert personas, post roster
2. `02-review-cycle` — Loop: expert review → devil's advocate → response (one action per tick, on review issue)
3. `03-synthesize` — All experts done → post final synthesis on review issue
4. `04-complete` — Swap labels on original, close review issue, post summary link on original

## Orchestrator Rules

- Execute exactly ONE action per invocation, then exit
- State tracked via `<!-- bot-expert-review-meta: {...} -->` in **review issue** comments
- Meta tag includes `review_issue` field pointing to the separate review issue number
- Stage 02 is a loop — the label stays on the original issue while it re-enters each tick
- Product engineer (or closest) always reviews LAST
