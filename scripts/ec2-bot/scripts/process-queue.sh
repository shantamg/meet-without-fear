#!/bin/bash
# process-queue.sh - compatibility wrapper around the Python queue processor.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a
source "$SCRIPT_DIR/lib/config.sh"
set +a
export BOT_SCRIPTS_DIR="$SCRIPT_DIR"
exec env PYTHONPATH="$SCRIPT_DIR/lib${PYTHONPATH:+:$PYTHONPATH}" python3 -m bot_harness queue "$@"
