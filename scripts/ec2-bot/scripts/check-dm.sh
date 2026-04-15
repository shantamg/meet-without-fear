#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
source "$BOT_SCRIPTS_DIR/slack-lib.sh"

# Per-channel polling lock (prevents overlapping polls, not agents)
LOCKFILE="${LOCK_PREFIX}-check-dm.lock"
[ -f "$LOCKFILE" ] && exit 0
touch "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

DM_TEMPLATE="Shantam sent you a DM on Slack. Here is the message:

{MSG_TEXT}

Reply to Shantam in the DM channel {CHANNEL} using the Slack MCP tool (mcp__slack__conversations_add_message). Be helpful, friendly, and concise. You are the Slam Bot running on EC2.

Channel routing: Always reply in this DM channel unless Shantam explicitly asks you to post somewhere else."

slack_check_channel \
  "$SHANTAM_SLACK_DM" \
  "check-dm" \
  "dm-reply" \
  "" \
  10 \
  "$DM_TEMPLATE"
