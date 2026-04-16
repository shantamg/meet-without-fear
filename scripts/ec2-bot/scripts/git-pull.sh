#!/bin/bash
set -euo pipefail

# Bootstrap: use hardcoded path for the initial git pull (config.sh
# may not exist yet on first-ever pull, and PULL_LOG isn't defined yet).
cd ~/meet-without-fear
git checkout main >> /var/log/slam-bot/git-pull.log 2>&1 || true
git fetch origin main && git reset --hard origin/main >> /var/log/slam-bot/git-pull.log 2>&1

# Now source config.sh (guaranteed to exist after pull)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

PULL_LOG="${BOT_LOG_DIR}/git-pull.log"

# Symlink scripts from repo — eliminates copy drift and sync lag.
# BOT_HOME keeps .env, queue/, and state/ (not in repo).
REPO_SCRIPTS="${PROJECT_DIR}/scripts/ec2-bot/scripts"
PROD_SCRIPTS="${BOT_HOME}/scripts"
if [ ! -L "$PROD_SCRIPTS" ]; then
  # One-time migration: replace the copy directory with a symlink
  rm -rf "$PROD_SCRIPTS"
  ln -s "$REPO_SCRIPTS" "$PROD_SCRIPTS"
  echo "[$(date)] Migrated $PROD_SCRIPTS to symlink -> $REPO_SCRIPTS" >> "$PULL_LOG"
fi

# Sync Socket Mode listener (keeps its own node_modules, can't be a plain symlink)
SOCKET_SRC="${PROJECT_DIR}/scripts/ec2-bot/socket-mode"
SOCKET_DST="${BOT_HOME}/socket-mode"
SERVICE_NAME="slam-bot-socket"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
REPO_SERVICE_FILE="${PROJECT_DIR}/scripts/ec2-bot/${SERVICE_NAME}.service"
if [ -d "$SOCKET_SRC" ]; then
  mkdir -p "$SOCKET_DST"

  # Auto-install systemd service file if missing or changed
  if [ -f "$REPO_SERVICE_FILE" ]; then
    if [ ! -f "$SERVICE_FILE" ] || ! diff -q "$REPO_SERVICE_FILE" "$SERVICE_FILE" >/dev/null 2>&1; then
      sudo cp "$REPO_SERVICE_FILE" "$SERVICE_FILE"
      sudo chown root:root "$SERVICE_FILE"
      sudo systemctl daemon-reload
      sudo systemctl enable "$SERVICE_NAME" 2>/dev/null || true
      echo "[$(date)] Installed/updated systemd service: $SERVICE_NAME" >> "$PULL_LOG"
      # Restart to pick up service file changes
      sudo systemctl restart "$SERVICE_NAME" 2>/dev/null || true
    fi
  fi

  # Snapshot checksums before copy to detect changes
  OLD_CHECKSUM=""
  if ls "$SOCKET_DST"/*.mjs >/dev/null 2>&1; then
    OLD_CHECKSUM=$(cat "$SOCKET_DST"/*.mjs | md5sum)
  fi

  cp "$SOCKET_SRC"/package.json "$SOCKET_DST/" 2>/dev/null || true
  cp "$SOCKET_SRC"/*.mjs "$SOCKET_DST/" 2>/dev/null || true

  NEW_CHECKSUM=$(cat "$SOCKET_DST"/*.mjs | md5sum)

  # Install deps only if package.json changed
  if ! diff -q "$SOCKET_SRC/package.json" "$SOCKET_DST/.package.json.last" >/dev/null 2>&1; then
    (cd "$SOCKET_DST" && npm install --production >> "$PULL_LOG" 2>&1 && cp package.json .package.json.last)
  fi

  # Restart socket listener via systemd if code changed
  if [ -n "$OLD_CHECKSUM" ] && [ "$OLD_CHECKSUM" != "$NEW_CHECKSUM" ]; then
    echo "[$(date)] Socket Mode listener code changed — restarting via systemd" >> "$PULL_LOG"
    sudo systemctl restart "$SERVICE_NAME" 2>> "$PULL_LOG" || true
  fi
fi

# Auto-sync crontab if it changed
REPO_CRONTAB="${PROJECT_DIR}/scripts/ec2-bot/crontab.txt"
if [ -f "$REPO_CRONTAB" ]; then
  CURRENT_CRON=$(crontab -l 2>/dev/null || true)
  REPO_CRON=$(cat "$REPO_CRONTAB")
  if [ "$CURRENT_CRON" != "$REPO_CRON" ]; then
    crontab "$REPO_CRONTAB"
    echo "[$(date)] Crontab updated from repo" >> "$PULL_LOG"
  fi
fi
