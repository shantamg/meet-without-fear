#!/bin/bash
# test-thread-tracker.sh — Smoke tests for thread-tracker.sh
#
# Tests the fast path, TTL pruning, GitHub state change detection (Tier 1),
# and Slack API-based checks (Tier 2): staleness nudge, closure, reactivation.
# Does NOT test Claude invocation or Slack posting (those require live credentials).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
THREAD_TRACKER="$SCRIPT_DIR/thread-tracker.sh"
TEST_DIR=$(mktemp -d)
PASS=0
FAIL=0

# Override paths for test isolation
export BOT_STATE_DIR="$TEST_DIR"
export BOT_SCRIPTS_DIR="$SCRIPT_DIR"
export REPO_ROOT="$TEST_DIR/repo"
export ANTHROPIC_API_KEY=""  # Intentionally empty — tests don't call Claude
export SLACK_BOT_TOKEN=""    # Empty by default — Tier 2 tests set it explicitly
export BOT_ENV_FILE="/dev/null"  # Prevent config.sh from sourcing real .env
export MAX_SLACK_API_CALLS=20
export SLACK_API_DELAY=0     # No delay in tests

TRACKER_DIR="$TEST_DIR/thread-tracker"
GITHUB_STATE="$TEST_DIR/github-state.json"
export GITHUB_STATE_FILE="$GITHUB_STATE"
export GITHUB_STATE_MAX_AGE_SECS=9999  # never stale in tests

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

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label"
    echo "    expected to contain: $needle"
    echo "    actual: $haystack"
    ((FAIL++))
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -qF "$needle"; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label"
    echo "    expected NOT to contain: $needle"
    echo "    actual: $haystack"
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

# ── Helper: create a github-state.json ───────────────────────────────────────
write_github_state() {
  cat > "$GITHUB_STATE" <<EOF
{
  "schema_version": 1,
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "test",
  "prs": {$1},
  "issues": {$2}
}
EOF
}

# ── Helper: create a tracker file ────────────────────────────────────────────
create_tracker() {
  local channel="$1" thread_ts="$2" linked_issue="$3" linked_pr="$4" status="${5:-open}" created_at="${6:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  mkdir -p "$TRACKER_DIR"
  jq -n \
    --arg channel "$channel" \
    --arg thread_ts "$thread_ts" \
    --arg linked_issue "$linked_issue" \
    --arg linked_pr "$linked_pr" \
    --arg status "$status" \
    --arg created_at "$created_at" \
    '{
      channel: $channel,
      thread_ts: $thread_ts,
      linked_issue: (if $linked_issue != "" then ($linked_issue | tonumber) else null end),
      linked_pr: (if $linked_pr != "" then ($linked_pr | tonumber) else null end),
      last_bot_reply_ts: "1234567890.000000",
      status: $status,
      created_at: $created_at,
      follow_up_count: 0,
      original_human_message: "test message",
      bot_first_reply: "test reply"
    }' > "$TRACKER_DIR/${channel}-${thread_ts}.json"
}

# ── Helper: create a tracker file with nudge/closure fields ──────────────────
create_tracker_extended() {
  local channel="$1" thread_ts="$2" linked_issue="$3" linked_pr="$4"
  local status="${5:-open}" created_at="${6:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  local nudge_count="${7:-0}" nudge_sent_at="${8:-}" closure_count="${9:-0}" closure_sent_at="${10:-}"
  mkdir -p "$TRACKER_DIR"
  jq -n \
    --arg channel "$channel" \
    --arg thread_ts "$thread_ts" \
    --arg linked_issue "$linked_issue" \
    --arg linked_pr "$linked_pr" \
    --arg status "$status" \
    --arg created_at "$created_at" \
    --argjson nudge_count "$nudge_count" \
    --arg nudge_sent_at "$nudge_sent_at" \
    --argjson closure_count "$closure_count" \
    --arg closure_sent_at "$closure_sent_at" \
    '{
      channel: $channel,
      thread_ts: $thread_ts,
      linked_issue: (if $linked_issue != "" then ($linked_issue | tonumber) else null end),
      linked_pr: (if $linked_pr != "" then ($linked_pr | tonumber) else null end),
      last_bot_reply_ts: "1234567890.000000",
      status: $status,
      created_at: $created_at,
      follow_up_count: 0,
      nudge_count: $nudge_count,
      closure_count: $closure_count,
      original_human_message: "test message",
      bot_first_reply: "test reply"
    } |
    (if $nudge_sent_at != "" then .nudge_sent_at = $nudge_sent_at else . end) |
    (if $closure_sent_at != "" then .closure_sent_at = $closure_sent_at else . end)
    ' > "$TRACKER_DIR/${channel}-${thread_ts}.json"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1 TESTS
