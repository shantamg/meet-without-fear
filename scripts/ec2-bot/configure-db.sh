#!/bin/bash
# Create / rotate the slam_bot_readonly Postgres role on the Render database
# and save READONLY_DATABASE_URL to /opt/slam-bot/.env on the EC2.
#
# Runs entirely on the EC2 box so the generated readonly password never
# crosses your local machine. Uses the RENDER_API_KEY already in /opt/slam-bot/.env
# to fetch the master connection string.
#
# Usage:
#   bash scripts/ec2-bot/configure-db.sh                 # default DB id
#   DB_ID=dpg-xxxxxxxxxxxxxxxx bash scripts/ec2-bot/configure-db.sh
set -euo pipefail

DB_ID="${DB_ID:-dpg-d58660shg0os73bkkpmg-a}"  # be-heard-db

ssh slam-bot "DB_ID=$DB_ID bash -s" <<'REMOTE'
set -euo pipefail
source /opt/slam-bot/.env

INFO=$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/postgres/$DB_ID/connection-info")
MASTER_URL=$(echo "$INFO" | python3 -c 'import json,sys; print(json.load(sys.stdin)["externalConnectionString"])')

HOST=$(echo "$MASTER_URL" | sed -E "s|.*@([^:/]+).*|\1|")
PORT=$(echo "$MASTER_URL" | sed -nE "s|.*:([0-9]+)/.*|\1|p"); PORT=${PORT:-5432}
DBNAME=$(echo "$MASTER_URL" | sed -E "s|.*/([^?]+).*|\1|")

RO_PASS=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)

psql "$MASTER_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slam_bot_readonly') THEN
    CREATE ROLE slam_bot_readonly WITH LOGIN PASSWORD '${RO_PASS}';
  ELSE
    ALTER ROLE slam_bot_readonly WITH PASSWORD '${RO_PASS}';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE ${DBNAME} TO slam_bot_readonly;
GRANT USAGE ON SCHEMA public TO slam_bot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO slam_bot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO slam_bot_readonly;
SQL

RO_URL="postgresql://slam_bot_readonly:${RO_PASS}@${HOST}:${PORT}/${DBNAME}"

grep -vE "^READONLY_DATABASE_URL=" /opt/slam-bot/.env > /tmp/.env.base 2>/dev/null || touch /tmp/.env.base
echo "READONLY_DATABASE_URL=$RO_URL" >> /tmp/.env.base
mv /tmp/.env.base /opt/slam-bot/.env
chmod 600 /opt/slam-bot/.env

echo "role slam_bot_readonly created/rotated on ${DBNAME}"
echo "READONLY_DATABASE_URL saved to /opt/slam-bot/.env"
echo

# Quick verify: SELECT should work; writes should fail.
USER_COUNT=$(psql "$RO_URL" -tAc 'SELECT COUNT(*) FROM "User";' 2>/dev/null || echo "?")
echo "  SELECT COUNT(*) FROM \"User\" = $USER_COUNT"
if psql "$RO_URL" -c 'CREATE TABLE _ro_probe(x int);' 2>&1 | grep -q 'permission denied'; then
  echo "  CREATE correctly rejected (readonly enforced)"
else
  echo "  WARNING: CREATE was not rejected — readonly may not be enforced"
fi
REMOTE
