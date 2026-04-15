#!/bin/bash
# github-state-scanner.sh — Long-lived daemon that maintains a unified
# GitHub state file for the entire slam-bot.
#
# Why
# ---
# Before this script existed, every workspace and cron in the slam-bot
# made its own independent `gh pr view --json X,Y,Z` and `gh issue list
# --json A,B,C` calls. With ~17 workspaces and 8-12 overlapping processes
# per hour, the same PR's metadata was being fetched 3-5 times per minute,
# burning through GitHub's 5000-point/hour GraphQL ceiling and pausing the
# dispatcher every hour around :35-:40 past the hour.
#
# This daemon is the system-level fix proposed in
#   .planning/bot-github-api-budget-reduction-plan.md
# It runs as a long-lived `while true; sleep 60` loop (NOT cron — cron has
# no overlap protection if a tick takes >60s) and:
#
#   1. Issues ONE consolidated GraphQL query per tick that fetches every
#      open PR's metadata + every open issue's metadata in a single query
#      with aliased top-level fields. The query intentionally omits `body`
#      for both PRs and issues (largest GraphQL node cost; only review
#      sessions need bodies and they fetch on demand).
#
#   2. Writes the result atomically to /opt/slam-bot/state/github-state.json
#      using a tmp-file-and-rename pattern. Schema documented in
#      lib/github-state.sh.
#
#   3. Drains the refresh-queue every 5 seconds during the sleep window.
#      Any process can drop a file like `pr-1666.refresh` or
#      `issue-1600.refresh` into the queue to force a synchronous re-fetch
#      of that one entry. Used by pre-merge checks for the
#      `mergeable`/`mergeStateStatus` async-staleness trap.
#
#   4. Logs each tick's GraphQL cost (`rateLimit { cost remaining }`) so we
#      can see exactly how much budget the scanner consumes per tick. Logs
#      to $BOT_LOG_DIR/github-state-scanner.log.
#
# Modes
# -----
#   github-state-scanner.sh                    # daemon mode (default)
#   github-state-scanner.sh --once             # single tick, then exit
#   github-state-scanner.sh --print-query      # print the GraphQL query and exit
#   github-state-scanner.sh --refresh-pr <N>   # write a refresh trigger and exit
#
# Phase
# -----
# This is Phase 1 of the budget-reduction plan. Phases 2-6 migrate
# individual workspaces to read from the state file via lib/github-state.sh
# instead of making their own `gh` calls.
#
# shellcheck shell=bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"
# shellcheck source=lib/github-state.sh
source "$SCRIPT_DIR/lib/github-state.sh"

# ── Config ───────────────────────────────────────────────────────────────
SCANNER_LOG_FILE="${SCANNER_LOG_FILE:-${BOT_LOG_DIR}/github-state-scanner.log}"
SCANNER_TICK_SECS="${SCANNER_TICK_SECS:-60}"
SCANNER_DRAIN_INTERVAL_SECS="${SCANNER_DRAIN_INTERVAL_SECS:-5}"

# Pagination guards. We have ~20 open PRs and ~50-100 open issues today.
# 100 covers us comfortably; if we ever exceed it, the scanner will log a
# warning and we'll add a paginated loop. Leave the cap conservative — bigger
# pages are more expensive per query.
SCANNER_MAX_PRS="${SCANNER_MAX_PRS:-100}"
SCANNER_MAX_ISSUES="${SCANNER_MAX_ISSUES:-100}"

GITHUB_OWNER="${GITHUB_OWNER:-${GITHUB_REPO%%/*}}"
GITHUB_REPO_NAME="${GITHUB_REPO_NAME:-${GITHUB_REPO##*/}}"

# ── Logging ──────────────────────────────────────────────────────────────
mkdir -p "$BOT_STATE_DIR" "$GITHUB_STATE_REFRESH_QUEUE_DIR" 2>/dev/null || true

