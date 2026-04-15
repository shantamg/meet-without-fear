#!/bin/bash
# github-state.sh — Shared helpers for the bot-wide GitHub state file.
#
# Background
# ----------
# This is the system-level generalization of pr-reviewer-state.sh (#1659).
# The slam-bot was burning through GitHub's 5000-point/hour GraphQL budget
# because every script and workspace made its own `gh pr view --json` and
# `gh issue list --json` calls with no shared state. The fix is to have
# ONE process — `github-state-scanner.sh`, run as a long-lived daemon —
# fetch all currently-relevant PR and issue metadata once per minute, write
# it to a single state file, and have everything else read from that file.
#
# This library is the read-side of that contract. Sourcing it gives you
# a small set of helpers that look up PR/issue state by number from the
# scanner-generated state file. NONE of these helpers make `gh` calls.
#
# Schema (version 1):
#   {
#     "schema_version": 1,
#     "run_id":         "github-state-20260411T062315Z",
#     "generated_at":   "2026-04-11T06:23:15Z",
#     "source":         "github-state-scanner.sh",
#     "scanner_cost": {
#       "graphql_points":      42,
#       "graphql_remaining":   4915,
#       "graphql_reset_at":    "2026-04-11T07:15:00Z"
#     },
#     "prs": {
#       "1639": {
#         "number":            1639,
#         "title":             "feat(workbench): freeze header rows",
#         "baseRefName":       "main",
#         "headRefName":       "feature/sticky-headers",
#         "author_login":      "MwfBot",
#         "isDraft":           false,
#         "mergeable":         "MERGEABLE" | "CONFLICTING" | "UNKNOWN",
#         "mergeStateStatus":  "CLEAN" | "BLOCKED" | ...,
#         "reviewDecision":    "APPROVED" | "REVIEW_REQUIRED" | null,
#         "closing_issues":    [1600, 1639],
#         "labels":            ["bot:needs-review", "bot:review-impl"],
#         "statusCheckRollup": [{"name": "CI Result", "state": "SUCCESS"}],
#         "head_sha":          "abc123...",
#         "last_bot_review_sha": "def456..." | null,
#         "updatedAt":         "2026-04-10T16:40:44Z"
#       }
#     },
#     "issues": {
#       "1600": {
#         "number":     1600,
#         "title":      "feat: Slack thread follow-up tracker",
#         "state":      "OPEN",
#         "labels":     ["enhancement", "bot:expert-review"],
#         "assignees":  [],
#         "updatedAt":  "2026-04-11T02:29:35Z"
#       }
#     }
#   }
#
# PRs and issues are keyed by number (as strings) for O(1) jq lookups:
#   jq --arg n 1639 '.prs[$n]' "$GITHUB_STATE_FILE"
#
# Force-refresh path
# ------------------
# Most reads tolerate the 60-second freshness window happily. The dangerous
# case is `mergeable` and `mergeStateStatus`, which GitHub computes
# asynchronously after a push — a cached entry could say "CLEAN" while the
# real state has flipped to "BLOCKED". For those critical reads (e.g., the
# pre-merge check in pr-reviewer/05-merge-or-tag), callers should use
# `github_state_refresh_pr <N>` to force a synchronous re-fetch. The helper
# drops a trigger file in $GITHUB_STATE_REFRESH_QUEUE_DIR; the scanner
# daemon picks it up within ~5 seconds, re-queries that one PR, updates its
# entry, and bumps generated_at. The helper polls for the update and
# returns when the refresh is visible.
#
# If the daemon is not running (e.g., during local development), the
# helper times out and falls back to a direct `gh pr view` call so the
# system degrades gracefully to the pre-Phase-1 behavior.
#
# Sourced from CONTEXT.md bash blocks via:
#   source /opt/slam-bot/scripts/lib/github-state.sh
#
# shellcheck shell=bash

# ── Paths ────────────────────────────────────────────────────────────────
# These default to /opt/slam-bot/state/* on the EC2 box but can be
# overridden via environment variable for local testing. The scanner
# daemon and the helpers must agree on these paths, so keep them in sync.
GITHUB_STATE_FILE="${GITHUB_STATE_FILE:-${BOT_STATE_DIR:-/opt/slam-bot/state}/github-state.json}"
GITHUB_STATE_REFRESH_QUEUE_DIR="${GITHUB_STATE_REFRESH_QUEUE_DIR:-${BOT_STATE_DIR:-/opt/slam-bot/state}/github-state-refresh-queue}"

# ── Freshness ────────────────────────────────────────────────────────────
# Default freshness window is 120 seconds. The scanner runs every ~60s, so
# any read within the window is at most 2 ticks old. If a script asserts
# freshness and the file is older than this, the script should error out
# (the daemon is probably down).
GITHUB_STATE_MAX_AGE_SECS="${GITHUB_STATE_MAX_AGE_SECS:-120}"

