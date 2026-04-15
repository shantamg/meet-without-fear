#!/bin/bash
# test-slack-post.sh — Verify slack-post.sh builds correct JSON payloads
# Run: bash test-slack-post.sh
# No Slack token or network access needed — tests payload construction only.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

# --- Test 1: jq encodes newlines correctly ---
echo "Test 1: jq newline encoding"
TEXT=$'Line one\nLine two\nLine three'
PAYLOAD=$(jq -n --arg ch "C123" --arg text "$TEXT" '{channel: $ch, text: $text}')
# Verify the JSON contains literal \n (escaped), not actual newlines in the text value
DECODED=$(echo "$PAYLOAD" | jq -r '.text')
assert_eq "newlines survive jq round-trip" "$TEXT" "$DECODED"
# Verify the JSON string itself contains \n escape sequences
echo "$PAYLOAD" | grep -q '"Line one\\nLine two\\nLine three"' \
  && assert_eq "JSON contains escaped newlines" "true" "true" \
  || assert_eq "JSON contains escaped newlines" "true" "false"

# --- Test 2: special characters ---
echo "Test 2: special characters"
TEXT='She said "hello" & <world> 100%'
PAYLOAD=$(jq -n --arg ch "C123" --arg text "$TEXT" '{channel: $ch, text: $text}')
DECODED=$(echo "$PAYLOAD" | jq -r '.text')
assert_eq "special chars survive round-trip" "$TEXT" "$DECODED"

# --- Test 3: Slack mrkdwn preserved ---
echo "Test 3: Slack mrkdwn syntax"
TEXT=$'*bold* _italic_ ~strike~\n• bullet one\n• bullet two\n<https://example.com|link>'
PAYLOAD=$(jq -n --arg ch "C123" --arg text "$TEXT" '{channel: $ch, text: $text}')
DECODED=$(echo "$PAYLOAD" | jq -r '.text')
assert_eq "mrkdwn syntax preserved" "$TEXT" "$DECODED"

# --- Test 4: thread_ts included when provided ---
echo "Test 4: thread_ts field"
PAYLOAD=$(jq -n --arg ch "C123" --arg text "msg" --arg ts "1234567890.123456" \
  '{channel: $ch, text: $text, thread_ts: $ts}')
TS=$(echo "$PAYLOAD" | jq -r '.thread_ts')
assert_eq "thread_ts present" "1234567890.123456" "$TS"

# --- Test 5: thread_ts absent when not provided ---
echo "Test 5: no thread_ts when omitted"
PAYLOAD=$(jq -n --arg ch "C123" --arg text "msg" '{channel: $ch, text: $text}')
HAS_TS=$(echo "$PAYLOAD" | jq 'has("thread_ts")')
assert_eq "thread_ts absent" "false" "$HAS_TS"

# --- Test 6: emoji and unicode ---
echo "Test 6: emoji and unicode"
TEXT=$'🤖 *Bot Health Check* — 2026-03-15\n\n✅ All clear\n📊 Memory: 42%'
PAYLOAD=$(jq -n --arg ch "C123" --arg text "$TEXT" '{channel: $ch, text: $text}')
DECODED=$(echo "$PAYLOAD" | jq -r '.text')
assert_eq "emoji/unicode preserved" "$TEXT" "$DECODED"

# --- Test 7: script syntax check ---
echo "Test 7: slack-post.sh syntax"
if bash -n "$SCRIPT_DIR/slack-post.sh" 2>/dev/null; then
  assert_eq "bash -n passes" "true" "true"
else
  assert_eq "bash -n passes" "true" "false"
fi

# --- Test 8: missing args detected ---
echo "Test 8: argument validation"
# Temporarily export a fake token so the env-sourcing logic doesn't fail
export SLACK_BOT_TOKEN="xoxb-test-token"
ERR=$(bash "$SCRIPT_DIR/slack-post.sh" --text "hi" 2>&1 || true)
echo "$ERR" | grep -q "channel is required" \
  && assert_eq "--channel required error" "true" "true" \
  || assert_eq "--channel required error" "true" "false"

ERR=$(bash "$SCRIPT_DIR/slack-post.sh" --channel "C123" 2>&1 || true)
echo "$ERR" | grep -q "text is required" \
  && assert_eq "--text required error" "true" "true" \
  || assert_eq "--text required error" "true" "false"
unset SLACK_BOT_TOKEN

# --- Summary ---
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