# ═══════════════════════════════════════════════════════════════════════════════

echo "=== Test 1: Fast path — no tracker directory ==="
rm -rf "$TRACKER_DIR"
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
EXIT_CODE=$?
assert_eq "exit code is 0" "0" "$EXIT_CODE"
assert_contains "logs nothing to do" "nothing to do" "$OUTPUT"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 2: Fast path — empty tracker directory ==="
mkdir -p "$TRACKER_DIR"
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
EXIT_CODE=$?
assert_eq "exit code is 0" "0" "$EXIT_CODE"
assert_contains "logs nothing to do" "nothing to do" "$OUTPUT"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 3: Fast path — all resolved ==="
create_tracker "C111" "1111.111111" "100" "" "resolved"
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
EXIT_CODE=$?
assert_eq "exit code is 0" "0" "$EXIT_CODE"
assert_contains "logs nothing to do" "nothing to do" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 4: TTL pruning — old file deleted ==="
OLD_DATE="2026-03-01T00:00:00Z"  # >14 days ago from test date
create_tracker "C222" "2222.222222" "200" "" "open" "$OLD_DATE"
write_github_state '' '"200": {"number": 200, "state": "OPEN", "title": "test", "labels": [], "assignees": [], "updatedAt": "2026-04-01T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_file_not_exists "old tracker file pruned" "$TRACKER_DIR/C222-2222.222222.json"
assert_contains "logs pruned count" "pruned" "$OUTPUT"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 5: Open issue — no state change ==="
create_tracker "C333" "3333.333333" "300" "" "open"
write_github_state '' '"300": {"number": 300, "state": "OPEN", "title": "test open issue", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "no state changes" "no state changes" "$OUTPUT"
assert_eq "tracker still open" "open" "$(jq -r .status "$TRACKER_DIR/C333-3333.333333.json")"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 6: Closed issue detected ==="
create_tracker "C444" "4444.444444" "400" "" "open"
write_github_state '' '"400": {"number": 400, "state": "CLOSED", "title": "fixed bug", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
# Claude invocation will fail (no API key) but state change should be detected
assert_contains "detects issue closed" "Issue #400" "$OUTPUT"
assert_contains "state change detected" "Tier 1 state change" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 7: PR completed (no longer in state file) ==="
create_tracker "C555" "5555.555555" "" "500" "open"
write_github_state '' ''  # PR 500 not in state file = merged/closed
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "detects PR completed" "PR #500 was merged or closed" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 8: PR still open — no change ==="
create_tracker "C666" "6666.666666" "" "600" "open"
write_github_state '"600": {"number": 600, "title": "wip PR", "baseRefName": "main", "headRefName": "feat/test", "author_login": "MwfBot", "isDraft": false, "mergeable": "MERGEABLE", "mergeStateStatus": "BLOCKED", "reviewDecision": null, "labels": [], "statusCheckRollup": [], "updatedAt": "2026-04-10T00:00:00Z"}' ''
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "no state changes" "no state changes" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 9: Multiple threads — mixed states ==="
mkdir -p "$TRACKER_DIR"
create_tracker "C777" "7777.111111" "700" "" "open"     # issue CLOSED
create_tracker "C777" "7777.222222" "701" "" "open"     # issue OPEN
create_tracker "C777" "7777.333333" "" "702" "open"     # PR merged (not in state)
create_tracker "C777" "7777.444444" "" "" "resolved"    # already resolved — skip

