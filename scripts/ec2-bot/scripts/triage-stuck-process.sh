#!/bin/bash
# triage-stuck-process.sh — AI-powered analysis of a potentially stuck Claude process
#
# Spawns a lightweight Claude instance to analyze the last N lines of a stuck
# process's log and determine whether it should be killed, given more time, or
# escalated to a human.
#
# Usage: triage-stuck-process.sh <slug> <pid> <age_min> <logfile>
# Output: JSON to stdout with verdict and reasoning
#   { "verdict": "kill"|"extend"|"alert", "reason": "..." }
#
# Designed to be called from clear-stale-locks.sh before killing a process.

set -euo pipefail

SLUG="${1:-unknown}"
PID="${2:-0}"
AGE_MIN="${3:-0}"
LOGFILE="${4:-}"

# If no log file or it doesn't exist, we can't evaluate the process — escalate
# rather than kill. A missing log most often means the caller passed the wrong
# path (e.g., a prefix mismatch bug in the slug derivation), not that the
# process is actually broken. Defaulting to kill here silently terminated
# legitimate long-running agents; "alert" routes to a human without data loss.
if [ -z "$LOGFILE" ] || [ ! -f "$LOGFILE" ]; then
  echo "{\"verdict\":\"alert\",\"reason\":\"No log file found at expected path (${LOGFILE:-unset}) — cannot evaluate; escalating instead of killing\"}"
  exit 0
fi

# Grab the last 150 lines of the log for context
LOG_TAIL=$(tail -150 "$LOGFILE" 2>/dev/null || echo "(failed to read log)")

# Build a focused prompt for the triage agent
PROMPT="You are a process triage agent. A Claude Code session (PID $PID, slug '$SLUG') has been running for $AGE_MIN minutes and appears idle (no tool calls or output in the last few minutes).

Analyze the log output below and determine:
1. Is the process stuck (e.g., waiting indefinitely, in an error loop, hung)?
2. Is it doing legitimate long-running work (e.g., large refactor, many file edits, complex analysis)?
3. Is it in an error/retry loop?

Respond with EXACTLY one line of JSON (no markdown, no extra text):
{\"verdict\": \"kill|extend|alert\", \"reason\": \"one sentence explanation\"}

Where:
- \"kill\" = process is stuck or in a loop, safe to terminate
- \"extend\" = process appears to be doing real work, give it more time
- \"alert\" = unclear, escalate to human for review

LOG OUTPUT (last 150 lines):
$LOG_TAIL"

# Run Claude with a short timeout — this is a quick triage, not a full session
# Use --max-turns 1 to get a single response
RESULT=$(echo "$PROMPT" | timeout 60 claude --dangerously-skip-permissions -p - --max-turns 1 --output-format text 2>/dev/null || echo "")

# Extract JSON from the response — use jq to validate rather than regex,
# which breaks if the reason string contains braces (e.g., "{ERR_TIMEOUT}")
JSON=$(echo "$RESULT" | jq -c 'select(.verdict)' 2>/dev/null | head -1)

if [ -n "$JSON" ]; then
  echo "$JSON"
  exit 0
fi

# Fallback if triage failed
echo '{"verdict":"alert","reason":"Triage agent did not return a valid verdict — escalating to human"}'
