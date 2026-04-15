---
title: Infrastructure
sidebar_position: 1
description: Slam bot (EC2), Render hosting, Vercel deploys, GitHub automation.
---

# Infrastructure

Operational infrastructure for Meet Without Fear.

## Slam Bot (autonomous agent on EC2)

- Runs on a t3.medium EC2 instance in us-west-2, tagged `slam-bot`.
- GitHub identity: `slam-paws` (collaborator on `shantamg/meet-without-fear` with write access).
- Scripts at `/opt/slam-bot/scripts` (symlink to `~/meet-without-fear/scripts/ec2-bot/scripts` on the box). The cron `git-pull.sh` fires every minute; pushes to `main` propagate within ~60s.
- Workspaces at `~/meet-without-fear/bot-workspaces/` with a router (`CLAUDE.md`) + label registry (`label-registry.json`).
- Socket Mode listener runs under `slam-bot-socket.service` (systemd) for real-time Slack events.
- Logs at `/var/log/slam-bot/`.

Local operator scripts live at `scripts/ec2-bot/`:

| Script | Purpose |
|---|---|
| `provision.sh` | One-shot AWS provisioning (security group, EIP, instance, SSH config entry) |
| `setup.sh` | First-time bootstrap of a fresh instance (Node, gh, claude, directories) |
| `deploy.sh` | Symlink scripts, install systemd units + crontab + logrotate |
| `configure-slack.sh` | Write Slack tokens + channel IDs to `/opt/slam-bot/.env` and start the socket service |
| `configure-mixpanel.sh` | Write Mixpanel service-account credentials |
| `configure-db.sh` | Create/rotate `slam_bot_readonly` role on the Render Postgres |

## Production hosting

- **Backend API**: Render (`meet-without-fear-api` / `srv-d58bj73uibrs73akacd0`), env group `be-heard-api-env`
- **Database**: Render Postgres (`be-heard-db` / `dpg-d58660shg0os73bkkpmg-a`), Oregon region
- **Docs site (this one)**: Vercel
- **Marketing site**: Vercel

See [deployment](../deployment/index.md) for release procedures and env var reference.

## GitHub workflows

- `.github/workflows/docs-impact.yml` — PR-time check that code changes and their mapped docs are updated together. Mapping rules in `docs/code-to-docs-mapping.json`.
