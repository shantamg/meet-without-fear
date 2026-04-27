---
title: Infrastructure
sidebar_position: 1
description: Slam bot (EC2), Render hosting, Vercel deploys, GitHub automation.
created: 2026-03-11
updated: 2026-04-25
status: living
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
| `slam-bot-socket.service` | Socket Mode listener for real-time Slack events. Routes incoming messages by channel: DMs and `#slam-paws`/`#agentic-devs`/`#bugs-and-requests`/`#most-important-thing` go to the `slack-triage` workspace; `#mwf-sessions` messages go to the `mwf-session` workspace (or, when `MWF_BACKEND_URL` is set, forward directly to the backend Bedrock pipeline). |
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
| every 5 min | `clear-stale-locks.sh` | Unblock wedged dispatcher runs; auto-clear `waiting-human` markers when a non-bot reply is detected |
| every 5 min | `check-socket-mode.sh` | Restart socket listener if Slack disconnects |
| every 10 min | `pipeline-monitor.sh` | Watch PR / workflow state |
| every 30 min | `thread-tracker.sh` | Reconcile Slack threads with GitHub activity |
| daily | `sync-labels.sh`, `bot-health-check.sh`, `api-budget-summary.sh --post`, `api-budget-summary.sh --alert`, `prune-journal.sh`, `prune-claude-projects.sh`, `sweep-mwf-sessions.sh` | Housekeeping + daily health + budget digest (post to `#bot-ops` + over-budget alert) + session retention |
| twice daily (08:00 / 20:00) | `sync-staging.sh` | Merge `main` → `bot/staging`; PR accumulated bot work back to `main` |
| scheduled | `workspace-dispatcher.sh` variants | `bug-fix`, `health-check`, `docs-audit`, `security-audit`, `stale-sweeper`, `pr-reviewer`, `daily-strategy` runs |

Local operator scripts live at `scripts/ec2-bot/`:

| Script | Purpose |
|---|---|
| `provision.sh` | One-shot AWS provisioning (security group, EIP, instance, SSH config entry) |
| `setup.sh` | First-time bootstrap of a fresh instance (Node, gh, claude, directories) |
| `deploy.sh` | Symlink scripts, install systemd units + crontab + logrotate |
| `configure-slack.sh` | Write Slack tokens + channel IDs (`SLAM_BOT_CHANNEL_ID` for `#slam-paws`, `AGENTIC_DEVS_CHANNEL_ID` for `#agentic-devs`, `BUGS_AND_REQUESTS_CHANNEL_ID` for `#bugs-and-requests`, `MOST_IMPORTANT_THING_CHANNEL_ID` for `#most-important-thing`, `MWF_SESSIONS_CHANNEL_ID` for `#mwf-sessions`) to `/opt/slam-bot/.env` and start the socket service |
| `configure-mixpanel.sh` | Write Mixpanel service-account credentials |
| `configure-db.sh` | Create/rotate `slam_bot_readonly` role on the Render Postgres |

### Session data directories

The bot maintains session state on disk at `~/meet-without-fear/`:

| Directory | Purpose |
|---|---|
| `data/mwf-sessions/` | MWF session data, one subdirectory per session ID |
| `data/mwf-users/` | Per-user profile data (name, previous sessions, etc.) |

### Channel routing

The socket listener routes messages by channel config. Each monitored channel maps to a workspace and command slug:

| Channel | Workspace | Command slug |
|---|---|---|
| DM (Shantam) | `slack-triage` | `dm-reply` |
| `#slam-paws` | `slack-triage` | `slam-paws-reply` |
| `#agentic-devs` | `slack-triage` | `agentic-devs-reply` |
| `#bugs-and-requests` | `slack-triage` | `bugs-and-requests-reply` |
| `#most-important-thing` | `slack-triage` | `most-important-thing-reply` |
| `#mwf-sessions` | `mwf-session` | `mwf-session-reply` |

For `#mwf-sessions`, when `MWF_BACKEND_URL` is set the listener POSTs directly to the backend Bedrock pipeline instead of spawning a Claude Code agent.

### Runbook: repo disappearance

The repo clone at `/home/ubuntu/projects/meet-without-fear/` has vanished four times (2026-04-16, -18, -19, -21), each time breaking the `/opt/slam-bot/scripts` symlink chain. Symptoms: Slack messages stuck on `:eyes:` with no reply, `/var/log/slam-bot/socket-mode.log` crashing on `spawn /opt/slam-bot/scripts/run-claude.sh ENOENT`, `cron.log` flooded with "not found".

