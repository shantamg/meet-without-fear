#!/bin/bash
# test-write-tracker.sh — Smoke tests for write-tracker.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRITE_TRACKER="$SCRIPT_DIR/write-tracker.sh"
TEST_DIR=$(mktemp -d)
PASS=0
FAIL=0

# Override BOT_STATE_DIR so tracker files go to temp dir
export BOT_STATE_DIR="$TEST_DIR"
TRACKER_DIR="$TEST_DIR/thread-tracker"

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    ((FAIL++))
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [ -f "$path" ]; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label (file not found: $path)"
    ((FAIL++))
  fi
}

assert_file_not_exists() {
  local label="$1" path="$2"
  if [ ! -f "$path" ]; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label (file should not exist: $path)"
    ((FAIL++))
  fi
}

# ── Test 1: Basic creation ───────────────────────────────────────────────────
echo "Test 1: Basic tracker creation"
bash "$WRITE_TRACKER" \
  --channel C123 \
  --thread-ts 1234567890.123456 \
  --linked-issue 42 \
  --bot-reply-ts 1234567890.654321 \
  --human-message "Something is broken" \
  --bot-reply "Got it, tracking as Issue #42"

FILE="$TRACKER_DIR/C123-1234567890.123456.json"
assert_file_exists "tracker file created" "$FILE"
assert_eq "channel" "C123" "$(jq -r .channel "$FILE")"
assert_eq "thread_ts" "1234567890.123456" "$(jq -r .thread_ts "$FILE")"
assert_eq "linked_issue" "42" "$(jq -r .linked_issue "$FILE")"
assert_eq "linked_pr is null" "null" "$(jq -r .linked_pr "$FILE")"
assert_eq "status" "open" "$(jq -r .status "$FILE")"
assert_eq "follow_up_count" "0" "$(jq -r .follow_up_count "$FILE")"
assert_eq "human_message" "Something is broken" "$(jq -r .original_human_message "$FILE")"
assert_eq "bot_reply" "Got it, tracking as Issue #42" "$(jq -r .bot_first_reply "$FILE")"

# ── Test 2: Update existing tracker ──────────────────────────────────────────
echo "Test 2: Update existing tracker"
bash "$WRITE_TRACKER" \
  --channel C123 \
  --thread-ts 1234567890.123456 \
  --bot-reply-ts 1234567999.000000 \
  --bot-reply "Updated reply"

assert_eq "follow_up_count bumped" "1" "$(jq -r .follow_up_count "$FILE")"
assert_eq "bot_reply_ts updated" "1234567999.000000" "$(jq -r .last_bot_reply_ts "$FILE")"
assert_eq "bot_first_reply updated" "Updated reply" "$(jq -r .bot_first_reply "$FILE")"
assert_eq "original human message preserved" "Something is broken" "$(jq -r .original_human_message "$FILE")"

# ── Test 3: --skip-if-no-artifact with no issue/pr ───────────────────────────
echo "Test 3: --skip-if-no-artifact skips when no issue/pr"
bash "$WRITE_TRACKER" \
  --channel CSKIP \
  --thread-ts 9999999999.000000 \
  --bot-reply-ts 9999999999.111111 \
  --human-message "some message" \
  --bot-reply "some reply" \
  --skip-if-no-artifact

assert_file_not_exists "no file created with --skip-if-no-artifact" \
  "$TRACKER_DIR/CSKIP-9999999999.000000.json"

# ── Test 4: --skip-if-no-artifact with issue creates file ────────────────────
echo "Test 4: --skip-if-no-artifact creates file when issue provided"
bash "$WRITE_TRACKER" \
  --channel CSKIP \
  --thread-ts 9999999999.000000 \
  --linked-issue 99 \
  --bot-reply-ts 9999999999.111111 \
  --human-message "some message" \
  --bot-reply "some reply" \
  --skip-if-no-artifact

assert_file_exists "file created with --skip-if-no-artifact + issue" \
  "$TRACKER_DIR/CSKIP-9999999999.000000.json"

# ── Test 5: Truncation ───────────────────────────────────────────────────────
echo "Test 5: Long text is truncated"
LONG_TEXT=$(python3 -c "print('x' * 2000)")
bash "$WRITE_TRACKER" \
  --channel CLONG \
  --thread-ts 1111111111.000000 \
  --linked-issue 1 \
  --bot-reply-ts 1111111111.111111 \
  --human-message "$LONG_TEXT" \
  --bot-reply "$LONG_TEXT"

TRUNC_FILE="$TRACKER_DIR/CLONG-1111111111.000000.json"
HM_LEN=$(jq -r '.original_human_message | length' "$TRUNC_FILE")
BR_LEN=$(jq -r '.bot_first_reply | length' "$TRUNC_FILE")
# 1200 chars + "..." = 1203
assert_eq "human_message truncated" "1203" "$HM_LEN"
assert_eq "bot_reply truncated" "1203" "$BR_LEN"

# ── Test 6: Missing required args still exits 0 ─────────────────────────────
echo "Test 6: Missing required args exits 0"
bash "$WRITE_TRACKER" --channel C123 2>/dev/null
EXIT_CODE=$?
assert_eq "exits 0 on missing args" "0" "$EXIT_CODE"

# ── Test 7: linked-pr field ──────────────────────────────────────────────────
echo "Test 7: linked-pr field"
bash "$WRITE_TRACKER" \
  --channel CPR \
  --thread-ts 2222222222.000000 \
  --linked-pr 55 \
  --bot-reply-ts 2222222222.111111 \
  --human-message "pr test" \
  --bot-reply "pr reply"

PR_FILE="$TRACKER_DIR/CPR-2222222222.000000.json"
assert_eq "linked_pr set" "55" "$(jq -r .linked_pr "$PR_FILE")"
assert_eq "linked_issue null" "null" "$(jq -r .linked_issue "$PR_FILE")"

# ── Test 8: Update adds linked_issue to existing ─────────────────────────────
echo "Test 8: Update can add linked_issue to existing tracker"
bash "$WRITE_TRACKER" \
  --channel CPR \
  --thread-ts 2222222222.000000 \
  --linked-issue 77 \
  --bot-reply-ts 2222222222.222222

assert_eq "linked_issue added on update" "77" "$(jq -r .linked_issue "$PR_FILE")"
assert_eq "linked_pr preserved on update" "55" "$(jq -r .linked_pr "$PR_FILE")"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
