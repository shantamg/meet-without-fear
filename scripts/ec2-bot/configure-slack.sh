#!/bin/bash
# Configure Slack tokens on the slam-bot EC2 instance and start the socket listener.
#
# Run from your local machine. Prompts for secrets interactively (hidden) and
# streams them over SSH — no tokens in argv, shell history, or stdout.
#
# Usage:
#   bash scripts/ec2-bot/configure-slack.sh
set -euo pipefail

echo "Paste values when prompted. Tokens are hidden; channel IDs are shown."
echo

read -rsp "Bot User OAuth Token (xoxb-...): " SLACK_BOT_TOKEN; echo
read -rsp "App-Level Token (xapp-...):      " SLACK_APP_TOKEN; echo
read -rp  "DM channel ID (D...):                " SHANTAM_SLACK_DM
read -rp  "#slam-bot channel ID (C...):         " SLAM_BOT_CHANNEL_ID
read -rp  "#bugs-and-requests channel ID (C...):" BUGS_AND_REQUESTS_CHANNEL_ID

[[ "$SLACK_BOT_TOKEN" == xoxb-* ]] || { echo "ERROR: bot token should start with xoxb-"; exit 1; }
[[ "$SLACK_APP_TOKEN" == xapp-* ]] || { echo "ERROR: app token should start with xapp-"; exit 1; }

echo "Verifying bot token + fetching user ID..."
AUTH_RESP=$(curl -sf -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test)
if ! echo "$AUTH_RESP" | grep -q '"ok":true'; then
  echo "ERROR: Slack auth.test failed:"
  echo "$AUTH_RESP"
  exit 1
fi
SLAM_BOT_USER_ID=$(echo "$AUTH_RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["user_id"])')
BOT_TEAM=$(echo "$AUTH_RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["team"])')
echo "  Workspace:    $BOT_TEAM"
echo "  Bot user ID:  $SLAM_BOT_USER_ID"

# Build env additions locally, scp, then merge on remote
TMP=$(mktemp)
cat > "$TMP" <<ENV
SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN
SLACK_APP_TOKEN=$SLACK_APP_TOKEN
SLAM_BOT_USER_ID=$SLAM_BOT_USER_ID
SHANTAM_SLACK_DM=$SHANTAM_SLACK_DM
SLAM_BOT_CHANNEL_ID=$SLAM_BOT_CHANNEL_ID
BUGS_AND_REQUESTS_CHANNEL_ID=$BUGS_AND_REQUESTS_CHANNEL_ID
ENV

scp -q "$TMP" slam-bot:/tmp/slack-env.new
shred -u "$TMP" 2>/dev/null || rm -f "$TMP"

ssh slam-bot bash <<'REMOTE'
set -e
# Strip any prior Slack keys from existing .env, then append the new ones
grep -vE '^(SLACK_BOT_TOKEN|SLACK_APP_TOKEN|SLAM_BOT_USER_ID|SHANTAM_SLACK_DM|SLAM_BOT_CHANNEL_ID|BUGS_AND_REQUESTS_CHANNEL_ID)=' /opt/slam-bot/.env > /tmp/.env.base 2>/dev/null || touch /tmp/.env.base
cat /tmp/.env.base /tmp/slack-env.new > /opt/slam-bot/.env
chmod 600 /opt/slam-bot/.env
rm -f /tmp/.env.base /tmp/slack-env.new

echo "--- /opt/slam-bot/.env keys ---"
cut -d= -f1 /opt/slam-bot/.env

echo
echo "--- starting slam-bot-socket.service ---"
sudo systemctl restart slam-bot-socket
sleep 3
sudo systemctl status slam-bot-socket --no-pager | head -12

echo
echo "--- last 15 lines of socket-mode.log ---"
sudo tail -15 /var/log/slam-bot/socket-mode.log
REMOTE

echo
echo "DONE. Send a DM to Slam Bot in Slack to smoke-test the socket connection."
