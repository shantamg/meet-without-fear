# Pipeline Monitor — Workspace Context

## Purpose

Watches active milestone-builder pipelines for known failure modes. Self-heals what it can, escalates what it can't. Uses session continuity (`--resume`) so each tick has memory of prior checks — enabling pattern detection ("this label has been wrong 3 times") and avoiding redundant work.

## Stage Pointers

- `stages/tick/CONTEXT.md` — The monitoring checklist, run every tick

## Shared Resources Used

- `shared/references/github-ops.md` — GitHub label conventions and operations

## Key Conventions

- **No code changes** — this workspace only reads GitHub state and posts comments
- **No worktree** — runs in the main repo directory (read-only)
- **Session continuity** — invoked with `--session monitor-milestone-{issue}` so `--resume` gives context across ticks
- **Self-heal threshold** — fix the same issue up to 3 times. After 3 fixes for the same failure, escalate to humans instead of re-fixing.
- **Response detection** — re-triggers interview workspaces (spec-builder, needs-info, research) when a human responds after the bot's last comment. Also detects PR approvals needing verification and milestone completions.
- **Slack notifications** — posts to #bot-ops (`$BOT_OPS_CHANNEL_ID`) when auto-graduating issues (checks 7-9)
- **Tick frequency** — every 10 minutes via cron