# Default refresh-poll timeout (seconds). Used by github_state_refresh_pr
# and github_state_refresh_issue if no per-call timeout is given.
GITHUB_STATE_REFRESH_TIMEOUT_SECS="${GITHUB_STATE_REFRESH_TIMEOUT_SECS:-10}"

# ── Internal helpers ─────────────────────────────────────────────────────

# _github_state_epoch_now — print current time as a unix epoch.
_github_state_epoch_now() { date +%s; }

# _github_state_parse_ts ISO_TIMESTAMP — convert an ISO-8601 timestamp to
# unix epoch. Tries GNU date first (Linux/EC2), falls back to BSD date
# (macOS). Prints "0" on failure so callers can detect the error.
_github_state_parse_ts() {
  local ts="$1"
  date -d "$ts" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s 2>/dev/null \
    || echo 0
}

# ── Read helpers ─────────────────────────────────────────────────────────

# github_state_assert_fresh — Returns 0 if the state file exists, has a
# generated_at timestamp, and is within $GITHUB_STATE_MAX_AGE_SECS. Returns
# 1 (and prints to stderr) otherwise.
#
# Call this at the top of any script that reads from the state file:
#   source /opt/slam-bot/scripts/lib/github-state.sh
#   github_state_assert_fresh || exit 1
github_state_assert_fresh() {
  if [ ! -f "$GITHUB_STATE_FILE" ]; then
    echo "ERROR: github-state file missing at $GITHUB_STATE_FILE" >&2
    echo "Is github-state-scanner.sh running? (systemctl status slam-bot-state-scanner)" >&2
    return 1
  fi

  local generated_at gen_epoch now age
  generated_at=$(jq -r '.generated_at // empty' "$GITHUB_STATE_FILE" 2>/dev/null)
  if [ -z "$generated_at" ]; then
    echo "ERROR: github-state file has no generated_at field — possibly mid-write or corrupt" >&2
    return 1
  fi

  gen_epoch=$(_github_state_parse_ts "$generated_at")
  if [ "$gen_epoch" = "0" ]; then
    echo "ERROR: github-state file has unparseable generated_at: $generated_at" >&2
    return 1
  fi

  now=$(_github_state_epoch_now)
  age=$((now - gen_epoch))

  if [ "$age" -gt "$GITHUB_STATE_MAX_AGE_SECS" ]; then
    echo "ERROR: github-state file is stale (age=${age}s, max=${GITHUB_STATE_MAX_AGE_SECS}s)" >&2
    echo "Scanner daemon may be hung — check journalctl -u slam-bot-state-scanner" >&2
    return 1
  fi

  return 0
}

# github_state_pr PR_NUMBER — Print the PR entry as compact JSON, or the
# literal string "null" if the PR is not in the state file. Lets callers
# distinguish "not present" from "empty object".
github_state_pr() {
  local n="$1"
  jq -c --arg n "$n" '.prs[$n] // null' "$GITHUB_STATE_FILE"
}

# github_state_pr_field PR_NUMBER FIELD — Print a single field from the
# PR's state entry. Empty output = field missing or PR missing.
#
# Example:
#   base=$(github_state_pr_field 1639 baseRefName)
#   head=$(github_state_pr_field 1639 headRefName)
#   merge=$(github_state_pr_field 1639 mergeable)
github_state_pr_field() {
  local n="$1" f="$2"
  jq -r --arg n "$n" --arg f "$f" '.prs[$n][$f] // empty' "$GITHUB_STATE_FILE"
}

# github_state_pr_has_label PR_NUMBER LABEL — exit 0 if the PR has LABEL,
# 1 otherwise. Useful for guard clauses:
#   if github_state_pr_has_label 1639 bot:in-progress; then continue; fi
github_state_pr_has_label() {
  local n="$1" l="$2"
  local has
  has=$(
    jq -r --arg n "$n" --arg l "$l" \
      '((.prs[$n].labels // []) | any(. == $l))' \
      "$GITHUB_STATE_FILE" 2>/dev/null
  )
  [ "$has" = "true" ]
}

# github_state_pr_numbers — Print one PR number per line for every PR in
# the state file. Useful for iterating the work queue.
github_state_pr_numbers() {
  jq -r '.prs | keys[]' "$GITHUB_STATE_FILE"
}

# github_state_issue ISSUE_NUMBER — Print the issue entry as compact JSON,
# or "null" if not present.
github_state_issue() {
  local n="$1"
  jq -c --arg n "$n" '.issues[$n] // null' "$GITHUB_STATE_FILE"
}

# github_state_issue_field ISSUE_NUMBER FIELD — Print a single field.
github_state_issue_field() {
  local n="$1" f="$2"
  jq -r --arg n "$n" --arg f "$f" '.issues[$n][$f] // empty' "$GITHUB_STATE_FILE"
}

