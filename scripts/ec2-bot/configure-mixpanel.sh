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

# First try the Export API on data.mixpanel.com — tends to be available on
# more plans than the Query API.
YESTERDAY=$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d 'yesterday' +%Y-%m-%d)
EXPORT_CODE=$(curl -s -o /tmp/mixpanel-check.$$ -w "%{http_code}" \
  --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=$MIXPANEL_PROJECT_ID&from_date=$YESTERDAY&to_date=$YESTERDAY&limit=1")
EXPORT_BODY=$(cat /tmp/mixpanel-check.$$)
rm -f /tmp/mixpanel-check.$$

case "$EXPORT_CODE" in
  200)
    echo "  OK — Export API auth succeeded."
    ;;
  401|403)
    echo "ERROR: Mixpanel Export API returned HTTP $EXPORT_CODE — credentials rejected."
    echo "$EXPORT_BODY" | head -c 300; echo
    echo "Double-check project ID, username, secret, and that the service account"
    echo "has read access to this project."
    exit 1
    ;;
  402)
    echo "  WARN — Export API returned HTTP 402 (plan restriction). Credentials appear"
    echo "  valid (a 401 would have been a real auth failure). check-mixpanel may not"
    echo "  work until the Mixpanel plan is upgraded, but the vars will be saved so"
    echo "  the skill can at least attempt calls and surface the 402 clearly."
    ;;
  *)
    echo "  WARN — Export API returned HTTP $EXPORT_CODE (unexpected). Saving creds"
    echo "  anyway; investigate with the bot's check-mixpanel skill."
    echo "$EXPORT_BODY" | head -c 300; echo
    ;;
esac

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
