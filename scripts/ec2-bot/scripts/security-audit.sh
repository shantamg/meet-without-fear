#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
"$BOT_SCRIPTS_DIR/run-claude.sh" "security-audit" "" \
  "$PROJECT_DIR/.claude/commands/security-audit.md"
