#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

# Socket Mode health check watchdog — runs every 5 minutes via cron.
#
# Uses systemctl to manage the socket listener service. Checks:
#   1. Is the systemd service active?
#   2. Has it received an event recently (heartbeat file)?
#
# If the service is down, starts it. If it appears hung (no heartbeat
# in 15+ minutes), restarts it.
#
# If the process has restarted 3+ times in the last hour, alerts Shantam.

SERVICE_NAME="slam-bot-socket"
LOGFILE="${BOT_LOG_DIR}/socket-mode.log"
HEARTBEAT_FILE="${BOT_STATE_DIR}/socket-mode-heartbeat.txt"
RESTART_LOG="${BOT_STATE_DIR}/socket-mode-restarts.log"

log() {
  echo "[$(date)] $1" >> "$LOGFILE"
}

start_socket_mode() {
  log "Starting Socket Mode listener via systemctl..."

  # Install deps if node_modules is missing
  if [ ! -d "${BOT_HOME}/socket-mode/node_modules" ]; then
    log "Installing dependencies..."
    cd "${BOT_HOME}/socket-mode" && npm install --production >> "$LOGFILE" 2>&1
  fi

  sudo systemctl start "$SERVICE_NAME"

  # Log the restart for rate limiting
  echo "$(date +%s)" >> "$RESTART_LOG"

  log "Socket Mode listener started via systemd"
}

restart_socket_mode() {
  log "Restarting Socket Mode listener via systemctl..."
  sudo systemctl restart "$SERVICE_NAME"

  # Log the restart for rate limiting
  echo "$(date +%s)" >> "$RESTART_LOG"

  log "Socket Mode listener restarted via systemd"
}

check_restart_rate() {
  # Count restarts in the last hour
  if [ ! -f "$RESTART_LOG" ]; then
    return
  fi

  local CUTOFF
  CUTOFF=$(($(date +%s) - 3600))
  local COUNT
  COUNT=$(awk -v cutoff="$CUTOFF" '$1 > cutoff' "$RESTART_LOG" 2>/dev/null | wc -l)

  if [ "$COUNT" -ge 3 ]; then
    log "WARNING: Socket Mode has restarted $COUNT times in the last hour — alerting Shantam"
    curl -s -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg count "$COUNT" --arg logpath "${BOT_LOG_DIR}/socket-mode.log" \
        '{channel: $ch, text: ("⚠️ Socket Mode listener has restarted " + $count + " times in the last hour. May need manual investigation. SSH in and check: `tail -100 " + $logpath + "`")}')" >/dev/null
  fi

  # Prune old entries (keep last 24h)
  local DAY_AGO
  DAY_AGO=$(($(date +%s) - 86400))
  if [ -f "$RESTART_LOG" ]; then
    awk -v cutoff="$DAY_AGO" '$1 > cutoff' "$RESTART_LOG" > "${RESTART_LOG}.tmp" 2>/dev/null
    mv "${RESTART_LOG}.tmp" "$RESTART_LOG"
  fi
}

# Main logic

# Check if systemd service is active
RUNNING=false
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  RUNNING=true
fi

if ! $RUNNING; then
  log "Socket Mode listener is not running — starting"
  start_socket_mode
  check_restart_rate
  exit 0
fi

# Process is running — check heartbeat
if [ -f "$HEARTBEAT_FILE" ]; then
  LAST_HEARTBEAT=$(cat "$HEARTBEAT_FILE")
  LAST_EPOCH=$(date -d "$LAST_HEARTBEAT" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$(( NOW_EPOCH - LAST_EPOCH ))

  if [ "$AGE" -gt 900 ]; then
    # No heartbeat in 15+ minutes — process may be hung
    log "Socket Mode listener appears hung (no heartbeat in ${AGE}s) — restarting"
    restart_socket_mode
    check_restart_rate
    exit 0
  fi
fi

# All good
log "Socket Mode listener healthy (systemd: active)"