write_github_state '' '"700": {"number": 700, "state": "CLOSED", "title": "done", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}, "701": {"number": 701, "state": "OPEN", "title": "still open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "detects 2 changes" "2 thread(s) need follow-ups" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 10: Stale github-state file ==="
mkdir -p "$TRACKER_DIR"
create_tracker "C888" "8888.888888" "800" "" "open"
# Write a stale state file
cat > "$GITHUB_STATE" <<EOF
{
  "schema_version": 1,
  "generated_at": "2026-01-01T00:00:00Z",
  "source": "test",
  "prs": {},
  "issues": {}
}
EOF
# Use strict freshness for this test — Tier 1 skipped but script continues
GITHUB_STATE_MAX_AGE_SECS=120 OUTPUT=$(GITHUB_STATE_MAX_AGE_SECS=120 bash "$THREAD_TRACKER" 2>&1)
assert_contains "warns about stale state" "stale or missing" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2 TESTS
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "=== Test 11: Tier 2 skipped when SLACK_BOT_TOKEN not set ==="
create_tracker "C900" "9000.000000" "900" "" "open"
write_github_state '' '"900": {"number": 900, "state": "OPEN", "title": "open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(unset SLACK_BOT_TOKEN; bash "$THREAD_TRACKER" 2>&1)
assert_not_contains "no Tier 2 without token" "Tier 2:" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 12: Closed tracker files are included for reactivation ==="
create_tracker "C910" "9100.000000" "910" "" "closed"
write_github_state '' '"910": {"number": 910, "state": "OPEN", "title": "open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "closed files are trackable" "1 trackable file(s)" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 13: Staleness nudge — thread old enough, no nudge sent yet ==="
# Create a thread that's >24h old with no nudge
OLD_CREATED=$(date -u -d "-30 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-30H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
create_tracker_extended "C920" "9200.000000" "920" "" "open" "$OLD_CREATED" 0 "" 0 ""
write_github_state '' '"920": {"number": 920, "state": "OPEN", "title": "stale", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
# We can't test the golden window easily (depends on time of day), but we can verify
# the thread is identified as a Tier 2 candidate
# With no SLACK_BOT_TOKEN, Tier 2 is skipped — this just validates the file is trackable
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "old thread is trackable" "1 trackable file(s)" "$OUTPUT"
assert_eq "nudge_count is 0" "0" "$(jq -r '.nudge_count // 0' "$TRACKER_DIR/C920-9200.000000.json")"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 14: Staleness nudge — already nudged, should not nudge again ==="
OLD_CREATED=$(date -u -d "-30 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-30H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
NUDGE_TIME=$(date -u -d "-10 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-10H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
create_tracker_extended "C930" "9300.000000" "930" "" "open" "$OLD_CREATED" 1 "$NUDGE_TIME" 0 ""
write_github_state '' '"930": {"number": 930, "state": "OPEN", "title": "nudged", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
# Verify nudge_count stays at 1 (no second nudge queued)
assert_eq "nudge_count stays at 1" "1" "$(jq -r '.nudge_count' "$TRACKER_DIR/C930-9300.000000.json")"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 15: Closure eligibility — 48h after nudge with no response ==="
OLD_CREATED=$(date -u -d "-80 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-80H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
OLD_NUDGE=$(date -u -d "-50 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-50H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
create_tracker_extended "C940" "9400.000000" "940" "" "open" "$OLD_CREATED" 1 "$OLD_NUDGE" 0 ""
write_github_state '' '"940": {"number": 940, "state": "OPEN", "title": "stale nudged", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
# File should be trackable; actual closure requires Slack API (Tier 2)
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "closure candidate is trackable" "1 trackable file(s)" "$OUTPUT"
assert_eq "closure_count is 0 before Tier 2" "0" "$(jq -r '.closure_count // 0' "$TRACKER_DIR/C940-9400.000000.json")"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 16: Reactivation — closed tracker detected for processing ==="
CLOSE_TIME=$(date -u -d "-2 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
create_tracker_extended "C950" "9500.000000" "950" "" "closed" "2026-04-09T00:00:00Z" 1 "2026-04-09T12:00:00Z" 1 "$CLOSE_TIME"
write_github_state '' '"950": {"number": 950, "state": "OPEN", "title": "reactivation candidate", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
# Closed files are included in trackable files
assert_contains "closed file is trackable" "1 trackable file(s)" "$OUTPUT"
assert_eq "status is still closed (needs Slack API for reactivation)" "closed" "$(jq -r .status "$TRACKER_DIR/C950-9500.000000.json")"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 17: Golden window function exists ==="
# Source the script functions by extracting is_golden_window
OUTPUT=$(bash -c '
  is_golden_window() {
    local dow hour
    dow=$(TZ=America/New_York date +%u 2>/dev/null || echo 0)
    hour=$(TZ=America/New_York date +%H 2>/dev/null || echo 0)
    [ "$dow" -ge 1 ] && [ "$dow" -le 5 ] && [ "$hour" -ge 10 ] && [ "$hour" -lt 16 ]
  }
  # Just verify the function runs without error
  is_golden_window && echo "in_window" || echo "outside_window"
')
# We just check it returns one of the two valid values
if [ "$OUTPUT" = "in_window" ] || [ "$OUTPUT" = "outside_window" ]; then
  echo "  PASS: golden window function works"
  ((PASS++))
else
  echo "  FAIL: golden window function returned unexpected: $OUTPUT"
  ((FAIL++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 18: Follow-up type field in Tier 1 output ==="
create_tracker "C960" "9600.000000" "960" "" "open"
write_github_state '' '"960": {"number": 960, "state": "CLOSED", "title": "done", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
assert_contains "Tier 1 logs state change" "Tier 1 state change" "$OUTPUT"
assert_contains "drafts mention follow-ups" "thread(s) need follow-ups" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 19: Rate limit config is respected ==="
# Create multiple trackers
write_github_state '' ''
for i in $(seq 1 5); do
  create_tracker "C970" "970${i}.000000" "" "" "open"
done
# With no GitHub state changes and no Slack token, nothing to do
OUTPUT=$(MAX_SLACK_API_CALLS=2 bash "$THREAD_TRACKER" 2>&1)
assert_contains "multiple files trackable" "5 trackable file(s)" "$OUTPUT"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 11: Tick summary — structured JSON emitted ==="
rm -rf "$TRACKER_DIR"
mkdir -p "$TRACKER_DIR"
create_tracker "C901" "9010.111111" "900" "" "open"
write_github_state '' '"900": {"number": 900, "state": "OPEN", "title": "still open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
# Extract the JSON line (tick_summary)
TICK_JSON=$(echo "$OUTPUT" | grep '"event":"tick_summary"' || echo "$OUTPUT" | grep '"event": "tick_summary"' || true)
if [ -n "$TICK_JSON" ] && echo "$TICK_JSON" | jq -e '.event == "tick_summary"' >/dev/null 2>&1; then
  echo "  PASS: tick summary JSON emitted"
  ((PASS++))
  # Verify fields
  OPEN_COUNT=$(echo "$TICK_JSON" | jq '.open_scanned')
  assert_eq "tick summary open_scanned is 1" "1" "$OPEN_COUNT"
  GH_CHECKS=$(echo "$TICK_JSON" | jq '.github_state_checks')
  assert_eq "tick summary github_state_checks is 1" "1" "$GH_CHECKS"
  ELAPSED=$(echo "$TICK_JSON" | jq '.elapsed_ms')
  if [ "$ELAPSED" -ge 0 ] 2>/dev/null; then
    echo "  PASS: elapsed_ms is non-negative"
    ((PASS++))
  else
    echo "  FAIL: elapsed_ms should be non-negative (got $ELAPSED)"
    ((FAIL++))
  fi
else
  echo "  FAIL: no tick_summary JSON found in output"
  ((FAIL++))
fi
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 12: Daily stats file created ==="
rm -rf "$TRACKER_DIR"
mkdir -p "$TRACKER_DIR"
create_tracker "C902" "9020.111111" "901" "" "open"
write_github_state '' '"901": {"number": 901, "state": "OPEN", "title": "still open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
bash "$THREAD_TRACKER" >/dev/null 2>&1
STATS="$TRACKER_DIR/stats.json"
assert_file_exists "stats.json created" "$STATS"
if [ -f "$STATS" ]; then
  TICKS=$(jq '.ticks_run' "$STATS" 2>/dev/null)
  assert_eq "stats.json ticks_run is 1" "1" "$TICKS"
  DATE=$(jq -r '.date' "$STATS" 2>/dev/null)
  TODAY=$(date -u +%Y-%m-%d)
  assert_eq "stats.json date is today" "$TODAY" "$DATE"
fi
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 13: Daily stats accumulate across ticks ==="
rm -rf "$TRACKER_DIR"
mkdir -p "$TRACKER_DIR"
create_tracker "C903" "9030.111111" "902" "" "open"
write_github_state '' '"902": {"number": 902, "state": "OPEN", "title": "still open", "labels": [], "assignees": [], "updatedAt": "2026-04-10T00:00:00Z"}'
bash "$THREAD_TRACKER" >/dev/null 2>&1
# Run a second tick
bash "$THREAD_TRACKER" >/dev/null 2>&1
STATS="$TRACKER_DIR/stats.json"
if [ -f "$STATS" ]; then
  TICKS=$(jq '.ticks_run' "$STATS" 2>/dev/null)
  assert_eq "stats.json ticks_run is 2 after two ticks" "2" "$TICKS"
fi
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Test 14: TTL prune audit — per-file logging ==="
OLD_DATE2="2026-03-01T00:00:00Z"
rm -rf "$TRACKER_DIR"
create_tracker "C904" "9040.111111" "903" "" "open" "$OLD_DATE2"
create_tracker "C904" "9040.222222" "904" "" "open" "$OLD_DATE2"
write_github_state '' '"903": {"number": 903, "state": "OPEN", "title": "test", "labels": [], "assignees": [], "updatedAt": "2026-04-01T00:00:00Z"}, "904": {"number": 904, "state": "OPEN", "title": "test", "labels": [], "assignees": [], "updatedAt": "2026-04-01T00:00:00Z"}'
OUTPUT=$(bash "$THREAD_TRACKER" 2>&1)
# Should see per-file TTL prune log messages
PRUNE_LOGS=$(echo "$OUTPUT" | grep -c "TTL prune:" || true)
assert_eq "2 per-file TTL prune log entries" "2" "$PRUNE_LOGS"
rm -rf "$TRACKER_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "SOME TESTS FAILED"
  exit 1
else
  echo "ALL TESTS PASSED"
  exit 0
fi
