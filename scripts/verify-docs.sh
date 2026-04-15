#!/bin/bash
# verify-docs.sh — Use NotebookLM to check whether a living doc still matches
# the code it claims to describe.
#
# Reads docs/code-to-docs-mapping.json to find which code files correspond
# to the given doc, creates (or reuses) a dedicated NotebookLM notebook for
# that doc, uploads the doc + its mapped code files as sources, and asks the
# notebook to list any inaccuracies with citations.
#
# The notebooklm CLI has a devenv conflict when run from inside the repo, so
# all notebooklm invocations are prefixed with `cd ~ &&` to escape it first.
#
# Usage:
#   bash scripts/verify-docs.sh docs/architecture/backend-overview.md
#   bash scripts/verify-docs.sh --list         # show which docs have mappings
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAPPING_FILE="$REPO_ROOT/docs/code-to-docs-mapping.json"

if [ ! -f "$MAPPING_FILE" ]; then
  echo "ERROR: $MAPPING_FILE not found" >&2
  exit 1
fi

case "${1:-}" in
  ""|-h|--help)
    echo "Usage:"
    echo "  $0 <doc-path>       # verify one doc against its mapped code"
    echo "  $0 --list           # list docs with mappings"
    exit 0
    ;;
  --list)
    jq -r '.mappings[] | .docs[]' "$MAPPING_FILE" | sort -u
    exit 0
    ;;
esac

DOC="$1"
DOC_ABS="$REPO_ROOT/$DOC"

if [ ! -f "$DOC_ABS" ]; then
  echo "ERROR: doc not found: $DOC" >&2
  exit 1
fi

# Find all code globs that list this doc in their `docs` array
CODE_GLOBS=$(jq -r --arg doc "$DOC" '.mappings[] | select(.docs | index($doc)) | .code' "$MAPPING_FILE")

if [ -z "$CODE_GLOBS" ]; then
  echo "ERROR: no code mappings point at $DOC" >&2
  echo "Add an entry in docs/code-to-docs-mapping.json first." >&2
  exit 1
fi

# Expand globs into a concrete file list. Respect ** and simple * patterns.
CODE_FILES=()
while IFS= read -r glob; do
  [ -n "$glob" ] || continue
  # Convert the mapping glob to something `find` and the shell can evaluate.
  if [[ "$glob" == *'/**' ]]; then
    base="${glob%/**}"
    while IFS= read -r f; do CODE_FILES+=("$f"); done < <(find "$REPO_ROOT/$base" -type f 2>/dev/null)
  elif [[ "$glob" == *'*'* ]]; then
    # Shell glob (bash)
    (cd "$REPO_ROOT" && compgen -G "$glob" || true) | while IFS= read -r f; do
      echo "$f"
    done | while IFS= read -r f; do CODE_FILES+=("$f"); done
    # compgen+while in subshell loses array; use a temp file fallback
  else
    CODE_FILES+=("$glob")
  fi
done <<< "$CODE_GLOBS"

# Simpler, portable fallback: rebuild CODE_FILES using find across all globs
CODE_FILES=()
while IFS= read -r glob; do
  [ -n "$glob" ] || continue
  if [[ "$glob" == *'/**' ]]; then
    base="${glob%/**}"
    if [ -d "$REPO_ROOT/$base" ]; then
      while IFS= read -r f; do
        # Store paths relative to repo root
        rel="${f#$REPO_ROOT/}"
        CODE_FILES+=("$rel")
      done < <(find "$REPO_ROOT/$base" -type f 2>/dev/null | head -50)
    fi
  elif [[ "$glob" == *'*'* ]]; then
    # Match via bash globbing in repo root
    (cd "$REPO_ROOT" && for m in $glob; do [ -e "$m" ] && echo "$m"; done) | while IFS= read -r f; do
      echo "$f"
    done > /tmp/verify-docs-matches.$$
    while IFS= read -r rel; do
      [ -n "$rel" ] && CODE_FILES+=("$rel")
    done < /tmp/verify-docs-matches.$$
    rm -f /tmp/verify-docs-matches.$$
  else
    [ -f "$REPO_ROOT/$glob" ] && CODE_FILES+=("$glob")
  fi
