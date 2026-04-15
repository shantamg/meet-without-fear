#!/bin/bash
# setup-worktree.sh — Create git worktree (if on main) and cd into workspace.
# Sourced by run-claude.sh. Expects: SESSION_KEY, SKIP_WORKTREE, COMMAND_SLUG,
# WORKSPACE_NAME, LOGFILE. Sets: WORKTREE_DIR, WORKTREE_BRANCH, WORKSPACE_DIR

cd "$PROJECT_DIR"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# Session-aware invocations need a stable directory for --resume to work
if [ -n "$SESSION_KEY" ]; then
  SKIP_WORKTREE=1
fi

WORKTREE_BRANCH=""
if [ "$SKIP_WORKTREE" -ne 1 ] && [ "$CURRENT_BRANCH" = "main" ]; then
  # Include PID to avoid branch name collisions when multiple agents for the
  # same workspace start within the same second (e.g., milestone dispatching
  # 8 issues to general-pr simultaneously).
  WORKTREE_BRANCH="feat/${COMMAND_SLUG}-${ISSUE_NUMBER:-$$}-$(date +%Y%m%d-%H%M%S)"
  WORKTREE_DIR="/tmp/meet-without-fear-worktree-${COMMAND_SLUG}-$$"
  echo "[$(date)] On main — creating worktree at $WORKTREE_DIR on branch $WORKTREE_BRANCH" >> "$LOGFILE"
  # Retry with jitter — concurrent git operations can fail due to git's internal
  # lock (.git/HEAD.lock, refs lock). When the dispatcher launches multiple agents
  # in rapid succession, they all compete for the same lock.
  WORKTREE_RETRIES=0
  WORKTREE_MAX_RETRIES=5
  while ! git worktree add "$WORKTREE_DIR" -b "$WORKTREE_BRANCH" 2>> "$LOGFILE"; do
    WORKTREE_RETRIES=$((WORKTREE_RETRIES + 1))
    if [ "$WORKTREE_RETRIES" -ge "$WORKTREE_MAX_RETRIES" ]; then
      echo "[$(date)] ERROR: git worktree add failed after $WORKTREE_MAX_RETRIES retries" >> "$LOGFILE"
      exit 1
    fi
    # Random delay 0.5-2.5s to spread out concurrent attempts
    JITTER=$(awk "BEGIN {srand($$+$WORKTREE_RETRIES); printf \"%.1f\", 0.5 + rand() * 2}")
    echo "[$(date)] git worktree add failed (attempt $WORKTREE_RETRIES/$WORKTREE_MAX_RETRIES), retrying in ${JITTER}s" >> "$LOGFILE"
    sleep "$JITTER"
  done
  cd "$WORKTREE_DIR"
fi

# Workspace mode: cd into bot-workspaces/<name>/
WORKSPACE_DIR=""
if [ -n "$WORKSPACE_NAME" ]; then
  WORKSPACE_DIR="$(pwd)/bot-workspaces/${WORKSPACE_NAME}"
  if [ -d "$WORKSPACE_DIR" ]; then
    cd "$WORKSPACE_DIR"
    echo "[$(date)] Workspace mode: cd into $WORKSPACE_DIR" >> "$LOGFILE"
  else
    echo "[$(date)] ERROR: Workspace directory not found: $WORKSPACE_DIR" >> "$LOGFILE"
    exit 1
  fi
fi
