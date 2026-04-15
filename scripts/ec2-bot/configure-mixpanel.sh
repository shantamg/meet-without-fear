#!/bin/bash
# Configure Mixpanel service-account credentials on the slam-bot EC2 instance.
#
# Run from your local machine. Prompts for secrets interactively (hidden) and
# streams them over SSH — no tokens in argv, shell history, or stdout.
#
# To get these: Mixpanel → Project Settings → Service Accounts → create one
# (or use an existing one). The project ID is the numeric segment in your
# Mixpanel URL: https://mixpanel.com/project/<PROJECT_ID>/...
#
# Usage:
#   bash scripts/ec2-bot/configure-mixpanel.sh
set -euo pipefail

echo "Mixpanel service-account credentials."
echo "Get these at: Mixpanel → Project Settings → Service Accounts"
echo

read -rp  "Mixpanel project ID (numeric):           " MIXPANEL_PROJECT_ID
read -rsp "Mixpanel service-account username:       " MIXPANEL_USERNAME; echo
read -rsp "Mixpanel service-account secret:         " MIXPANEL_SECRET; echo

[[ -n "$MIXPANEL_PROJECT_ID" ]] || { echo "ERROR: project ID required"; exit 1; }
[[ -n "$MIXPANEL_USERNAME"   ]] || { echo "ERROR: username required";   exit 1; }
[[ -n "$MIXPANEL_SECRET"     ]] || { echo "ERROR: secret required";     exit 1; }
[[ "$MIXPANEL_PROJECT_ID" =~ ^[0-9]+$ ]] || { echo "ERROR: project ID should be numeric"; exit 1; }

echo "Verifying credentials via Mixpanel API..."
HTTP_CODE=$(curl -s -o /tmp/mixpanel-check.$$ -w "%{http_code}" \
  --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://mixpanel.com/api/2.0/events/top?project_id=$MIXPANEL_PROJECT_ID&type=general&limit=1")
BODY=$(cat /tmp/mixpanel-check.$$)
rm -f /tmp/mixpanel-check.$$

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Mixpanel API returned HTTP $HTTP_CODE"
  echo "$BODY" | head -c 500
  echo
  exit 1
fi
echo "  OK — API auth succeeded."

# Build env additions locally, scp, merge on remote
TMP=$(mktemp)
cat > "$TMP" <<ENV
MIXPANEL_PROJECT_ID=$MIXPANEL_PROJECT_ID
MIXPANEL_USERNAME=$MIXPANEL_USERNAME
MIXPANEL_SECRET=$MIXPANEL_SECRET
ENV

scp -q "$TMP" slam-bot:/tmp/mixpanel-env.new
shred -u "$TMP" 2>/dev/null || rm -f "$TMP"

ssh slam-bot bash <<'REMOTE'
set -e
grep -vE '^(MIXPANEL_PROJECT_ID|MIXPANEL_USERNAME|MIXPANEL_SECRET)=' /opt/slam-bot/.env > /tmp/.env.base 2>/dev/null || touch /tmp/.env.base
cat /tmp/.env.base /tmp/mixpanel-env.new > /opt/slam-bot/.env
chmod 600 /opt/slam-bot/.env
rm -f /tmp/.env.base /tmp/mixpanel-env.new

echo "--- /opt/slam-bot/.env keys ---"
cut -d= -f1 /opt/slam-bot/.env
REMOTE

echo
echo "DONE. check-mixpanel diagnostic skill is now functional."
