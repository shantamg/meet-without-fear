#!/bin/bash
# cleanup-caches.sh — Clean build/package caches to prevent disk pressure.
# Run daily via cron (add to crontab: 0 4 * * * /opt/slam-bot/scripts/cleanup-caches.sh)
# Also safe to run manually at any time — only deletes re-downloadable caches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="${BOT_LOG_DIR}/cleanup-caches.log"

log() { echo "[$(date)] $*" >> "$LOGFILE"; }

log "Starting cache cleanup..."

FREED=0

# npm cache
if command -v npm &>/dev/null; then
  BEFORE=$(du -sm ~/.npm 2>/dev/null | awk '{print $1}' || echo 0)
  npm cache clean --force 2>/dev/null || true
  AFTER=$(du -sm ~/.npm 2>/dev/null | awk '{print $1}' || echo 0)
  DELTA=$((BEFORE - AFTER))
  [ "$DELTA" -gt 0 ] && FREED=$((FREED + DELTA))
  log "npm cache: freed ${DELTA}MB"
fi

# pip cache
if command -v pip &>/dev/null; then
  BEFORE=$(du -sm ~/.cache/pip 2>/dev/null | awk '{print $1}' || echo 0)
  pip cache purge 2>/dev/null || true
  AFTER=$(du -sm ~/.cache/pip 2>/dev/null | awk '{print $1}' || echo 0)
  DELTA=$((BEFORE - AFTER))
  [ "$DELTA" -gt 0 ] && FREED=$((FREED + DELTA))
  log "pip cache: freed ${DELTA}MB"
fi

# pnpm HTTP cache (not the store — just the HTTP cache)
if [ -d "$HOME/.cache/pnpm" ]; then
  BEFORE=$(du -sm ~/.cache/pnpm 2>/dev/null | awk '{print $1}' || echo 0)
  rm -rf "$HOME/.cache/pnpm"
  FREED=$((FREED + BEFORE))
  log "pnpm cache: freed ${BEFORE}MB"
fi

# node-gyp cache
if [ -d "$HOME/.cache/node-gyp" ]; then
  BEFORE=$(du -sm ~/.cache/node-gyp 2>/dev/null | awk '{print $1}' || echo 0)
  rm -rf "$HOME/.cache/node-gyp"
  FREED=$((FREED + BEFORE))
  log "node-gyp cache: freed ${BEFORE}MB"
fi

# systemd journal — keep 200MB
if command -v journalctl &>/dev/null; then
  sudo journalctl --vacuum-size=200M 2>/dev/null || true
  log "journalctl vacuumed to 200MB"
fi

# Slack image cache (downloaded by slack-get-images.mjs, not needed after triage)
if [ -d /tmp/slack-images ]; then
  BEFORE=$(du -sm /tmp/slack-images 2>/dev/null | awk '{print $1}' || echo 0)
  find /tmp/slack-images -type f -mmin +120 -delete 2>/dev/null || true
  find /tmp/slack-images -type d -empty -delete 2>/dev/null || true
  AFTER=$(du -sm /tmp/slack-images 2>/dev/null | awk '{print $1}' || echo 0)
  DELTA=$((BEFORE - AFTER))
  [ "$DELTA" -gt 0 ] && FREED=$((FREED + DELTA))
  log "slack image cache: freed ${DELTA}MB"
fi

# Claude Code session data (old conversation caches)
if [ -d "$HOME/.claude" ]; then
  BEFORE_CLAUDE=$(du -sm "$HOME/.claude" 2>/dev/null | awk '{print $1}' || echo 0)
  find "$HOME/.claude" -name "*.jsonl" -mtime +7 -delete 2>/dev/null || true
  find "$HOME/.claude" -name "*.json" -path "*/todos/*" -mtime +7 -delete 2>/dev/null || true
  AFTER_CLAUDE=$(du -sm "$HOME/.claude" 2>/dev/null | awk '{print $1}' || echo 0)
  DELTA=$((BEFORE_CLAUDE - AFTER_CLAUDE))
  [ "$DELTA" -gt 0 ] && FREED=$((FREED + DELTA))
  log "claude session cache: freed ${DELTA}MB"
fi

# git gc on the project repo
if [ -d "${REPO_ROOT}/.git" ]; then
  cd "$REPO_ROOT"
  git worktree prune 2>/dev/null || true
  git gc --prune=now 2>/dev/null || true
  log "git gc completed on $REPO_ROOT"
fi

DISK_PCT=$(df / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}' || echo "?")
log "Cleanup complete. Freed ~${FREED}MB total. Disk now at ${DISK_PCT}%."

echo "$FREED"
