#!/bin/bash
set -euo pipefail

# audit-routing.sh — Measure agent routing accuracy through ICM workspaces
#
# Reads archived agent directories from _active/_archived/ and compares
# meta.json (what the job was) with route.json (where the agent went)
# to produce an accuracy report and flag misroutes.
#
# Usage:
#   audit-routing.sh                       # All archived agents
#   audit-routing.sh --days 7              # Last 7 days only
#   audit-routing.sh --workspace bug-fix   # Filter to one workspace
#   audit-routing.sh --days 7 --json       # Machine-readable output
#   audit-routing.sh --verbose             # Show every agent, not just misroutes
#
# Depends on:
#   - _active/_archived/ directories with meta.json + route.json
#   - bot-workspaces/expected-routes.json for expected routing table

# ── Resolve paths ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
ARCHIVED_DIR="${REPO_ROOT}/bot-workspaces/_active/_archived"
EXPECTED_ROUTES="${REPO_ROOT}/bot-workspaces/expected-routes.json"

# ── Parse arguments ──
DAYS=""
WORKSPACE_FILTER=""
JSON_OUTPUT=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --days)
      DAYS="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE_FILTER="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: audit-routing.sh [--days N] [--workspace NAME] [--json] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --days N          Only include agents from the last N days"
      echo "  --workspace NAME  Filter to agents expected to route to NAME"
      echo "  --json            Output machine-readable JSON instead of table"
      echo "  --verbose         Show every agent row, not just misroutes"
      echo ""
      echo "Reads archived agent directories from _active/_archived/ and compares"
      echo "meta.json (commandSlug) with route.json (workspace, stage) against the"
      echo "expected routing table in expected-routes.json."
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Validate prerequisites ──
if [ ! -f "$EXPECTED_ROUTES" ]; then
  echo "ERROR: Expected routes file not found: $EXPECTED_ROUTES" >&2
  echo "Create it with workspace/firstStage mappings for each command slug." >&2
  exit 1
fi

if [ ! -d "$ARCHIVED_DIR" ]; then
  echo "No archived agent directories found at: $ARCHIVED_DIR"
  echo "(Agents are archived when they exit — run some agents first.)"
  exit 0
fi

# ── Compute cutoff timestamp ──
CUTOFF_EPOCH=0
if [ -n "$DAYS" ]; then
  # Cross-platform date arithmetic
  if date -v-1d +%s >/dev/null 2>&1; then
    # macOS
    CUTOFF_EPOCH=$(date -v-"${DAYS}"d +%s)
  else
    # GNU/Linux
    CUTOFF_EPOCH=$(date -d "${DAYS} days ago" +%s)
  fi
fi

# ── Helper: match a command slug against expected-routes.json ──
# Returns the expected workspace and firstStage, or empty if no match.
# Supports glob patterns: "respond-github-*" matches "respond-github-123"
lookup_expected_route() {
  local slug="$1"

  # First try exact match
  local result
  result=$(jq -r --arg s "$slug" '.routes[$s] // empty | "\(.workspace) \(.firstStage)"' "$EXPECTED_ROUTES" 2>/dev/null)
  if [ -n "$result" ]; then
    echo "$result"
    return
  fi

  # Try glob patterns (entries ending with *)
  local patterns
  patterns=$(jq -r '.routes | keys[] | select(endswith("*"))' "$EXPECTED_ROUTES" 2>/dev/null)
  for pattern in $patterns; do
    # Convert glob to prefix match: "respond-github-*" -> "respond-github-"
    local prefix="${pattern%\*}"
    if [[ "$slug" == ${prefix}* ]]; then
      result=$(jq -r --arg p "$pattern" '.routes[$p] | "\(.workspace) \(.firstStage)"' "$EXPECTED_ROUTES" 2>/dev/null)
      if [ -n "$result" ]; then
        echo "$result"
        return
      fi
    fi
  done
}

# ── Helper: convert ISO timestamp to epoch ──
iso_to_epoch() {
  local ts="$1"
  if date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s >/dev/null 2>&1; then
    # macOS
    date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s 2>/dev/null || echo 0
  else
    # GNU/Linux
    date -d "$ts" +%s 2>/dev/null || echo 0
  fi
}

