#!/bin/bash
# sync-labels.sh — Keep GitHub labels in sync with label-registry.json
#
# Ensures every bot:* label in the registry exists on GitHub with consistent
# color and description. Removes bot:* labels from GitHub that aren't in the
# registry (stale/legacy labels).
#
# Safe to run frequently — only makes API calls when labels are out of sync.
#
# Usage:
#   sync-labels.sh              # Sync labels
#   sync-labels.sh --dry-run    # Show what would change without doing it

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"

LOGFILE="${BOT_LOG_DIR}/sync-labels.log"
DRY_RUN="${1:-}"

# Standard color for bot:* labels (orange-red)
BOT_LABEL_COLOR="D93F0B"

log() { echo "[$(date)] $1" >> "$LOGFILE"; }

if [ ! -f "$REGISTRY_FILE" ]; then
  log "ERROR: Label registry not found: $REGISTRY_FILE"
  exit 1
fi

# Get all labels from registry
REGISTRY_LABELS=$(jq -r '.labels | keys[]' "$REGISTRY_FILE" 2>/dev/null)

if [ -z "$REGISTRY_LABELS" ]; then
  log "ERROR: No labels found in registry"
  exit 1
fi

# Get all bot:* labels currently on GitHub
GITHUB_BOT_LABELS=$(gh label list --repo "$GITHUB_REPO" --limit 200 --json name \
  --jq '.[] | select(.name | startswith("bot:")) | .name' 2>/dev/null) || {
  log "ERROR: Failed to fetch GitHub labels"
  exit 1
}

CREATED=0
UPDATED=0
DELETED=0

# Ensure every registry label exists on GitHub
for LABEL in $REGISTRY_LABELS; do
  # Skip non-bot: labels (shouldn't be any, but defensive)
  [[ "$LABEL" == bot:* ]] || continue

  TRIGGER=$(jq -r --arg l "$LABEL" '.labels[$l].trigger // "label"' "$REGISTRY_FILE")
  WORKSPACE=$(jq -r --arg l "$LABEL" '.labels[$l].workspace // "unknown"' "$REGISTRY_FILE")
  DESCRIPTION="Bot pipeline: ${TRIGGER}-triggered → ${WORKSPACE%/} workspace"

  # Check if label exists on GitHub
  EXISTING=$(gh label list --repo "$GITHUB_REPO" --json name,color,description \
    --jq --arg l "$LABEL" '.[] | select(.name == $l) | "\(.color) \(.description)"' 2>/dev/null)

  if [ -z "$EXISTING" ]; then
    if [ "$DRY_RUN" = "--dry-run" ]; then
      echo "WOULD CREATE: $LABEL ($DESCRIPTION)"
    else
      gh label create "$LABEL" --repo "$GITHUB_REPO" --color "$BOT_LABEL_COLOR" \
        --description "$DESCRIPTION" 2>/dev/null && {
        log "Created label: $LABEL"
        CREATED=$((CREATED + 1))
      }
    fi
  else
    # Check if color/description needs updating
    CURRENT_COLOR=$(echo "$EXISTING" | cut -d' ' -f1)
    CURRENT_DESC=$(echo "$EXISTING" | cut -d' ' -f2-)
    if [ "$CURRENT_COLOR" != "$BOT_LABEL_COLOR" ] || [ "$CURRENT_DESC" != "$DESCRIPTION" ]; then
      if [ "$DRY_RUN" = "--dry-run" ]; then
        echo "WOULD UPDATE: $LABEL (color: $CURRENT_COLOR→$BOT_LABEL_COLOR, desc: '$CURRENT_DESC'→'$DESCRIPTION')"
      else
        gh label edit "$LABEL" --repo "$GITHUB_REPO" --color "$BOT_LABEL_COLOR" \
          --description "$DESCRIPTION" 2>/dev/null && {
          log "Updated label: $LABEL"
          UPDATED=$((UPDATED + 1))
        }
      fi
    fi
  fi
done

# Remove bot:* labels from GitHub that aren't in the registry
for GH_LABEL in $GITHUB_BOT_LABELS; do
  # Check if this label is in the registry
  IN_REGISTRY=$(jq -r --arg l "$GH_LABEL" '.labels[$l] // empty' "$REGISTRY_FILE" 2>/dev/null)

  # Also keep known non-registry bot labels that have special meaning
  case "$GH_LABEL" in
    bot:in-progress|bot:failed|bot:needs-human-review|bot:needs-review|bot:review-changes-needed|bot:reviewed|duplicate)
      continue  # These are system labels, not workspace triggers
      ;;
  esac

  if [ -z "$IN_REGISTRY" ]; then
    if [ "$DRY_RUN" = "--dry-run" ]; then
      echo "WOULD DELETE: $GH_LABEL (not in registry)"
    else
      gh label delete "$GH_LABEL" --repo "$GITHUB_REPO" --yes 2>/dev/null && {
        log "Deleted stale label: $GH_LABEL"
        DELETED=$((DELETED + 1))
      }
    fi
  fi
done

if [ "$DRY_RUN" != "--dry-run" ]; then
  log "Sync complete: created=$CREATED updated=$UPDATED deleted=$DELETED"
fi
