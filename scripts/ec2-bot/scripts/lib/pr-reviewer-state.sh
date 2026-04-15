#!/bin/bash
# pr-reviewer-state.sh — Thin wrapper over github-state.sh for pr-reviewer.
#
# History: this used to maintain its own state file at
# /tmp/slam-bot/pr-reviewer-state.json, populated by a `gh pr list` call
# in Stage 01. As of Phase 3 of the GitHub state migration (#1741), all PR
# metadata comes from the global github-state.json maintained by the
# github-state-scanner daemon. This file now delegates every read to
# github-state.sh, preserving the pr_reviewer_state_* function names so
# stages 02-05 (and any other callers) work without changes.
#
# What changed:
#   - pr_reviewer_state_init        → no-op (no per-session state file to wipe)
#   - pr_reviewer_state_assert_fresh → delegates to github_state_assert_fresh
#   - pr_reviewer_state_pr          → delegates to github_state_pr
#   - pr_reviewer_state_field       → delegates to github_state_pr_field
#   - pr_reviewer_state_has_label   → delegates to github_state_pr_has_label
#   - pr_reviewer_state_pr_numbers  → delegates to github_state_pr_numbers
#   - pr_reviewer_state_write       → removed (Stage 01 no longer writes its own file)
#
# The PR_REVIEWER_STATE_FILE variable is kept as an alias pointing to
# GITHUB_STATE_FILE so that any raw jq calls in CONTEXT.md bash blocks
# that reference $PR_REVIEWER_STATE_FILE still work.
#
# Sourced from CONTEXT.md bash blocks via:
#   source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
#
# shellcheck shell=bash

# Source the global state library (idempotent — safe to source multiple times)
SCRIPT_DIR_PR_STATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR_PR_STATE/github-state.sh"

# Alias: any raw jq against $PR_REVIEWER_STATE_FILE now hits the global file.
PR_REVIEWER_STATE_FILE="$GITHUB_STATE_FILE"
export PR_REVIEWER_STATE_FILE

# pr_reviewer_state_init — No-op. Previously wiped the per-session state file.
# Kept for backward compatibility with the session init block in CLAUDE.md.
pr_reviewer_state_init() {
  # The global state file is managed by github-state-scanner.sh — nothing
  # to initialize or wipe per session.
  :
}

# pr_reviewer_state_assert_fresh — Delegates to github_state_assert_fresh.
# The global state file has a tighter freshness window (120s vs the old 15min)
# because the scanner daemon updates it every ~60s.
pr_reviewer_state_assert_fresh() {
  github_state_assert_fresh
}

# pr_reviewer_state_pr PR_NUMBER — Delegates to github_state_pr.
pr_reviewer_state_pr() {
  github_state_pr "$1"
}

# pr_reviewer_state_field PR_NUMBER FIELD — Delegates to github_state_pr_field.
pr_reviewer_state_field() {
  github_state_pr_field "$1" "$2"
}

# pr_reviewer_state_has_label PR_NUMBER LABEL — Delegates to github_state_pr_has_label.
pr_reviewer_state_has_label() {
  github_state_pr_has_label "$1" "$2"
}

# pr_reviewer_state_pr_numbers — Delegates to github_state_pr_numbers.
pr_reviewer_state_pr_numbers() {
  github_state_pr_numbers
}