# ── Helper: guess likely cause of a misroute ──
guess_misroute_cause() {
  local slug="$1"
  local expected_ws="$2"
  local actual_ws="$3"
  local actual_stage="$4"

  # Same workspace, wrong stage — instruction ordering issue
  if [ "$expected_ws" = "$actual_ws" ]; then
    echo "Correct workspace but wrong entry stage — check stage transition logic in ${actual_ws}/CLAUDE.md"
    return
  fi

  # Slack-originated jobs landing in wrong workspace
  if [[ "$slug" == check-slack-* ]] || [[ "$slug" == dm-reply* ]] || [[ "$slug" == *-reply ]]; then
    echo "Slack-triggered job routed to ${actual_ws} instead of ${expected_ws} — message content may have misled workspace selection"
    return
  fi

  # GitHub jobs crossing wires
  if [[ "$slug" == respond-github-* ]] || [[ "$slug" == review-pr-* ]]; then
    echo "GitHub-triggered job misrouted — check if prompt contains competing workspace keywords"
    return
  fi

  # Generic
  echo "Agent read ${actual_ws}/${actual_stage}/CONTEXT.md instead of ${expected_ws}/ — review workspace CLAUDE.md routing instructions"
}

# ── Collect data from archived directories ──
# Arrays for tallying (associative arrays via temp files, for bash 3 compat)
STATS_DIR=$(mktemp -d)
trap "rm -rf $STATS_DIR" EXIT

# Track all unique slugs seen
SLUGS_FILE="$STATS_DIR/slugs.txt"
touch "$SLUGS_FILE"

# Per-slug counters: correct, misrouted, no_route
# Per-slug misroute details
MISROUTES_FILE="$STATS_DIR/misroutes.txt"
touch "$MISROUTES_FILE"

# All agents file (for --verbose)
ALL_AGENTS_FILE="$STATS_DIR/all_agents.txt"
touch "$ALL_AGENTS_FILE"

TOTAL_AGENTS=0
TOTAL_CORRECT=0
TOTAL_MISROUTED=0
TOTAL_NO_ROUTE=0
TOTAL_UNKNOWN_SLUG=0

