#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export PYTHONPATH="$SCRIPT_DIR/lib${PYTHONPATH:+:$PYTHONPATH}"
python3 "$SCRIPT_DIR/tests/test_invoke_provider.py"

export BOT_HOME="$TMP_DIR/bot-home"
export BOT_LOG_DIR="$TMP_DIR/logs"
export BOT_STATE_DIR="$TMP_DIR/state"
export BOT_QUEUE_DIR="$TMP_DIR/queue"
export REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
export PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export WORKSPACES_DIR="$PROJECT_DIR/bot-workspaces"
export ACTIVE_DIR="$TMP_DIR/active"
export BOT_SCRIPTS_DIR="$SCRIPT_DIR"
export LOCK_PREFIX="$TMP_DIR/slam-bot"
export SLACK_BOT_TOKEN=""
export PATH="$TMP_DIR/bin:$PATH"
mkdir -p "$TMP_DIR/bin" "$BOT_LOG_DIR" "$BOT_STATE_DIR" "$ACTIVE_DIR"

cat > "$TMP_DIR/bin/codex" <<'FAKE_CODEX'
#!/bin/bash
cat >/dev/null
printf '%s\n' '{"type":"error","message":"controlled fake codex failure"}'
exit 1
FAKE_CODEX
chmod +x "$TMP_DIR/bin/codex"

cat > "$TMP_DIR/bin/claude" <<'FAKE_CLAUDE'
#!/bin/bash
read -r _initial_message
printf '%s\n' '{"type":"system","session_id":"fake-claude-session"}'
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"fallback ok"}],"usage":{"input_tokens":1,"output_tokens":2}}}'
FAKE_CLAUDE
chmod +x "$TMP_DIR/bin/claude"

"$SCRIPT_DIR/run-claude.sh" --no-worktree --provider codex --fallback-provider claude fallback-test "Return fallback ok"

ARCHIVED=$(find "$ACTIVE_DIR/_archived" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)
grep -q "fallback ok" "$ARCHIVED/stream.log"
grep -q '"provider": "claude"' "$ARCHIVED/meta.json"
grep -q 'primaryProviderFailure' "$ARCHIVED/meta.json"
[ -f "$ARCHIVED/raw-stream.codex.failed.jsonl" ]

echo "provider-integration-test: ok"
