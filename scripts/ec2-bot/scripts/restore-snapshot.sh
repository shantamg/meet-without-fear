#!/usr/bin/env bash
# restore-snapshot.sh — fetch a snapshot's metadata from the dashboard and
# reset the local backend DB to that state.
#
# Wraps backend/snapshots/reset-to-snapshot.ts which does the actual
# truncate + psql restore + prisma migrate deploy.
#
# Usage:
#   restore-snapshot.sh <snapshot-id>
#
# Example:
#   restore-snapshot.sh 01KQ8FZG...
#
# Env:
#   TEST_DASHBOARD_API_URL    where to fetch snapshot metadata from
#   DATABASE_URL              backend test database (read by reset-to-snapshot.ts)
#
# Note: snapshot-id can also be a partial filename (e.g. "03-invitation-accepted")
# in which case we skip the API and let reset-to-snapshot.ts find it on disk.

set -uo pipefail

BOT_ENV_FILE="${BOT_ENV_FILE:-/opt/slam-bot/.env}"
if [ -f "$BOT_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$BOT_ENV_FILE"
  set +a
fi

if [ "$#" -ne 1 ]; then
  cat >&2 <<EOF
Usage: $0 <snapshot-id-or-name>

Examples:
  $0 01KQ8FZGABCDEF...        # fetch metadata from dashboard, then restore
  $0 03-invitation-accepted   # restore directly from backend/snapshots/ by name match
EOF
  exit 2
fi

ID_OR_NAME="$1"
# Resolve symlinks before walking up (EC2 invokes via /opt/slam-bot/scripts/...).
SCRIPT_REAL="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_REAL")/../../.." && pwd)"

: "${DATABASE_URL:?DATABASE_URL must be set}"

# Heuristic: if the id looks like a ULID (26 alphanum chars), look it up via
# the dashboard. Otherwise pass straight through to reset-to-snapshot.ts which
# can match by name fragment.
if [[ "$ID_OR_NAME" =~ ^[0-9A-Z]{26}$ ]]; then
  : "${TEST_DASHBOARD_API_URL:?TEST_DASHBOARD_API_URL must be set to look up by id}"
  echo "[restore-snapshot] fetching $ID_OR_NAME metadata from dashboard"
  RESPONSE=$(curl -s -w "\n%{http_code}" "$TEST_DASHBOARD_API_URL/api/snapshots/$ID_OR_NAME")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[restore-snapshot] lookup failed: HTTP $HTTP_CODE" >&2
    echo "$BODY" >&2
    exit 1
  fi
  FILE_PATH=$(echo "$BODY" | jq -r '.snapshot.file_path')
  if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ]; then
    echo "[restore-snapshot] snapshot has no file_path" >&2
    exit 1
  fi
  ABSOLUTE_PATH="$REPO_ROOT/$FILE_PATH"
  if [ ! -f "$ABSOLUTE_PATH" ]; then
    echo "[restore-snapshot] file_path points at $ABSOLUTE_PATH but it doesn't exist on this machine" >&2
    echo "[restore-snapshot] (snapshots are filesystem-bound to the box that created them; copy it over first)" >&2
    exit 1
  fi
  TARGET="$ABSOLUTE_PATH"
else
  # Pass-through: reset-to-snapshot.ts handles name fragments + absolute paths.
  TARGET="$ID_OR_NAME"
fi

echo "[restore-snapshot] resetting DB to: $TARGET"
(cd "$REPO_ROOT/backend" && npx tsx snapshots/reset-to-snapshot.ts "$TARGET")
