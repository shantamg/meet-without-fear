---
title: Infrastructure
sidebar_position: 1
description: Slam bot (EC2), Render hosting, Vercel deploys, GitHub automation.
updated: 2026-04-18
---

# Infrastructure

Operational infrastructure for Meet Without Fear.

## Slam Bot (autonomous agent on EC2)

- Runs on a t3.medium EC2 instance in us-west-2, tagged `slam-bot`.
- **Display name**: "Slam Paws" (in Slack and GitHub). System paths (`/opt/slam-bot/`) retain the original name for backward compatibility.
- GitHub identity: `slam-paws` (collaborator on `shantamg/meet-without-fear` with write access).
- Scripts at `/opt/slam-bot/scripts` (symlink to `~/meet-without-fear/scripts/ec2-bot/scripts` on the box).
- Workspaces at `~/meet-without-fear/bot-workspaces/` with a router (`CLAUDE.md`) + label registry (`label-registry.json`).
- Logs at `/var/log/slam-bot/`. Rotated daily via `logrotate`: 7-day retention, compressed, with a 10MB per-file `maxsize` cap. `prune-journal.sh` (daily 04:00) and `prune-claude-projects.sh` (daily 04:05) clean older state.

### systemd services

| Service | Purpose |
|---|---|
| `slam-bot-socket.service` | Socket Mode listener for real-time Slack events. For each DM, first queries `GET /api/slack/session-check` (authenticated with `SLACK_INGRESS_SECRET`) to detect active MWF sessions in Postgres. If `isSession=true`, forwards the payload to `POST /api/slack/mwf-session` (backend Bedrock pipeline); otherwise dispatches to the `slack-triage` workspace. For `#mwf-sessions` lobby messages, always forwards to the backend. |
| `slam-bot-state-scanner.service` | GitHub state scanner daemon (`github-state-scanner.sh` loop). Hardened with `MemoryMax=256M` and `TasksMax=64` to prevent runaway resource use. |

### Cron jobs

The crontab (installed by `deploy.sh`) covers roughly the following categories. Source of truth is `scripts/ec2-bot/crontab.txt`:

| Cadence | Script | Role |
|---|---|---|
| every 1 min | `git-pull.sh` | Keep `/opt/slam-bot` in sync with `main`; pushes propagate in ~60s |
| every 1 min | `check-github.sh` | Monitor and enforce GitHub state (falls back to `gh` calls if state scanner is unavailable) |
| every 1 min | `workspace-dispatcher.sh` | Drive label-based workspace dispatch |
| every 1 min | `process-queue.sh` | Drain queued work items |
| every 1 min | `api-budget-monitor.sh` | Track Claude API spend per workspace |
| every 5 min | `clear-stale-locks.sh` | Unblock wedged dispatcher runs |
| every 5 min | `check-socket-mode.sh` | Restart socket listener if Slack disconnects |
| every 10 min | `pipeline-monitor.sh` | Watch PR / workflow state |
| every 30 min | `thread-tracker.sh` | Reconcile Slack threads with GitHub activity |
| daily | `sync-labels.sh`, `bot-health-check.sh`, `api-budget-summary.sh --alert`, `prune-journal.sh`, `prune-claude-projects.sh`, `sweep-mwf-sessions.sh` | Housekeeping + daily health + budget digest + session retention |
| scheduled | `workspace-dispatcher.sh` variants | `bug-fix`, `health-check`, `docs-audit`, `security-audit`, `stale-sweeper`, `pr-reviewer` runs |

Local operator scripts live at `scripts/ec2-bot/`:

| Script | Purpose |
|---|---|
| `provision.sh` | One-shot AWS provisioning (security group, EIP, instance, SSH config entry) |
| `setup.sh` | First-time bootstrap of a fresh instance (Node, gh, claude, directories) |
| `deploy.sh` | Symlink scripts, install systemd units + crontab + logrotate |
| `configure-slack.sh` | Write Slack tokens + channel IDs (including `BUGS_AND_REQUESTS_CHANNEL_ID` for `#bugs-and-requests` and `MWF_SESSIONS_CHANNEL_ID` for `#mwf-sessions`) to `/opt/slam-bot/.env` and start the socket service |
| `configure-mixpanel.sh` | Write Mixpanel service-account credentials |
| `configure-db.sh` | Create/rotate `slam_bot_readonly` role on the Render Postgres |

### Session data directories

The bot maintains session state on disk at `~/meet-without-fear/`:

| Directory | Purpose |
|---|---|
| `data/mwf-sessions/` | MWF session data, one subdirectory per session ID |
| `data/mwf-users/` | Per-user profile data (name, previous sessions, etc.) |

### MWF session routing

The socket listener implements session-aware message routing:

- **Session detection**: On each DM message, queries `GET /api/slack/session-check?channel=C&thread_ts=T` (authenticated with `SLACK_INGRESS_SECRET`) to check if the thread is an active MWF session. Session state lives in Postgres (`SessionSlackThread` table); the backend is the authoritative source.
- **DM → mwf-session mapping**: Messages where the backend returns `isSession=true` are POSTed to `POST /api/slack/mwf-session` (Bedrock pipeline) instead of dispatched to a Claude agent workspace
- **Stray DM prevention**: Top-level DMs (outside any thread) in a channel with an active session receive the `activeThreadTs` from the session-check response; the listener nudges the user back to their session thread
- **Lobby channel**: `#mwf-sessions` is used for session setup only; actual conversations happen in private DMs (one DM thread per user) to enforce vessel privacy at the transport layer

## Production hosting

- **Backend API**: Render (`meet-without-fear-api` / `srv-d58bj73uibrs73akacd0`), env group `be-heard-api-env`
- **Database**: Render Postgres (`be-heard-db` / `dpg-d58660shg0os73bkkpmg-a`), Oregon region
- **Docs site (this one)**: Vercel
- **Marketing site**: Vercel

See [deployment](../deployment/index.md) for release procedures and env var reference.

## GitHub workflows

- `.github/workflows/docs-impact.yml` — PR-time check that code changes and their mapped docs are updated together. Mapping rules in `docs/code-to-docs-mapping.json`.
- `.github/workflows/ci.yml` — PR-time CI: spins up a Postgres 15 service container, installs deps (`npm ci`), generates the Prisma client, runs `npm run check`, migrates the test DB, and runs `npm run test`. Skipped for docs-only changes via `dorny/paths-filter`. A `ci-success` gate job is the single required status check for branch protection.
- `.github/workflows/render-deploy.yml` — Push-to-`main` backend deploy: filters to pushes that touch `backend/`, `shared/`, the lockfile, `render.yaml`, or the workflow itself, then POSTs the Render deploy hook (stored in repo secret `RENDER_DEPLOY_HOOK`). Render's built-in auto-deploy must be **off** — this workflow is the sole deploy trigger.
