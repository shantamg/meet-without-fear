#!/bin/bash
# invoke-claude.sh — Build input and run Claude with session-aware invocation.
# Sourced by run-claude.sh. Expects: PROMPT, PROMPT_FILE, PROVENANCE_BLOCK,
# AGENT_HOME, SESSION_UUID, LOGFILE

# Stream output to log file AND _active/ stream.log in real-time
STREAM_LOG="$AGENT_HOME/stream.log"
RAW_STREAM="$AGENT_HOME/raw-stream.jsonl"

# Build activity journal context (only for new sessions, not resumed threads)
JOURNAL_BLOCK=""
if [ -z "$SESSION_UUID" ] || ! find ~/.claude/projects/ -name "${SESSION_UUID}.jsonl" 2>/dev/null | grep -q .; then
  JOURNAL_BLOCK=$(build_journal_context 2>/dev/null || true)
  if [ -n "$JOURNAL_BLOCK" ]; then
    JOURNAL_BLOCK="${JOURNAL_BLOCK}
"
  fi
fi

# Build input from prompt file or inline prompt
if [ -n "$PROMPT_FILE" ] && [ -f "$PROMPT_FILE" ]; then
  CLAUDE_INPUT=$({ echo "$JOURNAL_BLOCK"; echo "$PROVENANCE_BLOCK"; cat "$PROMPT_FILE"; })
else
  CLAUDE_INPUT="${JOURNAL_BLOCK}${PROVENANCE_BLOCK}${PROMPT}"
fi

# Persist the assembled prompt for auditing. Without this the only record
# of what we fed to Claude lives inside ~/.claude/projects/<uuid>.jsonl,
# which has no obvious link back to the bot's own agent dir. Writing it
# alongside meta.json/route.json/raw-stream.jsonl makes the agent dir a
# self-contained per-session record.
printf '%s' "$CLAUDE_INPUT" > "$AGENT_HOME/input.txt"

# Base claude args (always used)
CLAUDE_BASE_ARGS="--dangerously-skip-permissions -p - --output-format stream-json --verbose"

# Per-workspace model override (e.g., MODEL=sonnet for lighter tasks)
if [ -n "${MODEL:-}" ]; then
  CLAUDE_BASE_ARGS="--model $MODEL $CLAUDE_BASE_ARGS"
fi

# Per-workspace effort override (default: high, set via EFFORT env or --effort flag)
if [ -n "${EFFORT:-}" ]; then
  CLAUDE_BASE_ARGS="--effort $EFFORT $CLAUDE_BASE_ARGS"
fi

# jq filter for extracting text from stream-json
JQ_FILTER='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty'

if [ -n "$SESSION_UUID" ]; then
  # Check if session file exists on disk to decide --resume vs --session-id
  if find ~/.claude/projects/ -name "${SESSION_UUID}.jsonl" 2>/dev/null | grep -q .; then
    echo "[$(date)] Resuming session: $SESSION_UUID" >> "$LOGFILE"
    echo "$CLAUDE_INPUT" | claude --resume "$SESSION_UUID" $CLAUDE_BASE_ARGS 2>> "$LOGFILE" \
      | tee -a "$RAW_STREAM" \
      | jq -r --unbuffered "$JQ_FILTER" \
      | tee -a "$STREAM_LOG" >> "$LOGFILE" || true
  else
    echo "[$(date)] New session: $SESSION_UUID" >> "$LOGFILE"
    echo "$CLAUDE_INPUT" | claude --session-id "$SESSION_UUID" $CLAUDE_BASE_ARGS 2>> "$LOGFILE" \
      | tee -a "$RAW_STREAM" \
      | jq -r --unbuffered "$JQ_FILTER" \
      | tee -a "$STREAM_LOG" >> "$LOGFILE" || true
  fi
else
  # Standard stateless invocation
  echo "$CLAUDE_INPUT" | claude $CLAUDE_BASE_ARGS 2>> "$LOGFILE" \
    | tee -a "$RAW_STREAM" \
    | jq -r --unbuffered "$JQ_FILTER" \
    | tee -a "$STREAM_LOG" \
    >> "$LOGFILE" || true
fi

# Backfill meta.json with the Claude session_id so the bot's own archive
# links cleanly to ~/.claude/projects/<uuid>.jsonl. Stateless sessions
# never had their UUID populated up front (only sessioned ones did via
# session_key_to_uuid), so without this you have to grep raw-stream.jsonl
# to find the matching jsonl file. The session_id is emitted by claude on
# the very first event (system/init), so head -1 is enough.
if [ -f "$RAW_STREAM" ] && [ -f "$AGENT_HOME/meta.json" ]; then
  CLAUDE_SESSION_ID=$(head -1 "$RAW_STREAM" 2>/dev/null | jq -r '.session_id // empty' 2>/dev/null || true)
  if [ -n "$CLAUDE_SESSION_ID" ]; then
    META_TMP="${AGENT_HOME}/meta.json.tmp"
    if jq --arg sid "$CLAUDE_SESSION_ID" '.claudeSessionId = $sid' "$AGENT_HOME/meta.json" > "$META_TMP" 2>/dev/null; then
      mv "$META_TMP" "$AGENT_HOME/meta.json"
    else
      rm -f "$META_TMP"
    fi
  fi
fi

echo "" >> "$LOGFILE"
