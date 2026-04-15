#!/bin/bash
# bot-health-check.sh — Daily maintenance and health check for the EC2 bot instance
# Runs daily at 6 AM UTC (11 PM Pacific) via cron
# Checks resources, cleans up stale files, and alerts on issues via #bot-ops
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGDIR="$BOT_LOG_DIR"
LOGFILE="$LOGDIR/bot-health-check.log"
ALERTS=""

NL=$'\n'
log() { echo "[$(date)] $1" >> "$LOGFILE"; }
alert() { ALERTS="${ALERTS}${NL}$1"; log "ALERT: $1"; }

log "=== Bot health check starting ==="

# ---------------------------------------------------------------------------
# 1. Memory
# ---------------------------------------------------------------------------
MEM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
MEM_USED=$(free -m | awk '/Mem:/ {print $3}')
MEM_PCT=$(( MEM_USED * 100 / MEM_TOTAL ))
log "Memory: ${MEM_USED}MB / ${MEM_TOTAL}MB (${MEM_PCT}%)"
[ "$MEM_PCT" -ge 80 ] && alert "Memory usage high: ${MEM_PCT}% (${MEM_USED}MB / ${MEM_TOTAL}MB)"

# Check for swap
if ! swapon --show | grep -q .; then
  log "WARNING: No swap configured"
fi

# Check for OOM kills in last 24h
OOM_KILLS=$(dmesg -T 2>/dev/null | grep -c "Killed process" || true)
[ "$OOM_KILLS" -gt 0 ] && alert "OOM kills detected in dmesg: $OOM_KILLS"

# ---------------------------------------------------------------------------
# 2. Disk
# ---------------------------------------------------------------------------
DISK_PCT=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
log "Disk: ${DISK_PCT}% used, ${DISK_AVAIL} available"
[ "$DISK_PCT" -ge 80 ] && alert "Disk usage high: ${DISK_PCT}% (${DISK_AVAIL} free)"

INODE_PCT=$(df -i / | awk 'NR==2 {print $5}' | tr -d '%')
log "Inodes: ${INODE_PCT}% used"
[ "$INODE_PCT" -ge 80 ] && alert "Inode usage high: ${INODE_PCT}%"

# ---------------------------------------------------------------------------
# 3. Runaway Claude processes
# ---------------------------------------------------------------------------
LARGE_PROCS=""
OLD_PROCS=""
while IFS= read -r line; do
  PID=$(echo "$line" | awk '{print $1}')
  RSS_KB=$(echo "$line" | awk '{print $2}')
  ELAPSED=$(echo "$line" | awk '{print $3}')
  RSS_MB=$(( RSS_KB / 1024 ))

  # Flag processes using > 1.5GB RSS
  if [ "$RSS_KB" -gt 1500000 ]; then
    LARGE_PROCS="${LARGE_PROCS}PID $PID: ${RSS_MB}MB RSS${NL}"
  fi

  # Flag processes older than 2 hours (elapsed > 7200 seconds)
  if [ "$ELAPSED" -gt 7200 ]; then
    OLD_PROCS="${OLD_PROCS}PID $PID: ${ELAPSED}s old, ${RSS_MB}MB RSS${NL}"
  fi
done < <(ps -eo pid,rss,etimes,cmd 2>/dev/null | grep '[c]laude' | awk '{print $1, $2, $3}')

[ -n "$LARGE_PROCS" ] && alert "Large Claude processes (>1.5GB):${NL}${LARGE_PROCS}"
[ -n "$OLD_PROCS" ] && alert "Old Claude processes (>2h):${NL}${OLD_PROCS}"

# Zombie processes
ZOMBIES=$(ps aux 2>/dev/null | awk '$8 == "Z"' | wc -l)
[ "$ZOMBIES" -gt 0 ] && alert "$ZOMBIES zombie process(es) detected"

# ---------------------------------------------------------------------------
# 4. Log cleanup — per-message logs older than 7 days
# ---------------------------------------------------------------------------
CLEANED=0
for PATTERN in "dm-reply-*" "respond-github-*" "check-slack-pmf1-*" "review-pr-*"; do
  COUNT=$(find "$LOGDIR" -name "${PATTERN}.log" -mtime +7 -delete -print 2>/dev/null | wc -l)
  CLEANED=$(( CLEANED + COUNT ))
done
# Clean old compressed rotated logs
GZ_COUNT=$(find "$LOGDIR" -name "*.log.gz" -mtime +14 -delete -print 2>/dev/null | wc -l)
CLEANED=$(( CLEANED + GZ_COUNT ))
[ "$CLEANED" -gt 0 ] && log "Cleaned $CLEANED old log files"

LOG_SIZE=$(du -sh "$LOGDIR" 2>/dev/null | awk '{print $1}')
LOG_COUNT=$(find "$LOGDIR" -type f | wc -l)
log "Log dir: $LOG_SIZE across $LOG_COUNT files"