done <<< "$CODE_GLOBS"

if [ ${#CODE_FILES[@]} -eq 0 ]; then
  echo "ERROR: code globs resolved to zero files. Check $MAPPING_FILE globs:" >&2
  echo "$CODE_GLOBS" >&2
  exit 1
fi

# Cap at 25 files per notebook — NotebookLM has a source limit and large
# docs blow past useful context anyway. If we hit the cap, log which were kept.
MAX_FILES=25
if [ ${#CODE_FILES[@]} -gt $MAX_FILES ]; then
  echo "WARN: ${#CODE_FILES[@]} code files matched; capping at $MAX_FILES for NotebookLM" >&2
  CODE_FILES=("${CODE_FILES[@]:0:$MAX_FILES}")
fi

# Derive a stable notebook title from the doc path
SLUG=$(echo "$DOC" | sed 's|^docs/||; s|\.md$||; s|/|-|g')
NOTEBOOK_TITLE="mwf-verify-$SLUG"

echo "=== verify-docs: $DOC ==="
echo "Notebook: $NOTEBOOK_TITLE"
echo "Sources: 1 doc + ${#CODE_FILES[@]} code files"
echo

# Reuse existing notebook if present; else create
cd ~  # escape devenv
EXISTING_ID=$(notebooklm list --json 2>/dev/null | jq -r --arg t "$NOTEBOOK_TITLE" '.notebooks[] | select(.title == $t) | .id' | head -1)

if [ -n "$EXISTING_ID" ]; then
  echo "Reusing notebook: $EXISTING_ID"
  notebooklm use "$EXISTING_ID" > /dev/null
  # Clear old sources so we upload fresh versions
  OLD_SOURCES=$(notebooklm source list --json 2>/dev/null | jq -r '.sources[].id' || true)
  for sid in $OLD_SOURCES; do
    notebooklm source delete "$sid" > /dev/null 2>&1 || true
  done
else
  echo "Creating notebook..."
  NEW=$(notebooklm create "$NOTEBOOK_TITLE" --json 2>/dev/null)
  EXISTING_ID=$(echo "$NEW" | jq -r '.notebook.id // .id')
  notebooklm use "$EXISTING_ID" > /dev/null
fi

echo "Uploading doc..."
notebooklm source add "$DOC_ABS" --title "DOC: $DOC" > /dev/null

echo "Uploading ${#CODE_FILES[@]} code files..."
for rel in "${CODE_FILES[@]}"; do
  abs="$REPO_ROOT/$rel"
  [ -f "$abs" ] || continue
  # Force text type — NotebookLM's file upload rejects .ts/.tsx/.sh with 400.
  # `--type text` sends the content inline as plain text instead.
  notebooklm source add "$abs" --type text --title "CODE: $rel" > /dev/null 2>&1 \
    || echo "  skipped (upload failed): $rel" >&2
done

echo
echo "Waiting briefly for NotebookLM to index sources..."
sleep 5

QUESTION=$(cat <<EOF
Compare the DOC source (doc: $DOC) against the CODE sources.

List every specific inaccuracy where the doc does not match the code:
- Claims in the doc that contradict the code
- Behaviors the doc describes that aren't in the code
- Code-level behaviors the doc omits that a reader would need to know
- Values/names/paths/imports in the doc that don't match the code

For each issue, cite the exact source excerpt (from both the doc and the code when applicable).

If the doc and code are aligned, say so explicitly.

Be specific. Do not speculate beyond what the sources show.
EOF
)

echo
echo "=== NotebookLM findings ==="
notebooklm ask --new "$QUESTION"
