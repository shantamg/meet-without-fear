#!/bin/bash
# Broad Python harness tests. Uses fake state and never calls real Slack/GitHub/model CLIs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../lib" && pwd)"

PYTHONPATH="$LIB_DIR" python3 -m unittest \
  "$SCRIPT_DIR/test_invoke_provider.py" \
  "$SCRIPT_DIR/test_bot_harness.py"
