#!/bin/bash
# gh-budget.sh — Per-session gh CLI call budget counter.
#
# Sourced by run-claude.sh. Expects: LOCK_PREFIX, BOT_OPS_CHANNEL_ID,
# COMMAND_SLUG, SLACK_BOT_TOKEN, ISSUE_NUMBER, LOGFILE
#
# Creates a PATH shim that wraps the real `gh` binary, incrementing a
# counter file on every invocation. When the count exceeds the threshold,
# posts a one-time warning to #bot-ops.

GH_BUDGET_THRESHOLD="${GH_BUDGET_THRESHOLD:-200}"
GH_BUDGET_COUNTER_FILE="${LOCK_PREFIX}-gh-count-$$"
GH_BUDGET_WARNED_FILE="${GH_BUDGET_COUNTER_FILE}.warned"
GH_BUDGET_SHIM_DIR="${LOCK_PREFIX}-gh-shim-$$"

# Find the real gh binary (before we prepend shim to PATH)
GH_REAL_PATH="$(command -v gh 2>/dev/null || true)"

gh_budget_setup() {
  [ -z "$GH_REAL_PATH" ] && return 0

  # Initialize counter
  echo "0" > "$GH_BUDGET_COUNTER_FILE"

  # Sample rate_limit baseline for session-cost computation. rate_limit
  # queries do not count against either bucket, so this is free. The
  # delta we compute at log_final time includes concurrent-process
  # contamination, but aggregated across many sessions the caller
  # ranking is still informative.
  if command -v jq >/dev/null 2>&1; then
    local raw
    raw=$("$GH_REAL_PATH" api rate_limit 2>/dev/null || true)
    if [ -n "$raw" ]; then
      GH_BUDGET_START_GQL=$(echo "$raw" | jq -r '.resources.graphql.used // empty' 2>/dev/null)
      GH_BUDGET_START_REST=$(echo "$raw" | jq -r '.resources.core.used // empty' 2>/dev/null)
      GH_BUDGET_START_GQL_RESET=$(echo "$raw" | jq -r '.resources.graphql.reset // empty' 2>/dev/null)
      export GH_BUDGET_START_GQL GH_BUDGET_START_REST GH_BUDGET_START_GQL_RESET
    fi
  fi

  # Create shim directory and wrapper script
  mkdir -p "$GH_BUDGET_SHIM_DIR"
  cat > "$GH_BUDGET_SHIM_DIR/gh" <<'SHIM_EOF'
#!/bin/bash
# gh budget shim — counts calls then delegates to real gh
COUNTER_FILE="@@COUNTER_FILE@@"
THRESHOLD="@@THRESHOLD@@"
WARNED_FILE="@@WARNED_FILE@@"
REAL_GH="@@REAL_GH@@"
BOT_OPS_CH="@@BOT_OPS_CH@@"
SLACK_TOKEN="@@SLACK_TOKEN@@"
CMD_SLUG="@@CMD_SLUG@@"
ISSUE_NUM="@@ISSUE_NUM@@"
SESSION_PID="@@SESSION_PID@@"

# Atomically increment counter using flock
{
  flock -x 9
  COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
  COUNT=$((COUNT + 1))
  echo "$COUNT" > "$COUNTER_FILE"
} 9>"${COUNTER_FILE}.lock"

# Post one-time warning on threshold breach
if [ "$COUNT" -ge "$THRESHOLD" ] && [ ! -f "$WARNED_FILE" ]; then
  touch "$WARNED_FILE"
  ISSUE_CTX=""
  [ -n "$ISSUE_NUM" ] && ISSUE_CTX=" (issue #${ISSUE_NUM})"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_TOKEN" -H "Content-Type: application/json" \
    -d "$(jq -n --arg ch "$BOT_OPS_CH" \
       --arg text "⚠️ gh budget warning: session PID $SESSION_PID (\`$CMD_SLUG\`${ISSUE_CTX}) has made $COUNT gh calls (threshold: $THRESHOLD)" \
       '{channel: $ch, text: $text}')" > /dev/null 2>&1 &
fi

# Delegate to real gh
exec "$REAL_GH" "$@"
SHIM_EOF

  # Substitute variables into the shim
  sed -i \
    -e "s|@@COUNTER_FILE@@|${GH_BUDGET_COUNTER_FILE}|g" \
    -e "s|@@THRESHOLD@@|${GH_BUDGET_THRESHOLD}|g" \
    -e "s|@@WARNED_FILE@@|${GH_BUDGET_WARNED_FILE}|g" \
    -e "s|@@REAL_GH@@|${GH_REAL_PATH}|g" \
    -e "s|@@BOT_OPS_CH@@|${BOT_OPS_CHANNEL_ID}|g" \
    -e "s|@@SLACK_TOKEN@@|${SLACK_BOT_TOKEN}|g" \
    -e "s|@@CMD_SLUG@@|${COMMAND_SLUG}|g" \
    -e "s|@@ISSUE_NUM@@|${ISSUE_NUMBER:-}|g" \
    -e "s|@@SESSION_PID@@|$$|g" \
    "$GH_BUDGET_SHIM_DIR/gh"

  chmod +x "$GH_BUDGET_SHIM_DIR/gh"

  # Prepend shim to PATH so all child processes use it
  export PATH="${GH_BUDGET_SHIM_DIR}:${PATH}"
}

