#!/bin/bash
# prune-claude-projects.sh — Delete Claude session jsonl files older than
# CLAUDE_PROJECTS_RETENTION_DAYS (default 30) from the bot's per-project
# session storage.
#
# Why
# ---
# Each bot Claude session writes its full conversation (input + every
# tool call + every assistant turn) to a jsonl file in:
#
#   ~/.claude/projects/-home-ubuntu-meet-without-fear/<session-uuid>.jsonl
#
# These files are the canonical record of what the bot was asked to do
# and what it did, and the bot's own _active/_archived/agent-<pid>/
# directories now link to them via meta.json.claudeSessionId. They are
# valuable for auditing recent sessions, but the directory grows ~10MB
# per day with no built-in rotation, so this script enforces a retention
# window. Sessions are deleted in date order (oldest first); the matching
# bot agent archives (which only contain meta.json/route.json/raw-stream)
# are NOT touched here — they're orders of magnitude smaller and contain
# their own session_id pointer that becomes a tombstone.
#
# Run daily via cron. Safe to run concurrently (find -delete is atomic
# per file).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

CLAUDE_PROJECTS_DIR="${CLAUDE_PROJECTS_DIR:-${HOME}/.claude/projects/-home-ubuntu-meet-without-fear}"
CLAUDE_PROJECTS_RETENTION_DAYS="${CLAUDE_PROJECTS_RETENTION_DAYS:-30}"

[ -d "$CLAUDE_PROJECTS_DIR" ] || {
  echo "[$(date)] prune-claude-projects: dir does not exist, skipping ($CLAUDE_PROJECTS_DIR)"
  exit 0
}

BEFORE_COUNT=$(find "$CLAUDE_PROJECTS_DIR" -maxdepth 1 -type f -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
BEFORE_BYTES=$(du -sb "$CLAUDE_PROJECTS_DIR" 2>/dev/null | awk '{print $1}')

# Delete jsonl files older than retention window. Use -mtime to match
# the file's last-modified time, which is when the session last wrote to
# it (i.e., when the session ended). Bash test prevents accidental
# `find / -delete` if env vars get clobbered.
if [ -n "$CLAUDE_PROJECTS_DIR" ] && [ "$CLAUDE_PROJECTS_DIR" != "/" ]; then
  find "$CLAUDE_PROJECTS_DIR" -maxdepth 1 -type f -name '*.jsonl' \
    -mtime "+${CLAUDE_PROJECTS_RETENTION_DAYS}" -delete 2>/dev/null || true
fi

AFTER_COUNT=$(find "$CLAUDE_PROJECTS_DIR" -maxdepth 1 -type f -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
AFTER_BYTES=$(du -sb "$CLAUDE_PROJECTS_DIR" 2>/dev/null | awk '{print $1}')
DELETED=$((BEFORE_COUNT - AFTER_COUNT))
FREED=$((BEFORE_BYTES - AFTER_BYTES))

echo "[$(date)] prune-claude-projects: deleted=${DELETED} freed_bytes=${FREED} remaining=${AFTER_COUNT} retention_days=${CLAUDE_PROJECTS_RETENTION_DAYS}"