for AGENT_DIR in "$ARCHIVED_DIR"/agent-*; do
  [ -d "$AGENT_DIR" ] || continue

  META_FILE="$AGENT_DIR/meta.json"
  ROUTE_FILE="$AGENT_DIR/route.json"

  # Must have meta.json
  [ -f "$META_FILE" ] || continue

  # Read meta
  SLUG=$(jq -r '.commandSlug // empty' "$META_FILE" 2>/dev/null)
  STARTED_AT=$(jq -r '.startedAt // empty' "$META_FILE" 2>/dev/null)
  AGENT_PID=$(jq -r '.pid // empty' "$META_FILE" 2>/dev/null)
  AGENT_NAME=$(basename "$AGENT_DIR")

  [ -n "$SLUG" ] || continue

  # Apply --days filter
  if [ -n "$DAYS" ] && [ -n "$STARTED_AT" ]; then
    AGENT_EPOCH=$(iso_to_epoch "$STARTED_AT")
    if [ "$AGENT_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
      continue
    fi
  fi

  # Look up expected route
  EXPECTED=$(lookup_expected_route "$SLUG")
  EXPECTED_WS=""
  EXPECTED_STAGE=""
  if [ -n "$EXPECTED" ]; then
    EXPECTED_WS=$(echo "$EXPECTED" | awk '{print $1}')
    EXPECTED_STAGE=$(echo "$EXPECTED" | awk '{print $2}')
  fi

  # Apply --workspace filter
  if [ -n "$WORKSPACE_FILTER" ]; then
    if [ "$EXPECTED_WS" != "$WORKSPACE_FILTER" ]; then
      continue
    fi
  fi

  # Read actual route
  ACTUAL_WS=""
  ACTUAL_STAGE=""
  if [ -f "$ROUTE_FILE" ]; then
    ACTUAL_WS=$(jq -r '.workspace // empty' "$ROUTE_FILE" 2>/dev/null)
    ACTUAL_STAGE=$(jq -r '.stage // empty' "$ROUTE_FILE" 2>/dev/null)
  fi

  TOTAL_AGENTS=$((TOTAL_AGENTS + 1))

  # Record slug
  echo "$SLUG" >> "$SLUGS_FILE"

  # Classify
  STATUS=""
  if [ -z "$EXPECTED_WS" ]; then
    # Unknown command slug — no expected route defined
    TOTAL_UNKNOWN_SLUG=$((TOTAL_UNKNOWN_SLUG + 1))
    STATUS="unknown_slug"
    # Increment unknown counter for this slug
    COUNTER_FILE="$STATS_DIR/unknown_$(echo "$SLUG" | tr '/*' '__')"
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    echo $((COUNT + 1)) > "$COUNTER_FILE"
  elif [ -z "$ACTUAL_WS" ]; then
    # Agent never read a CONTEXT.md (no route detected)
    TOTAL_NO_ROUTE=$((TOTAL_NO_ROUTE + 1))
    STATUS="no_route"
    COUNTER_FILE="$STATS_DIR/noroute_$(echo "$SLUG" | tr '/*' '__')"
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    echo $((COUNT + 1)) > "$COUNTER_FILE"
  elif [ "$ACTUAL_WS" = "$EXPECTED_WS" ]; then
    # Correct workspace (we check workspace match, stage is informational)
    TOTAL_CORRECT=$((TOTAL_CORRECT + 1))
    STATUS="correct"
    COUNTER_FILE="$STATS_DIR/correct_$(echo "$SLUG" | tr '/*' '__')"
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    echo $((COUNT + 1)) > "$COUNTER_FILE"
  else
    # Misrouted — wrong workspace
    TOTAL_MISROUTED=$((TOTAL_MISROUTED + 1))
    STATUS="misrouted"
    COUNTER_FILE="$STATS_DIR/misrouted_$(echo "$SLUG" | tr '/*' '__')"
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    echo $((COUNT + 1)) > "$COUNTER_FILE"

    # Record misroute detail
    CAUSE=$(guess_misroute_cause "$SLUG" "$EXPECTED_WS" "$ACTUAL_WS" "$ACTUAL_STAGE")
    echo "${AGENT_NAME}|${SLUG}|${EXPECTED_WS}/${EXPECTED_STAGE}|${ACTUAL_WS}/${ACTUAL_STAGE}|${CAUSE}" >> "$MISROUTES_FILE"
  fi

  # Record for --verbose
  echo "${AGENT_NAME}|${SLUG}|${EXPECTED_WS:-?}/${EXPECTED_STAGE:-?}|${ACTUAL_WS:--}/${ACTUAL_STAGE:--}|${STATUS}|${STARTED_AT:-?}" >> "$ALL_AGENTS_FILE"
done

# ── No data? ──
if [ "$TOTAL_AGENTS" -eq 0 ]; then
  echo "No archived agent directories found${DAYS:+ in the last $DAYS day(s)}${WORKSPACE_FILTER:+ for workspace '$WORKSPACE_FILTER'}."
  echo ""
  echo "Agents are archived in: $ARCHIVED_DIR"
  echo "Run some bot agents first, then re-run this audit."
  exit 0
fi

# ── Get unique slugs sorted ──
UNIQUE_SLUGS=$(sort -u "$SLUGS_FILE")

# ── JSON output mode ──
if $JSON_OUTPUT; then
  # Build JSON report
  SLUG_ARRAY="[]"
  while IFS= read -r SLUG; do
    [ -n "$SLUG" ] || continue
    SAFE_SLUG=$(echo "$SLUG" | tr '/*' '__')

    CORRECT=$(cat "$STATS_DIR/correct_${SAFE_SLUG}" 2>/dev/null || echo 0)
    MISROUTED=$(cat "$STATS_DIR/misrouted_${SAFE_SLUG}" 2>/dev/null || echo 0)
    NO_ROUTE=$(cat "$STATS_DIR/noroute_${SAFE_SLUG}" 2>/dev/null || echo 0)
    UNKNOWN=$(cat "$STATS_DIR/unknown_${SAFE_SLUG}" 2>/dev/null || echo 0)
    TOTAL=$((CORRECT + MISROUTED + NO_ROUTE + UNKNOWN))

    EXPECTED=$(lookup_expected_route "$SLUG")
    EXP_WS=$(echo "$EXPECTED" | awk '{print $1}')

    if [ "$TOTAL" -gt 0 ] && [ "$UNKNOWN" -eq 0 ]; then
      ACCURACY=$(( (CORRECT * 100) / (CORRECT + MISROUTED + NO_ROUTE) ))
    else
      ACCURACY=-1
    fi

    SLUG_ARRAY=$(echo "$SLUG_ARRAY" | jq \
      --arg slug "$SLUG" \
      --arg ws "${EXP_WS:-unknown}" \
      --argjson correct "$CORRECT" \
      --argjson misrouted "$MISROUTED" \
      --argjson noRoute "$NO_ROUTE" \
      --argjson unknown "$UNKNOWN" \
      --argjson accuracy "$ACCURACY" \
      '. + [{commandSlug: $slug, expectedWorkspace: $ws, correct: $correct, misrouted: $misrouted, noRoute: $noRoute, unknownSlug: $unknown, accuracy: $accuracy}]')
  done <<< "$UNIQUE_SLUGS"

  # Build misroutes array
  MISROUTE_ARRAY="[]"
  while IFS='|' read -r AGENT SLUG EXPECTED ACTUAL CAUSE; do
    [ -n "$AGENT" ] || continue
    MISROUTE_ARRAY=$(echo "$MISROUTE_ARRAY" | jq \
      --arg agent "$AGENT" \
      --arg slug "$SLUG" \
      --arg expected "$EXPECTED" \
      --arg actual "$ACTUAL" \
      --arg cause "$CAUSE" \
      '. + [{agent: $agent, commandSlug: $slug, expected: $expected, actual: $actual, likelyCause: $cause}]')
  done < "$MISROUTES_FILE"

  jq -n \
    --argjson total "$TOTAL_AGENTS" \
    --argjson correct "$TOTAL_CORRECT" \
    --argjson misrouted "$TOTAL_MISROUTED" \
    --argjson noRoute "$TOTAL_NO_ROUTE" \
    --argjson unknownSlug "$TOTAL_UNKNOWN_SLUG" \
    --arg days "${DAYS:-all}" \
    --arg workspace "${WORKSPACE_FILTER:-all}" \
    --argjson slugs "$SLUG_ARRAY" \
    --argjson misroutes "$MISROUTE_ARRAY" \
    '{
      summary: {
        period: (if $days == "all" then "all time" else ($days + " days") end),
        workspaceFilter: $workspace,
        totalAgents: $total,
        correct: $correct,
        misrouted: $misrouted,
        noRoute: $noRoute,
        unknownSlug: $unknownSlug,
        accuracy: (if ($correct + $misrouted + $noRoute) > 0 then (($correct * 100) / ($correct + $misrouted + $noRoute)) else null end)
      },
      byCommandSlug: $slugs,
      misroutes: $misroutes
    }'
  exit 0
