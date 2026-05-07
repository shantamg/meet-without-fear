#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_SRC="$ROOT/eval/skills"
SKILLS_DST="${CODEX_HOME:-$HOME/.codex}/skills"

skills=(
  mwf-gold-loop-actor
  mwf-gold-session-scorer
  mwf-gold-session-reporter
  mwf-gold-session-tester
  mwf-gold-prompt-improver
)

mkdir -p "$SKILLS_DST"

for skill in "${skills[@]}"; do
  src="$SKILLS_SRC/$skill"
  dst="$SKILLS_DST/$skill"

  if [[ ! -f "$src/SKILL.md" ]]; then
    echo "Missing repo skill source: $src/SKILL.md" >&2
    exit 1
  fi

  if [[ -e "$dst" && ! -L "$dst" ]]; then
    echo "Refusing to replace non-symlink runtime skill: $dst" >&2
    echo "Move or remove it manually, then rerun this installer." >&2
    exit 1
  fi

  ln -sfn "$src" "$dst"
  echo "$dst -> $src"
done