**Root cause (identified 2026-04-21)**: the worktree-cleanup loop in `clear-stale-locks.sh` was deleting the main worktree. Its main-worktree guard compared `$WT_PATH` (canonical path from `git worktree list`, e.g. `/home/ubuntu/projects/meet-without-fear`) against `$REPO_ROOT` (symlinked path `/home/ubuntu/meet-without-fear`), which never matched. With the guard bypassed, the `main` branch had no PR → the "no PR + >24h → abandoned" fallback fired → `rm -rf` on the main checkout. Fixed by normalizing both paths with `readlink -f`, adding a `main|master|develop` branch allowlist, and restricting the "no PR" fallback to bot-owned branch patterns.

Persistent auditd watches are installed at `/etc/audit/rules.d/mwf.rules` (keys `mwf_projects`, `mwf_repo`). If the repo disappears again, the first diagnostic is:

```bash
# The `</dev/null` is required. ausearch reads from stdin when stdin isn't a tty,
# and non-interactive ssh makes stdin a pipe, so without redirection it silently
# returns `<no matches>` for every query.
ssh slam-bot "sudo ausearch -k mwf_projects </dev/null | grep -E 'rename|delete|unlink|comm='"
```

Pair a matching PATH record with its SYSCALL and PROCTITLE records (same `:NNNNN)` event id) to get the PID, parent chain, and command line. If watches are missing (empty `auditctl -l | grep mwf`), reinstate with `sudo auditctl -R /etc/audit/rules.d/mwf.rules`.

Recovery:

1. `ssh slam-bot 'cd /home/ubuntu/projects && git clone https://github.com/shantamg/meet-without-fear.git'` (skip step if a `.broken` copy exists; remove it first)
2. `ssh slam-bot 'sudo systemctl restart slam-bot-socket'` (look for a clean startup with no "workspaces missing" warning)
3. `ssh slam-bot 'rm /opt/slam-bot/state/claims/claimed-<channel>-<ts>.txt'` for each message stuck on `:eyes:`

Slack Socket Mode will not redeliver an acked event. To force the bot to process a stuck message after recovery, invoke `run-claude.sh` directly with the same args the listener would have used:

```bash
/opt/slam-bot/scripts/run-claude.sh \
  --workspace slack-triage \
  --session slack-<channel>-<thread_ts> \
  '' <prompt_file> <msg_ts>
```

Set `CHANNEL=<channel>` in the env so the emoji reaction handlers work.

## Production hosting

- **Backend API**: Render (`meet-without-fear-api` / `srv-d58bj73uibrs73akacd0`), env group `be-heard-api-env`
- **Database**: Render Postgres (`be-heard-db` / `dpg-d58660shg0os73bkkpmg-a`), Oregon region
- **Docs site (this one)**: Vercel
- **Marketing site**: Vercel (`website/`)
- **Web app** (`app.meetwithoutfear.com`): Vercel — Expo Web build of `mobile/`, Vercel project `mwf-app`. Deployed via `.github/workflows/vercel-deploy-app.yml` on pushes to `main` that touch `mobile/**` or `shared/**`.

See [deployment](../deployment/index.md) for release procedures and env var reference.

## GitHub workflows

- `.github/workflows/docs-impact.yml` — PR-time check that code changes and their mapped docs are updated together. Mapping rules in `docs/code-to-docs-mapping.json`.
- `.github/workflows/ci.yml` — PR-time CI: spins up a Postgres 15 service container, installs deps (`npm ci`), generates the Prisma client, runs `npm run check`, migrates the test DB, and runs `npm run test`. Skipped for docs-only changes via `dorny/paths-filter`. A `ci-success` gate job is the single required status check for branch protection.
- `.github/workflows/render-deploy.yml` — Push-to-`main` backend deploy: filters to pushes that touch `backend/`, `shared/`, the lockfile, `render.yaml`, or the workflow itself, then POSTs the Render deploy hook (stored in repo secret `RENDER_DEPLOY_HOOK`). Render's built-in auto-deploy must be **off** — this workflow is the sole deploy trigger.
- `.github/workflows/vercel-deploy-app.yml` — Push-to-`main` Expo Web deploy: filters to pushes touching `mobile/**` or `shared/**`, builds the Expo Web bundle, and deploys to `app.meetwithoutfear.com` via Vercel (`mwf-app` project). Also supports `workflow_dispatch`.
- `.github/workflows/vercel-deploy-website.yml` — Push-to-`main` marketing site deploy: filters to pushes touching `website/**`, deploys to Vercel.
- `.github/workflows/ota-update.yml` — Push-to-`main` OTA update: publishes an Expo OTA update to the `production` EAS branch for iOS whenever `mobile/**` or `shared/**` changes on `main`. Also supports `workflow_dispatch` with a custom message. Uses `EXPO_TOKEN` secret. Roll back a bad update with `eas update:delete <group-id> --non-interactive`.