gh_budget_log_final() {
  if [ -f "$GH_BUDGET_COUNTER_FILE" ]; then
    COUNT=$(cat "$GH_BUDGET_COUNTER_FILE" 2>/dev/null || echo 0)
    echo "[$(date)] gh budget: $COUNT calls (threshold: $GH_BUDGET_THRESHOLD)" >> "$LOGFILE"

    # Compute session-level point cost by sampling rate_limit again and
    # diffing against the baseline captured in gh_budget_setup. Skip
    # when the reset window rolled mid-session (delta would be negative
    # or meaningless).
    local graphql_cost="" rest_cost=""
    if [ -n "${GH_BUDGET_START_GQL:-}" ] && [ -n "$GH_REAL_PATH" ] && command -v jq >/dev/null 2>&1; then
      local raw
      raw=$("$GH_REAL_PATH" api rate_limit 2>/dev/null || true)
      if [ -n "$raw" ]; then
        local end_gql end_rest end_reset
        end_gql=$(echo "$raw" | jq -r '.resources.graphql.used // empty' 2>/dev/null)
        end_rest=$(echo "$raw" | jq -r '.resources.core.used // empty' 2>/dev/null)
        end_reset=$(echo "$raw" | jq -r '.resources.graphql.reset // empty' 2>/dev/null)
        if [ -n "$end_gql" ] && [ -n "$end_reset" ] && [ "$end_reset" = "${GH_BUDGET_START_GQL_RESET:-}" ]; then
          graphql_cost=$((end_gql - GH_BUDGET_START_GQL))
          rest_cost=$((end_rest - GH_BUDGET_START_REST))
        fi
      fi
    fi

    # Append per-workspace tracking entry for api-budget-summary.sh
    local budget_dir="${API_BUDGET_DIR:-${BOT_STATE_DIR:-/opt/slam-bot/state}/api-budget}"
    mkdir -p "$budget_dir" 2>/dev/null || true
    local today
    today=$(date +%Y-%m-%d)
    local workspace="${WORKSPACE_NAME:-${COMMAND_SLUG:-unknown}}"
    local jsonl_file="$budget_dir/workspace-calls-${today}.jsonl"
    local entry
    # Additive fields: graphql_cost and rest_cost are null when we
    # couldn't compute them (missing baseline, window rollover, or gh
    # unavailable). Downstream consumers treat null as "unknown".
    if [ -n "$graphql_cost" ]; then
      entry=$(jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg workspace "$workspace" \
        --argjson gh_calls "$COUNT" \
        --argjson graphql_cost "$graphql_cost" \
        --argjson rest_cost "$rest_cost" \
        --arg issue "${ISSUE_NUMBER:-}" \
        --arg pid "$$" \
        '{ts: $ts, workspace: $workspace, gh_calls: $gh_calls, graphql_cost: $graphql_cost, rest_cost: $rest_cost, issue: $issue, pid: $pid}' 2>/dev/null || true)
    else
      entry=$(jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg workspace "$workspace" \
        --argjson gh_calls "$COUNT" \
        --arg issue "${ISSUE_NUMBER:-}" \
        --arg pid "$$" \
        '{ts: $ts, workspace: $workspace, gh_calls: $gh_calls, graphql_cost: null, rest_cost: null, issue: $issue, pid: $pid}' 2>/dev/null || true)
    fi
    if [ -n "$entry" ]; then
      {
        flock -x 9
        echo "$entry" >> "$jsonl_file"
      } 9>"${jsonl_file}.lock" 2>/dev/null || true
    fi
  fi
}

gh_budget_cleanup() {
  rm -f "$GH_BUDGET_COUNTER_FILE" "${GH_BUDGET_COUNTER_FILE}.lock" "$GH_BUDGET_WARNED_FILE" 2>/dev/null || true
  rm -rf "$GH_BUDGET_SHIM_DIR" 2>/dev/null || true
}
