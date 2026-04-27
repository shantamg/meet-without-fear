#!/usr/bin/env bash
# save-snapshot.sh — capture the current backend DB state as a snapshot row
# in the test-dashboard, plus the underlying .sql file on disk.
#
# Wraps backend/snapshots/create-snapshot.ts (which does the pg_dump) and
# adds the dashboard registration so the snapshot tree picks it up.
#
# Usage:
#   save-snapshot.sh <name> [--description <text>] [--parent-id <id>]
#                            [--from-run-id <id>]
#
# Examples:
#   save-snapshot.sh post-stage-2-empathy-shared
#   save-snapshot.sh fresh-after-merge --description "Clean state, post-#216"
#   save-snapshot.sh stage-3-complete --parent-id 01HK... --from-run-id 01KQ...
#
# Env (sourced from /opt/slam-bot/.env on EC2):
#   TEST_DASHBOARD_API_URL    e.g. https://mwf-test-dashboard.vercel.app
#   BOT_WRITER_TOKEN          x-bot-token value
#   DATABASE_URL              backend test database (read by create-snapshot.ts)

set -uo pipefail

# Load bot env. Operator-set env vars win.
BOT_ENV_FILE="${BOT_ENV_FILE:-/opt/slam-bot/.env}"
if [ -f "$BOT_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$BOT_ENV_FILE"
  set +a
fi

# ── Args ─────────────────────────────────────────────────────────────────────
if [ "$#" -lt 1 ]; then
  cat >&2 <<EOF
Usage: $0 <name> [flags]

Required:
  <name>                     human-readable snapshot name; used as filename
                             slug and the dashboard "name" field
                             (e.g. post-stage-2-empathy-shared)

Optional:
  --description <text>       free-form note about what this snapshot captures
  --parent-id <id>           dashboard snapshot id this branched from
  --from-run-id <id>         dashboard run id whose end state this captures
EOF
  exit 2
fi

NAME="$1"
shift

DESCRIPTION=""
PARENT_ID=""
FROM_RUN_ID=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --description)  DESCRIPTION="$2"; shift 2 ;;
    --parent-id)    PARENT_ID="$2";   shift 2 ;;
    --from-run-id)  FROM_RUN_ID="$2"; shift 2 ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

# ── Env ──────────────────────────────────────────────────────────────────────
: "${TEST_DASHBOARD_API_URL:?TEST_DASHBOARD_API_URL must be set}"
: "${BOT_WRITER_TOKEN:?BOT_WRITER_TOKEN must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set (read by backend/snapshots/create-snapshot.ts)}"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SNAPSHOTS_DIR="$REPO_ROOT/backend/snapshots"

if [ ! -d "$SNAPSHOTS_DIR" ]; then
  echo "[save-snapshot] backend/snapshots not found at $SNAPSHOTS_DIR" >&2
  exit 1
fi

# ── 1. Dump the DB to a .sql file ────────────────────────────────────────────
echo "[save-snapshot] dumping DB to backend/snapshots/snapshot-${NAME}--<timestamp>.sql"
(cd "$REPO_ROOT/backend" && npx tsx snapshots/create-snapshot.ts "$NAME") || {
  echo "[save-snapshot] create-snapshot.ts failed" >&2
  exit 1
}

# Find the file we just created — newest snapshot-<name>-*.sql.
SQL_FILE=$(ls -t "$SNAPSHOTS_DIR"/snapshot-"$NAME"--*.sql 2>/dev/null | head -1)
if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
  echo "[save-snapshot] could not find the SQL file we just dumped" >&2
  exit 1
fi
RELATIVE_PATH="backend/snapshots/$(basename "$SQL_FILE")"
echo "[save-snapshot] dumped: $RELATIVE_PATH ($(du -h "$SQL_FILE" | cut -f1))"

# ── 2. Compute a quick db_state_summary (row counts in key tables) ───────────
DB_SUMMARY="null"
if command -v psql >/dev/null 2>&1; then
  COUNTS=$(
    PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p') \
    psql "$DATABASE_URL" -tA -F: -c '
      SELECT '\''Session'\'',          COUNT(*) FROM "Session"          UNION ALL
      SELECT '\''Message'\'',          COUNT(*) FROM "Message"          UNION ALL
      SELECT '\''StageProgress'\'',    COUNT(*) FROM "StageProgress"    UNION ALL
      SELECT '\''EmpathyAttempt'\'',   COUNT(*) FROM "EmpathyAttempt"   UNION ALL
      SELECT '\''Invitation'\'',       COUNT(*) FROM "Invitation"       UNION ALL
      SELECT '\''User'\'',             COUNT(*) FROM "User";' 2>/dev/null || echo ""
  )
  if [ -n "$COUNTS" ]; then
    # Build {"Session": 4, "Message": 27, ...} from the colon-separated rows.
    DB_SUMMARY=$(echo "$COUNTS" | jq -Rn '
      [inputs | select(length > 0) | split(":") | {(.[0]): (.[1] | tonumber)}]
      | add // {}
    ')
  fi
fi

# ── 3. Register with the dashboard ───────────────────────────────────────────
PAYLOAD=$(jq -n \
  --arg name        "$NAME" \
  --arg description "$DESCRIPTION" \
  --arg file_path   "$RELATIVE_PATH" \
  --arg parent_id   "$PARENT_ID" \
  --arg created_by_run_id "$FROM_RUN_ID" \
  --argjson db_state_summary "$DB_SUMMARY" \
  '{
     name: $name,
     description: (if $description == "" then null else $description end),
     file_path: $file_path,
     parent_id: (if $parent_id == "" then null else $parent_id end),
     created_by_run_id: (if $created_by_run_id == "" then null else $created_by_run_id end),
     db_state_summary: $db_state_summary
   }')

echo "[save-snapshot] registering with dashboard at $TEST_DASHBOARD_API_URL"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$TEST_DASHBOARD_API_URL/api/snapshots" \
  -H "content-type: application/json" \
  -H "x-bot-token: $BOT_WRITER_TOKEN" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "201" ]; then
  echo "[save-snapshot] registration failed: HTTP $HTTP_CODE" >&2
  echo "$BODY" >&2
  exit 1
fi

SNAPSHOT_ID=$(echo "$BODY" | jq -r '.id')
echo ""
echo "[save-snapshot] DONE"
echo "[save-snapshot] snapshot id: $SNAPSHOT_ID"
echo "[save-snapshot] file:        $RELATIVE_PATH"
echo "[save-snapshot] view:        $TEST_DASHBOARD_API_URL/snapshot/$SNAPSHOT_ID"