# Log to stdout only. The systemd unit captures stdout/stderr to
# /var/log/slam-bot/github-state-scanner.log via StandardOutput=append:.
# Previously this used `printf | tee -a "$SCANNER_LOG_FILE"`, which raced
# with systemd's append: handler — both ended up writing to the same file
# and one of them lost on the file ownership check (the file gets created
# with whatever user installed the unit, not necessarily the daemon's
# User=ubuntu). The result was every log line preceded by `tee:
# /var/log/slam-bot/github-state-scanner.log: Permission denied` noise.
# Removing the in-script tee fixes the noise without losing any output.
log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# ── GraphQL query ────────────────────────────────────────────────────────
# Single query, aliased top-level fields, no `body`. The expert review
# (2026-04-11) called out aliases as the way to amortize GraphQL query
# overhead across multiple top-level field reads.
#
# Notes:
#   - We fetch labels(first: 20) — a hard cap, since labels are an unbounded
#     collection in principle. 20 covers all of our bot:* + status labels.
#   - statusCheckRollup is the LAST commit's check rollup, which is what
#     callers actually want ("does this PR's tip have green CI?").
#   - rateLimit { cost remaining limit resetAt } gives us per-query cost
#     reporting. We log this so we can verify the scanner is staying under
#     ~60 points per tick.
build_query() {
  cat <<GRAPHQL
query ConsolidatedState(\$owner: String!, \$repo: String!, \$prLimit: Int!, \$issueLimit: Int!) {
  repository(owner: \$owner, name: \$repo) {
    openPRs: pullRequests(first: \$prLimit, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number
        title
        baseRefName
        headRefName
        isDraft
        mergeable
        mergeStateStatus
        reviewDecision
        updatedAt
        author { login }
        closingIssuesReferences(first: 10) {
          nodes { number }
        }
        labels(first: 20) {
          nodes { name }
        }
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                state
                contexts(first: 20) {
                  nodes {
                    __typename
                    ... on CheckRun     { name conclusion }
                    ... on StatusContext { context state }
                  }
                }
              }
            }
          }
        }
        latestReviews(first: 10) {
          nodes {
            author { login }
            commit { oid }
          }
        }
      }
    }
    openIssues: issues(first: \$issueLimit, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number
        title
        state
        updatedAt
        author { login }
        labels(first: 20) {
          nodes { name }
        }
        assignees(first: 5) {
          nodes { login }
        }
      }
    }
  }
  rateLimit {
    cost
    remaining
    limit
    resetAt
  }
}
GRAPHQL
}

