#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_SKILLS="${CODEX_HOME:-$HOME/.codex}/skills"

install_skill() {
  local src="$1"
  local name="$2"
  mkdir -p "$CODEX_SKILLS/$name"
  cp "$src/SKILL.md" "$CODEX_SKILLS/$name/SKILL.md"
}

install_skill "$ROOT/eval/skills/manual/mwf-gold-session-tester" "mwf-gold-session-tester"
install_skill "$ROOT/eval/skills/self-improvement/mwf-gold-loop-actor" "mwf-gold-loop-actor"
install_skill "$ROOT/eval/skills/self-improvement/mwf-gold-session-scorer" "mwf-gold-session-scorer"
install_skill "$ROOT/eval/skills/self-improvement/mwf-gold-prompt-improver" "mwf-gold-prompt-improver"

echo "Synced MWF gold skills to $CODEX_SKILLS"