# ---------------------------------------------------------------------------
# 5. Worktree cleanup
# ---------------------------------------------------------------------------
cd ~/meet-without-fear 2>/dev/null || true
git worktree prune 2>/dev/null || true
STALE_WORKTREES=$(find ~/meet-without-fear/.claude/worktrees -maxdepth 1 -mindepth 1 -type d -mtime +1 2>/dev/null || true)
if [ -n "$STALE_WORKTREES" ]; then
  WT_COUNT=$(echo "$STALE_WORKTREES" | wc -l)
  for WT in $STALE_WORKTREES; do
    WT_SIZE=$(du -sh "$WT" 2>/dev/null | awk '{print $1}')
    WT_NAME=$(basename "$WT")
    log "Removing stale worktree: $WT_NAME ($WT_SIZE)"
    git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"
  done
  log "Cleaned $WT_COUNT stale worktree(s)"
fi

# ---------------------------------------------------------------------------
# 6. Cron health — verify each script ran recently
# ---------------------------------------------------------------------------
check_cron_freshness() {
  local NAME="$1"
  local MAX_MINUTES="$2"
  local LOG_PATH="$3"

  if [ ! -f "$LOG_PATH" ]; then
    alert "Cron log missing: $NAME ($LOG_PATH)"
    return
  fi

  local LAST_MOD
  LAST_MOD=$(stat -c %Y "$LOG_PATH" 2>/dev/null || echo 0)
  local AGE_MIN=$(( ($(date +%s) - LAST_MOD) / 60 ))

  if [ "$AGE_MIN" -gt "$MAX_MINUTES" ]; then
    alert "Cron stale: $NAME — last activity ${AGE_MIN}m ago (expected <${MAX_MINUTES}m)"
  fi
}

check_cron_freshness "check-github" 10 "$LOGDIR/check-github.log"
check_cron_freshness "git-pull" 5 "$LOGDIR/git-pull.log"

# Check for repeated errors in check-github.log (last 100 lines)
GH_ERRORS=$(tail -100 "$LOGDIR/check-github.log" 2>/dev/null | grep -c "GitHub API error" || true)
[ "$GH_ERRORS" -gt 50 ] && alert "GitHub monitor failing: $GH_ERRORS errors in last 100 log lines"

# ---------------------------------------------------------------------------
# 7. Auth health
# ---------------------------------------------------------------------------
# Check local token only — gh auth status makes an API call that fails during
# rate limiting, producing false "auth broken" alerts. Instead, verify the
# token file exists and contains a token for github.com.
if [ ! -f "$HOME/.config/gh/hosts.yml" ] || ! grep -q "github.com" "$HOME/.config/gh/hosts.yml" 2>/dev/null; then
  alert "GitHub auth (gh) is broken — run \`gh auth login\` on the bot"
fi

# ---------------------------------------------------------------------------
# 7b. CloudWatch agent health
# ---------------------------------------------------------------------------
if ! systemctl is-active --quiet amazon-cloudwatch-agent; then
  alert "CloudWatch agent is not running — metrics and alarms are offline. Run: sudo systemctl start amazon-cloudwatch-agent"
else
  log "CloudWatch agent: running"
fi

# ---------------------------------------------------------------------------
# 8. System updates
# ---------------------------------------------------------------------------
UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c upgradable || true)
log "Pending apt updates: $UPGRADABLE"
[ "$UPGRADABLE" -gt 20 ] && alert "$UPGRADABLE pending apt updates — consider running \`sudo apt upgrade\`"

if [ -f /var/run/reboot-required ]; then
  alert "System reboot required (kernel update pending)"
fi

# ---------------------------------------------------------------------------
# 9. Claim file report
# ---------------------------------------------------------------------------
CLAIM_COUNT=$(find "$CLAIMS_DIR" -name "claimed-*.txt" 2>/dev/null | wc -l)
log "Claim files: $CLAIM_COUNT"
[ "$CLAIM_COUNT" -gt 500 ] && alert "Claim directory growing large: $CLAIM_COUNT files"

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [ -n "$ALERTS" ]; then
  SUMMARY="🤖 *Bot Health Check* — $(date -u +%Y-%m-%d)${NL}${NL}"
  SUMMARY+="⚠️ *Issues found:*${NL}${ALERTS}${NL}${NL}"
  SUMMARY+="📊 Memory: ${MEM_PCT}% | Disk: ${DISK_PCT}% | Logs: ${LOG_SIZE} (${LOG_COUNT} files) | Claims: ${CLAIM_COUNT}"

  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg text "$SUMMARY" \
      '{channel: $ch, text: $text}')" >/dev/null
  log "Sent alert to Slack"
else
  SUMMARY="🤖 *Bot Health Check* — $(date -u +%Y-%m-%d) — ✅ All clear${NL}${NL}"
  SUMMARY+="📊 Memory: ${MEM_PCT}% | Disk: ${DISK_PCT}% | Logs: ${LOG_SIZE} (${LOG_COUNT} files) | Claims: ${CLAIM_COUNT}"

  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg text "$SUMMARY" \
      '{channel: $ch, text: $text}')" >/dev/null
  log "All clear — sent status to Slack"
fi

log "=== Bot health check complete ==="