# github_state_issue_has_label ISSUE_NUMBER LABEL
github_state_issue_has_label() {
  local n="$1" l="$2"
  local has
  has=$(
    jq -r --arg n "$n" --arg l "$l" \
      '((.issues[$n].labels // []) | any(. == $l))' \
      "$GITHUB_STATE_FILE" 2>/dev/null
  )
  [ "$has" = "true" ]
}

# github_state_issue_numbers — Print one issue number per line.
github_state_issue_numbers() {
  jq -r '.issues | keys[]' "$GITHUB_STATE_FILE"
}

# github_state_issues_with_label LABEL — Print issue numbers (one per line)
# for all issues that carry LABEL. Replaces per-label `gh issue list` calls
# in dispatcher-style code paths.
github_state_issues_with_label() {
  local l="$1"
  jq -r --arg l "$l" \
    '.issues | to_entries[] | select(.value.labels | any(. == $l)) | .key' \
    "$GITHUB_STATE_FILE"
}

# github_state_prs_fixing_issue ISSUE_NUMBER — Print PR numbers (one per
# line) for all open PRs whose closing_issues array includes ISSUE_NUMBER.
# Uses the canonical `closingIssuesReferences` GraphQL edge stored by the
# scanner, which only matches real closing directives (not prose mentions).
# This replaces `gh pr list --search "Fixes #N"` calls that did full-text
# body search and caused false positives (see dispatcher comment on #1600).
github_state_prs_fixing_issue() {
  local n="$1"
  jq -r --argjson n "$n" \
    '.prs | to_entries[] | select(.value.closing_issues | any(. == $n)) | .key' \
    "$GITHUB_STATE_FILE"
}

# github_state_prs_fixing_issue_count ISSUE_NUMBER — Print the count of
# open PRs whose closing_issues includes ISSUE_NUMBER. Returns "0" if none.
github_state_prs_fixing_issue_count() {
  local n="$1"
  jq -r --argjson n "$n" \
    '[.prs | to_entries[] | select(.value.closing_issues | any(. == $n))] | length' \
    "$GITHUB_STATE_FILE"
}

# ── Force-refresh helpers ────────────────────────────────────────────────

# _github_state_wait_for_refresh TRIGGER_FILE TIMEOUT
# Internal: poll until the trigger file is GONE (the daemon removes it
# after processing the refresh, so absence is a direct, unambiguous
# signal that the refresh was handled). Returns 0 if observed, 1 if
# timeout. Caller is responsible for dropping the trigger file BEFORE
# calling this.
#
# Why poll for absence rather than for state-file changes? PR/issue
# `updatedAt` reflects GitHub's last activity timestamp, which is
# unchanged when the daemon merely re-fetches the same PR. And
# `generated_at` can land in the same second as the trigger was dropped,
# making epoch comparisons unreliable. The trigger file is the only
# signal that's both unambiguous and mandatory.
_github_state_wait_for_refresh() {
  local trigger_file="$1" timeout="$2"
  local deadline=$(( $(_github_state_epoch_now) + timeout ))

  while [ "$(_github_state_epoch_now)" -lt "$deadline" ]; do
    if [ ! -e "$trigger_file" ]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# github_state_refresh_pr PR_NUMBER [TIMEOUT_SECS]
# Force the scanner daemon to re-fetch this one PR right now. Drops a
# trigger file in the refresh queue, then polls the state file for an
# update. Returns 0 if the refresh was observed, 1 if it timed out (in
# which case the caller can fall back to a direct `gh pr view`).
#
# Usage (from the pr-reviewer pre-merge check):
#   if ! github_state_refresh_pr "$PR_NUMBER"; then
#     # Daemon is down — fall back to a direct fetch
#     MERGEABLE=$(gh pr view "$PR_NUMBER" --json mergeable --jq .mergeable)
#   else
#     MERGEABLE=$(github_state_pr_field "$PR_NUMBER" mergeable)
#   fi
github_state_refresh_pr() {
  local n="${1:?PR number required}"
  local timeout="${2:-$GITHUB_STATE_REFRESH_TIMEOUT_SECS}"
  local trigger_file="${GITHUB_STATE_REFRESH_QUEUE_DIR}/pr-${n}.refresh"

  mkdir -p "$GITHUB_STATE_REFRESH_QUEUE_DIR" 2>/dev/null || true
  : > "$trigger_file"

  _github_state_wait_for_refresh "$trigger_file" "$timeout"
}

# github_state_refresh_issue ISSUE_NUMBER [TIMEOUT_SECS] — same as
# github_state_refresh_pr but for issues.
github_state_refresh_issue() {
  local n="${1:?issue number required}"
  local timeout="${2:-$GITHUB_STATE_REFRESH_TIMEOUT_SECS}"
  local trigger_file="${GITHUB_STATE_REFRESH_QUEUE_DIR}/issue-${n}.refresh"

  mkdir -p "$GITHUB_STATE_REFRESH_QUEUE_DIR" 2>/dev/null || true
  : > "$trigger_file"

  _github_state_wait_for_refresh "$trigger_file" "$timeout"
}
