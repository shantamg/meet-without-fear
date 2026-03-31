#!/usr/bin/env bash
set -euo pipefail

# Publish an OTA update with production environment variables.
#
# Usage:
#   ./scripts/publish-ota.sh "description of changes"
#   ./scripts/publish-ota.sh                          # uses latest commit message
#
# This script ensures the correct production env vars are set, preventing
# the bundle from being built with local dev URLs (which would break the app).
#
# IMPORTANT: Only run locally — NOT in GitHub Actions CI.
# CI's strict pnpm/npm mode can produce bundles that crash on device (SIGABRT).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$MOBILE_DIR"

# Metro loads .env automatically and OVERRIDES shell exports, so the only
# reliable way is to swap it out during the build.
ENV_FILE="$MOBILE_DIR/.env"
ENV_BACKUP="$MOBILE_DIR/.env.dev-backup"

if [ -f "$ENV_FILE" ]; then
  mv "$ENV_FILE" "$ENV_BACKUP"
  echo "Moved dev .env aside"
fi

# Write production .env (Metro will load this)
cat > "$ENV_FILE" << 'PRODENV'
EXPO_PUBLIC_API_URL=https://api.meetwithoutfear.com
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsubWVldHdpdGhvdXRmZWFyLmNvbSQ
EXPO_PUBLIC_MIXPANEL_TOKEN=bde416691ec555209e6949a2aec8abec
EXPO_PUBLIC_SENTRY_DSN=https://e22b3e2cd0c3db41a041e161ea0ea5df@o4511090762186752.ingest.us.sentry.io/4511090865930240
PRODENV

# Also export for good measure
export EXPO_PUBLIC_API_URL="https://api.meetwithoutfear.com"
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_Y2xlcmsubWVldHdpdGhvdXRmZWFyLmNvbSQ"
export EXPO_PUBLIC_MIXPANEL_TOKEN="bde416691ec555209e6949a2aec8abec"
export EXPO_PUBLIC_SENTRY_DSN="https://e22b3e2cd0c3db41a041e161ea0ea5df@o4511090762186752.ingest.us.sentry.io/4511090865930240"

# Clear Metro cache to force re-bundling with new env values
rm -rf "$MOBILE_DIR/dist" "$MOBILE_DIR/.expo" "$MOBILE_DIR/node_modules/.cache" /tmp/metro-* 2>/dev/null
echo "Cleared Metro cache"

# Restore dev .env on exit (even if the build fails)
restore_env() {
  if [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" "$ENV_FILE"
    echo "Restored local dev .env"
  else
    rm -f "$ENV_FILE"
  fi
}
trap restore_env EXIT

# Use provided message or latest commit message
MESSAGE="${1:-$(git log -1 --pretty=%s)}"

echo "Publishing OTA update to production branch..."
echo "  API URL: $EXPO_PUBLIC_API_URL"
echo "  Clerk:   pk_live_...$(echo $EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY | tail -c 8)"
echo "  Message: $MESSAGE"
echo ""

eas update --branch production --message "$MESSAGE" --platform ios --clear-cache

echo ""
echo "OTA update published. Users will see it on next app launch."
echo ""
echo "To roll back if something goes wrong:"
echo "  eas update:list --branch production --non-interactive --json  # find the group ID"
echo "  eas update:delete <group-id> --non-interactive                # delete it"