# ── State file write (consolidated tick) ─────────────────────────────────
# Atomically replace $GITHUB_STATE_FILE with the result of one consolidated
# query. Returns 0 on success, non-zero on failure (e.g., gh error, jq
# parse error). Failures DO NOT touch the existing state file — readers
# keep seeing the previous tick until the next successful one.
write_consolidated_state() {
  local run_id tmp raw query
  run_id="github-state-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  tmp="${GITHUB_STATE_FILE}.tmp.$$"
  query=$(build_query)

  raw=$(
    gh api graphql \
      -F owner="$GITHUB_OWNER" \
      -F repo="$GITHUB_REPO_NAME" \
      -F prLimit="$SCANNER_MAX_PRS" \
      -F issueLimit="$SCANNER_MAX_ISSUES" \
      -f query="$query" 2>&1
  )
  local rc=$?
  if [ $rc -ne 0 ]; then
    log "ERROR: gh api graphql failed (rc=$rc): $raw"
    return 1
  fi

  # Sanity check: must have a `data` envelope.
  local has_data
  has_data=$(echo "$raw" | jq -r 'has("data")' 2>/dev/null || echo "false")
  if [ "$has_data" != "true" ]; then
    log "ERROR: gh api graphql returned no data envelope: $(echo "$raw" | head -c 200)"
    return 1
  fi

  # Build the canonical state file shape.
  echo "$raw" | jq \
    --arg run_id "$run_id" \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg source "github-state-scanner.sh" \
    '
    {
      schema_version: 1,
      run_id:         $run_id,
      generated_at:   $generated_at,
      source:         $source,
      scanner_cost: {
        graphql_points:    (.data.rateLimit.cost     // null),
        graphql_remaining: (.data.rateLimit.remaining // null),
        graphql_limit:     (.data.rateLimit.limit     // null),
        graphql_reset_at:  (.data.rateLimit.resetAt   // null)
      },
      counts: {
        open_prs:    ((.data.repository.openPRs.totalCount)    // 0),
        open_issues: ((.data.repository.openIssues.totalCount) // 0)
      },
      prs: (
        ((.data.repository.openPRs.nodes // []) |
          map({
            number:           .number,
            title:            .title,
            baseRefName:      .baseRefName,
            headRefName:      .headRefName,
            author_login:     (.author.login // null),
            isDraft:          (.isDraft      // false),
            mergeable:        (.mergeable    // null),
            mergeStateStatus: (.mergeStateStatus // null),
            reviewDecision:   (.reviewDecision   // null),
            closing_issues:   ([(.closingIssuesReferences.nodes // [])[] | .number]),
            labels:           ([(.labels.nodes // [])[] | .name]),
            statusCheckRollup: (
              ((.commits.nodes // []) | last // {}).commit.statusCheckRollup // null
              | if . == null then []
                else
                  ((.contexts.nodes // []) | map({
                    name:  (.name // .context // "unknown"),
                    state: (.conclusion // .state // null)
                  }))
                end
            ),
            head_sha: (
              ((.commits.nodes // []) | last // {}).commit.oid // null
            ),
            last_bot_review_sha: (
              [(.latestReviews.nodes // [])[] | select(.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]")] | last | .commit.oid // null
            ),
            updatedAt: (.updatedAt // null)
          }) |
          (map({ (.number | tostring): . }) | add // {})
        )
      ),
      issues: (
        ((.data.repository.openIssues.nodes // []) |
          map({
            number:       .number,
            title:        .title,
            state:        .state,
            author_login: (.author.login // null),
            labels:       ([(.labels.nodes // [])[] | .name]),
            assignees:    ([(.assignees.nodes // [])[] | .login]),
            updatedAt:    (.updatedAt // null)
          }) |
          (map({ (.number | tostring): . }) | add // {})
        )
      )
    }
    ' > "$tmp" || {
      log "ERROR: jq transform failed; raw response head: $(echo "$raw" | head -c 200)"
      rm -f "$tmp"
      return 1
    }

  # Atomic rename.
  mv "$tmp" "$GITHUB_STATE_FILE"

  # Log per-tick cost so we can spot regressions.
  local cost remaining open_prs open_issues
  cost=$(jq -r '.scanner_cost.graphql_points    // "?"' "$GITHUB_STATE_FILE")
  remaining=$(jq -r '.scanner_cost.graphql_remaining // "?"' "$GITHUB_STATE_FILE")
  open_prs=$(jq -r '.counts.open_prs            // "?"' "$GITHUB_STATE_FILE")
  open_issues=$(jq -r '.counts.open_issues      // "?"' "$GITHUB_STATE_FILE")
  log "tick: cost=${cost} remaining=${remaining} open_prs=${open_prs} open_issues=${open_issues} run_id=${run_id}"

  # Pagination warning.
  if [ "$open_prs" != "?" ] && [ "$open_prs" -ge "$SCANNER_MAX_PRS" ]; then
    log "WARNING: open_prs=$open_prs reached SCANNER_MAX_PRS=$SCANNER_MAX_PRS — pagination needed"
  fi
  if [ "$open_issues" != "?" ] && [ "$open_issues" -ge "$SCANNER_MAX_ISSUES" ]; then
    log "WARNING: open_issues=$open_issues reached SCANNER_MAX_ISSUES=$SCANNER_MAX_ISSUES — pagination needed"
  fi

  return 0
}

# ── Refresh-queue draining ───────────────────────────────────────────────
# Process any pending refresh requests. Each request is a file in
# $GITHUB_STATE_REFRESH_QUEUE_DIR with the form `pr-<N>.refresh` or
# `issue-<N>.refresh`. For each one, fetch ONLY that PR/issue's fields and
# patch its entry in the state file in place. The file is removed after
# processing (success or failure — we don't want to retry forever on a
# permanently-failing entry).
#
# This is the "force refresh" path that callers use for the
# mergeable/mergeStateStatus async-staleness trap. Cost per refresh is
# small (~5-10 GraphQL points for a single PR), so processing N requests
# in a tick costs ~10N points.
drain_refresh_queue() {
  local entry kind n
  shopt -s nullglob
  for entry in "$GITHUB_STATE_REFRESH_QUEUE_DIR"/*.refresh; do
    local fname
    fname=$(basename "$entry")
    case "$fname" in
      pr-*.refresh)
        kind=pr
        n="${fname#pr-}"
        n="${n%.refresh}"
        ;;
      issue-*.refresh)
        kind=issue
        n="${fname#issue-}"
        n="${n%.refresh}"
        ;;
      *)
        log "drain: unknown refresh-queue entry $fname — removing"
        rm -f "$entry"
        continue
        ;;
    esac

    if ! [[ "$n" =~ ^[0-9]+$ ]]; then
      log "drain: invalid number in $fname — removing"
      rm -f "$entry"
      continue
    fi

    refresh_one "$kind" "$n" || log "drain: refresh of $kind #$n failed (will not retry)"
    rm -f "$entry"
  done
  shopt -u nullglob
}

# refresh_one KIND NUMBER — fetch one PR or issue and patch its entry in
# the state file. KIND is "pr" or "issue".
refresh_one() {
  local kind="$1" n="$2"
  local raw key updated_jq
  if [ "$kind" = "pr" ]; then
    raw=$(
      gh api graphql \
        -F owner="$GITHUB_OWNER" -F repo="$GITHUB_REPO_NAME" -F number="$n" \
        -f query='
        query OnePR($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              number title baseRefName headRefName isDraft
              mergeable mergeStateStatus reviewDecision updatedAt
              author { login }
              closingIssuesReferences(first: 10) { nodes { number } }
              labels(first: 20) { nodes { name } }
              commits(last: 1) {
                nodes { commit {
                  oid
                  statusCheckRollup {
                    state
                    contexts(first: 20) {
                      nodes {
                        __typename
                        ... on CheckRun     { name conclusion }
                        ... on StatusContext { context state }
                      }
                    }
                  }
                } }
              }
              latestReviews(first: 10) {
                nodes {
                  author { login }
                  commit { oid }
                }
              }
            }
          }
          rateLimit { cost remaining }
        }' 2>&1
    ) || { log "refresh: gh api graphql failed for PR #$n"; return 1; }
    key="prs"
    updated_jq='
      .data.repository.pullRequest |
      {
        number:           .number,
        title:            .title,
        baseRefName:      .baseRefName,
        headRefName:      .headRefName,
        author_login:     (.author.login // null),
        isDraft:          (.isDraft      // false),
        mergeable:        (.mergeable    // null),
        mergeStateStatus: (.mergeStateStatus // null),
        reviewDecision:   (.reviewDecision   // null),
        closing_issues:   ([(.closingIssuesReferences.nodes // [])[] | .number]),
        labels:           ([(.labels.nodes // [])[] | .name]),
        statusCheckRollup: (
          ((.commits.nodes // []) | last // {}).commit.statusCheckRollup // null
          | if . == null then []
            else ((.contexts.nodes // []) | map({
              name:  (.name // .context // "unknown"),
              state: (.conclusion // .state // null)
            }))
            end
        ),
        head_sha: (((.commits.nodes // []) | last // {}).commit.oid // null),
        last_bot_review_sha: (
          [(.latestReviews.nodes // [])[] | select(.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]")] | last | .commit.oid // null
        ),
        updatedAt: (.updatedAt // null)
      }
    '
  else
    raw=$(
      gh api graphql \
        -F owner="$GITHUB_OWNER" -F repo="$GITHUB_REPO_NAME" -F number="$n" \
        -f query='
        query OneIssue($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              number title state updatedAt
              author { login }
              labels(first: 20) { nodes { name } }
              assignees(first: 5) { nodes { login } }
            }
          }
          rateLimit { cost remaining }
        }' 2>&1
    ) || { log "refresh: gh api graphql failed for issue #$n"; return 1; }
    key="issues"
    updated_jq='
      .data.repository.issue |
      {
        number:       .number,
        title:        .title,
        state:        .state,
        author_login: (.author.login // null),
        labels:       ([(.labels.nodes // [])[] | .name]),
        assignees:    ([(.assignees.nodes // [])[] | .login]),
        updatedAt:    (.updatedAt // null)
      }
    '
  fi

  # Build the new entry, then merge it into the existing state file in
  # place. Bump generated_at so callers polling for the refresh see it.
  local entry
  entry=$(echo "$raw" | jq -c "$updated_jq" 2>/dev/null) || {
    log "refresh: jq transform failed for $kind #$n"
    return 1
  }
  if [ -z "$entry" ] || [ "$entry" = "null" ]; then
    log "refresh: $kind #$n returned null (closed/missing?) — clearing entry"
    local tmp="${GITHUB_STATE_FILE}.tmp.$$"
    jq --arg key "$key" --arg n "$n" \
       --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       'del(.[$key][$n]) | .generated_at = $generated_at' \
       "$GITHUB_STATE_FILE" > "$tmp" && mv "$tmp" "$GITHUB_STATE_FILE"
    return 0
  fi

  local tmp="${GITHUB_STATE_FILE}.tmp.$$"
  jq --arg key "$key" --arg n "$n" \
     --argjson entry "$entry" \
     --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '.[$key][$n] = $entry | .generated_at = $generated_at' \
     "$GITHUB_STATE_FILE" > "$tmp" && mv "$tmp" "$GITHUB_STATE_FILE"

  local cost
  cost=$(echo "$raw" | jq -r '.data.rateLimit.cost // "?"')
  log "refresh: $kind #$n updated (cost=${cost})"
  return 0
}

# ── Main loop ────────────────────────────────────────────────────────────
run_one_tick() {
  if ! write_consolidated_state; then
    log "tick: consolidated scan failed — keeping previous state file (if any)"
    return 1
  fi
}

run_daemon() {
  log "starting github-state-scanner daemon (tick=${SCANNER_TICK_SECS}s drain=${SCANNER_DRAIN_INTERVAL_SECS}s)"
  log "state file: $GITHUB_STATE_FILE"
  log "refresh queue: $GITHUB_STATE_REFRESH_QUEUE_DIR"

  # Trap SIGTERM so systemd's `systemctl stop` exits cleanly.
  trap 'log "received SIGTERM — exiting"; exit 0' TERM INT

  while true; do
    drain_refresh_queue
    run_one_tick

    # Split the tick interval into drain-interval slices so refresh
    # requests are picked up within ~5 seconds even though the consolidated
    # query only runs once per minute.
    local slices=$(( SCANNER_TICK_SECS / SCANNER_DRAIN_INTERVAL_SECS ))
    [ "$slices" -lt 1 ] && slices=1
    local i
    for i in $(seq 1 "$slices"); do
      sleep "$SCANNER_DRAIN_INTERVAL_SECS"
      drain_refresh_queue
    done
  done
}

# ── Entrypoint ───────────────────────────────────────────────────────────
case "${1:-}" in
  --once)
    run_one_tick
    ;;
  --print-query)
    build_query
    ;;
  --refresh-pr)
    n="${2:?usage: --refresh-pr <PR_NUMBER>}"
    mkdir -p "$GITHUB_STATE_REFRESH_QUEUE_DIR"
    : > "${GITHUB_STATE_REFRESH_QUEUE_DIR}/pr-${n}.refresh"
    echo "Wrote refresh trigger for PR #${n}"
    ;;
  --refresh-issue)
    n="${2:?usage: --refresh-issue <ISSUE_NUMBER>}"
    mkdir -p "$GITHUB_STATE_REFRESH_QUEUE_DIR"
    : > "${GITHUB_STATE_REFRESH_QUEUE_DIR}/issue-${n}.refresh"
    echo "Wrote refresh trigger for issue #${n}"
    ;;
  -h|--help)
    sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  "")
    run_daemon
    ;;
  *)
    echo "unknown option: $1" >&2
    echo "see $0 --help" >&2
    exit 2
    ;;
esac
