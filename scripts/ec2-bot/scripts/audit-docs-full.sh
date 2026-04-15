#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
"$BOT_SCRIPTS_DIR/run-claude.sh" "audit-docs-full" "" \
  "$HOME/meet-without-fear/.claude/commands/audit-docs-full.md"