fi

# ── Human-readable output ──
PERIOD_LABEL="all time"
[ -n "$DAYS" ] && PERIOD_LABEL="last $DAYS day(s)"

echo ""
echo "Routing Accuracy Report ($PERIOD_LABEL)"
[ -n "$WORKSPACE_FILTER" ] && echo "  Filtered to workspace: $WORKSPACE_FILTER"
echo "======================================="
echo ""

# Table header
printf "%-28s %-20s %8s %10s %10s %10s\n" "Job Type" "Expected Workspace" "Correct" "Misrouted" "No Route" "Accuracy"
printf "%-28s %-20s %8s %10s %10s %10s\n" "----------------------------" "--------------------" "--------" "----------" "----------" "----------"

while IFS= read -r SLUG; do
  [ -n "$SLUG" ] || continue
  SAFE_SLUG=$(echo "$SLUG" | tr '/*' '__')

  CORRECT=$(cat "$STATS_DIR/correct_${SAFE_SLUG}" 2>/dev/null || echo 0)
  MISROUTED=$(cat "$STATS_DIR/misrouted_${SAFE_SLUG}" 2>/dev/null || echo 0)
  NO_ROUTE=$(cat "$STATS_DIR/noroute_${SAFE_SLUG}" 2>/dev/null || echo 0)
  UNKNOWN=$(cat "$STATS_DIR/unknown_${SAFE_SLUG}" 2>/dev/null || echo 0)

  EXPECTED=$(lookup_expected_route "$SLUG")
  EXP_WS=$(echo "$EXPECTED" | awk '{print $1}')
  [ -z "$EXP_WS" ] && EXP_WS="(unmapped)"

  DENOMINATOR=$((CORRECT + MISROUTED + NO_ROUTE))
  if [ "$DENOMINATOR" -gt 0 ]; then
    ACCURACY="$((CORRECT * 100 / DENOMINATOR))%"
  elif [ "$UNKNOWN" -gt 0 ]; then
    ACCURACY="N/A"
  else
    ACCURACY="-"
  fi

  # Truncate long slugs
  DISPLAY_SLUG="$SLUG"
  if [ ${#DISPLAY_SLUG} -gt 28 ]; then
    DISPLAY_SLUG="${DISPLAY_SLUG:0:25}..."
  fi

  printf "%-28s %-20s %8d %10d %10d %10s\n" "$DISPLAY_SLUG" "$EXP_WS" "$CORRECT" "$MISROUTED" "$NO_ROUTE" "$ACCURACY"
done <<< "$UNIQUE_SLUGS"

# Summary line
echo ""
TOTAL_DENOMINATOR=$((TOTAL_CORRECT + TOTAL_MISROUTED + TOTAL_NO_ROUTE))
if [ "$TOTAL_DENOMINATOR" -gt 0 ]; then
  OVERALL_ACCURACY=$((TOTAL_CORRECT * 100 / TOTAL_DENOMINATOR))
  echo "Overall: $TOTAL_AGENTS agents, $TOTAL_CORRECT correct, $TOTAL_MISROUTED misrouted, $TOTAL_NO_ROUTE no route ($OVERALL_ACCURACY% accuracy)"
else
  echo "Overall: $TOTAL_AGENTS agents (no routing data available)"
fi
[ "$TOTAL_UNKNOWN_SLUG" -gt 0 ] && echo "  ($TOTAL_UNKNOWN_SLUG agent(s) had command slugs with no expected route defined)"

# ── Misroutes detail ──
MISROUTE_COUNT=$(wc -l < "$MISROUTES_FILE" | tr -d ' ')
if [ "$MISROUTE_COUNT" -gt 0 ]; then
  echo ""
  echo "MISROUTES:"
  while IFS='|' read -r AGENT SLUG EXPECTED ACTUAL CAUSE; do
    [ -n "$AGENT" ] || continue
    echo "  $AGENT: $SLUG -> $ACTUAL (expected $EXPECTED)"
    echo "    Likely cause: $CAUSE"
  done < "$MISROUTES_FILE"
fi

# ── No-route agents ──
NO_ROUTE_AGENTS=$(grep '|no_route|' "$ALL_AGENTS_FILE" 2>/dev/null || true)
if [ -n "$NO_ROUTE_AGENTS" ] && $VERBOSE; then
  echo ""
  echo "NO-ROUTE AGENTS (never read a CONTEXT.md):"
  while IFS='|' read -r AGENT SLUG EXPECTED ACTUAL STATUS STARTED; do
    echo "  $AGENT: $SLUG (expected $EXPECTED) started $STARTED"
  done <<< "$NO_ROUTE_AGENTS"
fi

# ── Unknown slugs ──
UNKNOWN_AGENTS=$(grep '|unknown_slug|' "$ALL_AGENTS_FILE" 2>/dev/null || true)
if [ -n "$UNKNOWN_AGENTS" ] && $VERBOSE; then
  echo ""
  echo "UNKNOWN SLUGS (no expected route defined — add to expected-routes.json):"
  while IFS='|' read -r AGENT SLUG EXPECTED ACTUAL STATUS STARTED; do
    echo "  $AGENT: $SLUG"
  done <<< "$UNKNOWN_AGENTS"
fi

# ── Verbose: all agents ──
if $VERBOSE; then
  echo ""
  echo "ALL AGENTS:"
  printf "  %-35s %-28s %-25s %-25s %s\n" "Agent" "Command" "Expected" "Actual" "Status"
  printf "  %-35s %-28s %-25s %-25s %s\n" "---" "---" "---" "---" "---"
  while IFS='|' read -r AGENT SLUG EXPECTED ACTUAL STATUS STARTED; do
    [ -n "$AGENT" ] || continue
    printf "  %-35s %-28s %-25s %-25s %s\n" "$AGENT" "$SLUG" "$EXPECTED" "$ACTUAL" "$STATUS"
  done < "$ALL_AGENTS_FILE"
fi

echo ""
