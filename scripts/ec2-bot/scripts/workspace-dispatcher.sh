#!/bin/bash
# workspace-dispatcher.sh — Universal label-driven workspace dispatcher
#
# Scans for open issues/PRs with bot:* labels, maps each to a workspace path
# using label-registry.json, and invokes run-claude.sh --workspace for each.
#
# Usage:
#   workspace-dispatcher.sh                              # Scan and dispatch bot:* labeled issues
#   workspace-dispatcher.sh --scheduled <ws> <prompt>    # Run a scheduled workspace job
#
# Cron entry (replaces all per-job scripts):
#   */5 * * * * /opt/slam-bot/scripts/workspace-dispatcher.sh
#
# Concurrency:
#   MAX_CONCURRENT controls the global limit (default 5).
#   RESERVED_INTERACTIVE_SLOTS (default 2) reserves slots for human-triggered work.
#   Scheduled jobs can only use (MAX_CONCURRENT - RESERVED_INTERACTIVE_SLOTS) = 3 slots.
#   Label-driven dispatch uses the full MAX_CONCURRENT limit.
#   Deduplication is handled by atomic claim files (not locks).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
source "$SCRIPT_DIR/lib/shared.sh"

# Phase 2 migration: read PR/issue metadata from the github-state-scanner
# state file when it's fresh, fall back to gh calls otherwise. This is
# defensive — the scanner may be down (during deploy, after a crash, or
# during local dev), and the dispatcher must keep working in that case.
source "$SCRIPT_DIR/lib/github-state.sh"

LOGFILE="${BOT_LOG_DIR}/workspace-dispatcher.log"

# Ensure directories exist
mkdir -p "$CLAIMS_DIR" "$(dirname "$LOGFILE")" 2>/dev/null || true

# ─── Helper functions ────────────────────────────────────────────────────────

log() { echo "[$(date)] $1" >> "$LOGFILE"; }

# dispatcher_state_file_usable — returns 0 if the github-state-scanner state
# file exists and is fresh enough to use for this dispatch cycle.
# Returns 1 (silently) otherwise so callers can fall back to gh calls.
#
# We deliberately suppress github_state_assert_fresh's stderr output here:
# the dispatcher runs every minute via cron and a missing/stale state file
# during the rollout would otherwise spam the bot-ops channel until the
# scanner deploys. The fallback path logs its own clear message instead.
dispatcher_state_file_usable() {
  [ -f "$GITHUB_STATE_FILE" ] || return 1
  github_state_assert_fresh >/dev/null 2>&1
}

# count_running_agents() — provided by lib/shared.sh

# Check if an issue is already being worked on (agent active or claim held)
is_issue_active() {
  local issue_number="$1"
  local label="${2:-}"

  # Check _active/ agent directories for this issue number
  for agent_dir in "$ACTIVE_DIR"/agent-*; do
    [ -d "$agent_dir" ] || continue
    local pid
    pid=$(basename "$agent_dir" | sed 's/^agent-//')
    # Skip dead processes
    if [[ "$pid" =~ ^[0-9]+$ ]] && ! kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    # Check meta.json for issue number
    if [ -f "$agent_dir/meta.json" ]; then
      local agent_issue
      agent_issue=$(jq -r '.issueNumber // empty' "$agent_dir/meta.json" 2>/dev/null || echo "")
      if [ "$agent_issue" = "$issue_number" ]; then
        return 0  # Active
      fi
    fi
  done

  # Check dispatcher claim files (prevents re-dispatching within the same cycle
  # or across rapid cycles while the agent is still starting up)
  local claim_file="$CLAIMS_DIR/claimed-ws-dispatch-${issue_number}.txt"
  if [ -f "$claim_file" ]; then
    local claim_pid
    claim_pid=$(cat "$claim_file" 2>/dev/null || echo "")
    if [ -n "$claim_pid" ] && [[ "$claim_pid" =~ ^[0-9]+$ ]] && kill -0 "$claim_pid" 2>/dev/null; then
      return 0  # Claimed and still running
    fi
    # Stale claim — remove it
    rm -f "$claim_file"
  fi

  # Check cooldown for keep_label issues (prevents infinite relaunch loop).
  # After a keep_label agent finishes, it writes a cooldown timestamp.
  # Per-label cooldown_secs in label-registry.json overrides the default.
  # Set cooldown_secs: 0 for interactive workspaces (e.g., bot:needs-info).
  local cooldown_file="$CLAIMS_DIR/cooldown-${issue_number}.txt"
  if [ -f "$cooldown_file" ]; then
    # Read per-label cooldown from registry, fall back to env var, then 30 min default
    local cooldown_secs="${KEEP_LABEL_COOLDOWN_SECS:-1800}"
    if [ -n "$label" ]; then
      local label_cooldown
      label_cooldown=$(jq -r --arg label "$label" '.labels[$label].cooldown_secs // empty' "$REGISTRY_FILE" 2>/dev/null || echo "")
      if [ -n "$label_cooldown" ]; then
        cooldown_secs="$label_cooldown"
      fi
    fi
    # cooldown_secs=0 means no cooldown — skip the file check entirely
    if [ "$cooldown_secs" -gt 0 ]; then
      local last_completed
      last_completed=$(cat "$cooldown_file" 2>/dev/null || echo "0")
      local now
      now=$(date +%s)
      local elapsed=$(( now - last_completed ))
      if [ "$elapsed" -lt "$cooldown_secs" ]; then
        return 0  # Still in cooldown
      fi
    fi
    # Cooldown expired or disabled — clean up the file
    rm -f "$cooldown_file"
  fi

  # Check for "waiting for human" marker. Keep-label workspaces (spec-builder,
  # needs-info) write this file when they exit in a "waiting for human" state.
  # The pipeline-monitor clears it when a human responds (Check 7). This
  # replaces burning a full Claude invocation per cooldown cycle with a zero-cost
  # file existence check.
  local waiting_file="$CLAIMS_DIR/waiting-human-${issue_number}.txt"
  if [ -f "$waiting_file" ]; then
    return 0  # Still waiting for human — skip dispatch
  fi

  return 1  # Not active
}

# Resolve workspace path from a bot:* label
resolve_workspace() {
  local label="$1"
  jq -r --arg label "$label" '.labels[$label].workspace // empty' "$REGISTRY_FILE" 2>/dev/null
}

# Resolve entry stage from a bot:* label
resolve_entry_stage() {
  local label="$1"
  jq -r --arg label "$label" '.labels[$label].entry_stage // empty' "$REGISTRY_FILE" 2>/dev/null
}

# Resolve model override from a bot:* label (empty = use default)
resolve_model() {
  local label="$1"
  jq -r --arg label "$label" '.labels[$label].model // empty' "$REGISTRY_FILE" 2>/dev/null
}

# Resolve persona for vector memory search scoping (empty = use default)
resolve_persona() {
  local label="$1"
  jq -r --arg label "$label" '.labels[$label].persona // empty' "$REGISTRY_FILE" 2>/dev/null
}

# Resolve model by workspace name (for scheduled jobs that don't have a label).
# Finds the first label entry whose workspace matches and returns its model.
resolve_model_by_workspace() {
  local ws="$1"
  jq -r --arg ws "$ws" --arg wss "${ws}/" \
    '[.labels[] | select(.workspace == $ws or .workspace == $wss)] | first | .model // empty' \
    "$REGISTRY_FILE" 2>/dev/null
}

# Resolve effort level from a bot:* label (empty = use default)
resolve_effort() {
  local label="$1"
  jq -r --arg label "$label" '.labels[$label].effort // empty' "$REGISTRY_FILE" 2>/dev/null
}

# Resolve persona by workspace name (for scheduled jobs that don't have a label).
resolve_persona_by_workspace() {
  local ws="$1"
  jq -r --arg ws "$ws" --arg wss "${ws}/" \
    '[.labels[] | select(.workspace == $ws or .workspace == $wss)] | first | .persona // empty' \
    "$REGISTRY_FILE" 2>/dev/null
}

# Resolve effort by workspace name (for scheduled jobs that don't have a label).
resolve_effort_by_workspace() {
  local ws="$1"
  jq -r --arg ws "$ws" --arg wss "${ws}/" \
    '[.labels[] | select(.workspace == $ws or .workspace == $wss)] | first | .effort // empty' \
    "$REGISTRY_FILE" 2>/dev/null
}

# ─── Scheduled mode (checked BEFORE the dispatcher lock) ─────────────────────
# Scheduled jobs use a per-workspace lock so they never race with the label scanner.
# Without this, once-a-day jobs (daily-digest, docs-audit, security-audit) were
# silently dropped when the label scanner (every minute) won the shared lock.
if [ "${1:-}" = "--scheduled" ]; then
  SCHED_WORKSPACE="${2:?--scheduled requires a workspace name}"
  SCHED_PROMPT="${3:-Process this scheduled workspace job.}"

  # Per-workspace lock prevents duplicate scheduled runs of the same workspace
  SCHED_LOCK="${LOCK_PREFIX}-scheduled-${SCHED_WORKSPACE}.lock"
  if [ -f "$SCHED_LOCK" ]; then
    SCHED_LOCK_PID=$(cat "$SCHED_LOCK" 2>/dev/null || echo "")
    if [ -n "$SCHED_LOCK_PID" ] && kill -0 "$SCHED_LOCK_PID" 2>/dev/null; then
      exit 0  # Previous scheduled run still active
    fi
    rm -f "$SCHED_LOCK"
  fi
  echo "$$" > "$SCHED_LOCK"
  # Chain gh_cost_trace_end so the auto-trace trap installed by
  # lib/gh-cost-trace.sh still fires in the scheduled path.
  trap 'gh_cost_trace_end 2>/dev/null || true; rm -f "$SCHED_LOCK"' EXIT

  log "Scheduled dispatch: workspace=$SCHED_WORKSPACE"

  # Run bash pre-check if one exists for this workspace.
  # Pre-check scripts exit 0 = work found (proceed), exit 1 = nothing to do (skip Claude).
  PRECHECK_SCRIPT="$SCRIPT_DIR/${SCHED_WORKSPACE}-precheck.sh"
  if [ -x "$PRECHECK_SCRIPT" ]; then
    if ! PRECHECK_OUTPUT=$("$PRECHECK_SCRIPT" 2>&1); then
      log "Pre-check for $SCHED_WORKSPACE found nothing to do — skipping Claude"
      exit 0
    fi
    log "Pre-check for $SCHED_WORKSPACE found work: $PRECHECK_OUTPUT"
  fi

  # Scheduled jobs use a reduced concurrency limit, reserving slots for interactive work
  SCHED_MAX=$((MAX_CONCURRENT - RESERVED_INTERACTIVE_SLOTS))
  RUNNING=$(count_running_agents)
  if [ "$RUNNING" -ge "$SCHED_MAX" ]; then
    log "Skipping scheduled $SCHED_WORKSPACE — $RUNNING agents already running (scheduled max $SCHED_MAX, reserving $RESERVED_INTERACTIVE_SLOTS for interactive)"
    exit 0
  fi

  SCHED_MODEL=$(resolve_model_by_workspace "$SCHED_WORKSPACE")
  SCHED_PERSONA=$(resolve_persona_by_workspace "$SCHED_WORKSPACE")
  SCHED_EFFORT=$(resolve_effort_by_workspace "$SCHED_WORKSPACE")
  MODEL="$SCHED_MODEL" EFFORT="${SCHED_EFFORT:-high}" CLAUDE_PERSONA="${SCHED_PERSONA:-default}" PRIORITY=low "$SCRIPT_DIR/run-claude.sh" --workspace "$SCHED_WORKSPACE" "$SCHED_PROMPT" &
  log "Launched scheduled workspace=$SCHED_WORKSPACE (PID $!, priority=low${SCHED_MODEL:+, model=$SCHED_MODEL}${SCHED_PERSONA:+, persona=$SCHED_PERSONA}${SCHED_EFFORT:+, effort=$SCHED_EFFORT})"
  exit 0
fi

# No dispatcher lock needed — claim files (set -o noclobber) handle deduplication
# atomically. Overlapping label scans just race on claims; only one wins per issue.

# ─── Validate registry ──────────────────────────────────────────────────────
if [ ! -f "$REGISTRY_FILE" ]; then
  log "ERROR: Label registry not found: $REGISTRY_FILE"
  exit 1
fi

# ─── Clean up false bot:failed labels ────────────────────────────────────────
# Issues labeled bot:failed that already have a linked PR (open or merged) are false positives.
# Previously only checked --state open, which missed merged PRs — leaving stale bot:failed labels.
#
# Phase 2: read this list from the github-state file when fresh — that's
# zero gh API cost. Falls back to a direct gh issue list call if the
# scanner is not available.
if dispatcher_state_file_usable; then
  FAILED_ISSUES=$(github_state_issues_with_label "bot:failed" 2>/dev/null) || FAILED_ISSUES=""
else
  FAILED_ISSUES=$(gh issue list --repo "$GITHUB_REPO" --label "bot:failed" --state open \
    --json number --jq '.[].number' 2>/dev/null) || FAILED_ISSUES=""
fi
for FAILED_NUM in $FAILED_ISSUES; do
  # Phase 2: use closing_issues from state file (canonical closing directives,
  # not full-text search). Falls back to gh pr list when state file is stale.
  if dispatcher_state_file_usable; then
    HAS_PR=$(github_state_prs_fixing_issue_count "$FAILED_NUM" 2>/dev/null || echo "0")
  else
    HAS_PR=$(gh pr list --repo "$GITHUB_REPO" --search "Fixes #$FAILED_NUM" --state all --json number --jq 'length' 2>/dev/null || echo "0")
  fi
  if [ "$HAS_PR" -gt 0 ]; then
    gh issue edit "$FAILED_NUM" --repo "$GITHUB_REPO" --remove-label "bot:failed" 2>/dev/null || true
    log "Removed false bot:failed from #$FAILED_NUM (PR exists)"
  fi
done

# ─── Clear stale gh CLI cache ─────────────────────────────────────────────────
# gh issue list uses GraphQL with a 24h cache TTL. If a rate-limit error gets
# cached, ALL subsequent gh issue list calls fail until the cache expires — even
# after the rate limit resets. Clear the cache at the start of each cycle.
rm -rf "${HOME}/.cache/gh" 2>/dev/null || true

# ─── Fetch all open issues/PRs with bot:* labels ─────────────────────────────
log "Scanning for bot:* labeled items..."

# Get all label-triggered bot:* labels from the registry (preserving order so
# the dispatch loop visits them in the same sequence as before).
WS_LABELS=$(jq -r '.labels | to_entries[] | select(.value.trigger == "label") | .key' "$REGISTRY_FILE" 2>/dev/null)

if [ -z "$WS_LABELS" ]; then
  log "No label-triggered entries in registry"
  exit 0
fi

# Build the list of trigger labels — needed by both code paths below.
# History: previously this loop made one `gh issue list --label X` call per
# label (17 calls/cycle at time of writing), burning ~1020 GraphQL points/hour
# on the scan alone. PR #1641 collapsed that into a single `search/issues`
# call against the SEARCH bucket (30/min = 1800/hr, separate from GraphQL).
# Phase 2 of the budget plan moves this one step further: when the
# github-state-scanner daemon is up, we read both the open-PR and open-issue
# sets from the local state file and filter client-side, costing zero API
# calls. The fallback below preserves the PR #1641 search-call path so the
# dispatcher keeps working when the scanner is missing.
LABEL_OR_LIST=$(jq -r '[.labels | to_entries[] | select(.value.trigger == "label") | "\"" + .key + "\""] | join(",")' "$REGISTRY_FILE" 2>/dev/null)
TRIGGER_LABELS_JSON=$(jq -c '[.labels | to_entries[] | select(.value.trigger == "label") | .key]' "$REGISTRY_FILE" 2>/dev/null)

if dispatcher_state_file_usable; then
  # State-file path: filter the local PRs+issues sets to anything that has
  # AT LEAST ONE trigger label, and project the same shape the gh
  # search/issues call used to return. PRs and issues are both included
  # because some bot:* labels are PR-bound (e.g., bot:review-impl) and the
  # original search call returned both.
  ALL_ITEMS=$(jq -c \
    --argjson trig "$TRIGGER_LABELS_JSON" \
    '
    def has_trigger: (.labels // []) | any(. as $l | $trig | index($l));
    [
      ((.prs // {})    | to_entries[] | .value | select(has_trigger)
        | { number, title, labels, assignees: ([.author_login] | map(select(.))) }),
      ((.issues // {}) | to_entries[] | .value | select(has_trigger)
        | { number, title, labels, assignees: (.assignees // []) })
    ]
    ' "$GITHUB_STATE_FILE" 2>/dev/null) || ALL_ITEMS="[]"
  log "Label scan source: github-state file ($(echo "$ALL_ITEMS" | jq 'length' 2>/dev/null || echo 0) items)"
else
  SEARCH_Q="repo:$GITHUB_REPO is:open label:$LABEL_OR_LIST"
  SEARCH_ERR=$(mktemp)
  ALL_ITEMS=$(gh api -X GET search/issues \
    --field q="$SEARCH_Q" \
    --field per_page=100 \
    --jq '[.items[] | {number, title, labels: [.labels[].name], assignees: [.assignees[].login]}]' \
    2>"$SEARCH_ERR") || {
    ERR=$(cat "$SEARCH_ERR" 2>/dev/null || true)
    rm -f "$SEARCH_ERR"
    # Non-rate-limit failure — log and exit cleanly so cron retries next cycle.
    log "Search API error — skipping this cycle: $(echo "$ERR" | head -1)"
    exit 0
  }
  rm -f "$SEARCH_ERR"
  log "Label scan source: gh search/issues fallback (state file unavailable)"
fi

if [ -z "$ALL_ITEMS" ] || [ "$ALL_ITEMS" = "[]" ]; then
  log "Dispatch cycle complete. dispatched=0 running=$(count_running_agents)/$MAX_CONCURRENT"
  exit 0
fi

TOTAL_FOUND=$(echo "$ALL_ITEMS" | jq 'length' 2>/dev/null || echo "0")
log "Found $TOTAL_FOUND bot:* labeled item(s) across all trigger labels"

DISPATCHED=0

for WS_LABEL in $WS_LABELS; do
  # Check concurrency before each label scan
  RUNNING=$(count_running_agents)
  if [ "$RUNNING" -ge "$MAX_CONCURRENT" ]; then
    log "Concurrency limit reached ($RUNNING/$MAX_CONCURRENT) — stopping dispatch"
    break
  fi

  # Filter the already-fetched items to those matching this label (client-side,
  # no API call). Each item's labels field is a flat list of label name strings.
  ITEMS=$(echo "$ALL_ITEMS" | jq -c --arg lbl "$WS_LABEL" '[.[] | select(.labels[]? == $lbl)]')
  ITEM_COUNT=$(echo "$ITEMS" | jq 'length' 2>/dev/null || echo "0")
  if [ "$ITEM_COUNT" -eq 0 ]; then
    continue
  fi

  log "Found $ITEM_COUNT item(s) with label $WS_LABEL"

  # Process each item — use process substitution to avoid subshell (keeps DISPATCHED in scope)
  while IFS= read -r ITEM; do
    ISSUE_NUMBER=$(echo "$ITEM" | jq -r '.number')
    ISSUE_TITLE=$(echo "$ITEM" | jq -r '.title')

    # Skip issues already labeled 'duplicate' (labels are flat strings now)
    IS_DUPLICATE=$(echo "$ITEM" | jq -r '.labels[]?' 2>/dev/null | grep -c '^duplicate$' || true)
    IS_DUPLICATE=${IS_DUPLICATE:-0}
    if [ "$IS_DUPLICATE" -gt 0 ]; then
      log "Skipping #$ISSUE_NUMBER ($ISSUE_TITLE) — labeled duplicate"
      continue
    fi

    # Re-check concurrency inside the loop
    RUNNING=$(count_running_agents)
    if [ "$RUNNING" -ge "$MAX_CONCURRENT" ]; then
      log "Concurrency limit ($RUNNING/$MAX_CONCURRENT) — deferring #$ISSUE_NUMBER"
      continue
    fi

    # Skip if already being worked on
    if is_issue_active "$ISSUE_NUMBER" "$WS_LABEL"; then
      log "Skipping #$ISSUE_NUMBER ($ISSUE_TITLE) — already active"
      continue
    fi

    # Resolve workspace from label
    WORKSPACE=$(resolve_workspace "$WS_LABEL")
    if [ -z "$WORKSPACE" ]; then
      log "ERROR: No workspace mapped for label $WS_LABEL"
      continue
    fi

    # Remove trailing slash for the --workspace flag
    WORKSPACE="${WORKSPACE%/}"

    ENTRY_STAGE=$(resolve_entry_stage "$WS_LABEL")
    WS_MODEL=$(resolve_model "$WS_LABEL")
    WS_PERSONA=$(resolve_persona "$WS_LABEL")
    WS_EFFORT=$(resolve_effort "$WS_LABEL")

    # Check if this workspace manages its own label lifecycle (multi-pass workspaces
    # like expert-review that need the label to persist across invocations)
    KEEP_LABEL=$(jq -r --arg label "$WS_LABEL" '.labels[$label].keep_label // false' "$REGISTRY_FILE" 2>/dev/null)

    # Verify workspace directory exists
    if [ ! -d "$PROJECT_DIR/bot-workspaces/$WORKSPACE" ]; then
      log "ERROR: Workspace directory not found: bot-workspaces/$WORKSPACE"
      continue
    fi

    # Skip issues that already have a linked open or merged PR — prevents
    # re-dispatch when the trigger label survived cleanup (e.g., GitHub API failure).
    # This was the root cause of the #626 runaway: the label persisted after PR merge,
    # causing 5 duplicate PRs to be created in rapid succession.
    # Note: --state all would also match CLOSED (abandoned) PRs — use open + merged only.
    #
    # IMPORTANT: this guard is SKIPPED for keep_label workspaces (expert-review,
    # milestone-builder, etc.). Those are multi-pass discussion/review workflows
    # that are NOT "completed by a PR". In practice, the guard was stripping
    # `bot:expert-review` from issues as soon as ANY PR mentioned the issue
    # number in prose, because `gh pr list --search "Fixes #N"` is full-text
    # search and matches body text (not just `Fixes #N` closing directives).
    # Concrete example: #1600's expert review got stripped at 2026-04-11
    # 00:16:04 UTC because #1645 — the dup-detector fix PR — mentioned #1600
    # as its example case in the PR body, and the search treated that prose
    # mention as if it were a closing directive. Multi-pass workspaces have
    # their own cooldown mechanism (see is_issue_active() above) that prevents
    # runaway, so they don't need this guard and actively break in its presence.
    if [ "$KEEP_LABEL" != "true" ]; then
      # Phase 2: use closing_issues from state file. The state file only tracks
      # OPEN PRs, so merged PRs won't appear — but that's fine: if a PR was
      # merged, the trigger label should already have been removed. The fallback
      # path still checks both open + merged for the rare case the state file
      # is unavailable and a stale label survived a merge.
      if dispatcher_state_file_usable; then
        EXISTING_PR=$(github_state_prs_fixing_issue_count "$ISSUE_NUMBER" 2>/dev/null || echo "0")
      else
        EXISTING_OPEN=$(gh pr list --repo "$GITHUB_REPO" --search "Fixes #$ISSUE_NUMBER" --state open --json number --jq 'length' 2>/dev/null || echo "0")
        EXISTING_MERGED=$(gh pr list --repo "$GITHUB_REPO" --search "Fixes #$ISSUE_NUMBER" --state merged --json number --jq 'length' 2>/dev/null || echo "0")
        EXISTING_PR=$(( EXISTING_OPEN + EXISTING_MERGED ))
      fi
      if [ "$EXISTING_PR" -gt 0 ]; then
        log "Skipping #$ISSUE_NUMBER ($ISSUE_TITLE) — PR already exists, removing stale trigger label"
        gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --remove-label "$WS_LABEL" 2>/dev/null || true
        continue
      fi
    fi

    # Check for duplicate issues before spending an agent slot
    if "$SCRIPT_DIR/check-duplicates.sh" "$ISSUE_NUMBER" 2>/dev/null; then
      : # No duplicates found — proceed with dispatch
    else
      DUP_EXIT=$?
      if [ "$DUP_EXIT" -eq 1 ]; then
        log "Skipping #$ISSUE_NUMBER — duplicate detected by check-duplicates.sh"
        # Remove the trigger label so it doesn't re-dispatch
        gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --remove-label "$WS_LABEL" 2>/dev/null || true
        continue
      fi
      # Exit code 2 = error — proceed with dispatch to be safe
      log "Duplicate check error for #$ISSUE_NUMBER (exit=$DUP_EXIT) — proceeding with dispatch"
    fi

    # Claim this issue (atomic, prevents double dispatch).
    # Write the dispatcher PID ($$) immediately — NOT "pending". A concurrent dispatcher
    # that sees a non-numeric value would incorrectly treat the claim as stale and delete it,
    # allowing double dispatch. Using $$ ensures the claim is always valid while this
    # dispatcher process is alive; the child PID is written after fork (line below).
    CLAIM_FILE="$CLAIMS_DIR/claimed-ws-dispatch-${ISSUE_NUMBER}.txt"
    if ! (set -o noclobber; echo "$$" > "$CLAIM_FILE") 2>/dev/null; then
      log "Skipping #$ISSUE_NUMBER — claim contention"
      continue
    fi

    # Build the prompt with issue context
    PROMPT="Process GitHub issue #${ISSUE_NUMBER} according to this workspace's instructions.

Issue: #${ISSUE_NUMBER}
Title: ${ISSUE_TITLE}
Label: ${WS_LABEL}
Workspace: ${WORKSPACE}
${ENTRY_STAGE:+Entry Stage: ${ENTRY_STAGE}}

IMPORTANT: First read the full issue with: gh issue view ${ISSUE_NUMBER} --repo ${GITHUB_REPO}
${ENTRY_STAGE:+Then read stages/${ENTRY_STAGE}/CONTEXT.md for your instructions. You are entering at stage ${ENTRY_STAGE} in STANDALONE mode (no prior stage output). Follow the standalone completion instructions in the CONTEXT.md.}
${ENTRY_STAGE:-Then follow the workspace CONTEXT.md instructions to process it.}"

    log "Dispatching #$ISSUE_NUMBER ($ISSUE_TITLE) -> workspace=$WORKSPACE${ENTRY_STAGE:+ stage=$ENTRY_STAGE}${WS_MODEL:+ model=$WS_MODEL}"

    # Signal on the issue that an agent has picked it up
    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --add-label "bot:in-progress" 2>/dev/null || true

    # Build session flag for multi-pass workspaces (keep_label = true).
    # Session continuity gives the agent memory across ticks.
    SESSION_FLAG=""
    if [ "$KEEP_LABEL" = "true" ]; then
      SESSION_FLAG="--session ws-${WORKSPACE}-${ISSUE_NUMBER}"
    fi

    # Launch in background, update claim with actual PID
    (
      set +e
      MODEL="$WS_MODEL" EFFORT="${WS_EFFORT:-high}" CLAUDE_PERSONA="${WS_PERSONA:-default}" ISSUE_NUMBER="$ISSUE_NUMBER" PRIORITY=normal "$SCRIPT_DIR/run-claude.sh" --workspace "$WORKSPACE" $SESSION_FLAG "$PROMPT"
      EXIT_CODE=$?

      # Clean up claim on completion
      rm -f "$CLAIM_FILE"

      # Remove in-progress label
      gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --remove-label "bot:in-progress" 2>/dev/null || true

      # Remove trigger label to prevent re-dispatch loop — UNLESS keep_label is set.
      # Multi-pass workspaces (e.g., expert-review) manage their own label lifecycle
      # and need the label to persist so the dispatcher picks them up on the next tick.
      #
      # Re-read keep_label from the registry at cleanup time (not just the inherited
      # variable from dispatch time) so that git-pull updates are reflected even if
      # the registry was updated after the agent was launched.
      KEEP_LABEL_NOW=$(jq -r --arg label "$WS_LABEL" '.labels[$label].keep_label // false' "$REGISTRY_FILE" 2>/dev/null || echo "")
      if [ "$KEEP_LABEL" = "true" ] || [ "$KEEP_LABEL_NOW" = "true" ]; then
        echo "[$(date)] Preserving label $WS_LABEL on #$ISSUE_NUMBER (keep_label=true, multi-pass workspace)" >> "$LOGFILE"
        # Write cooldown timestamp to prevent immediate re-dispatch
        date +%s > "$CLAIMS_DIR/cooldown-${ISSUE_NUMBER}.txt"
      else
        gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --remove-label "$WS_LABEL" 2>/dev/null || true
      fi

      if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date)] Completed #$ISSUE_NUMBER (workspace=$WORKSPACE)" >> "$LOGFILE"
      else
        # Non-zero exit doesn't necessarily mean failure — Claude CLI exits non-zero
        # for benign reasons (context limit, tool errors). Check if work was actually done.

        # Check 1: PR exists in any state (open, merged, or closed).
        # Phase 2: use closing_issues from state file when fresh. The state
        # file only tracks open PRs, so a just-merged PR may not appear —
        # but that's a success case (label already removed). Fall back to
        # gh pr list when the state file is unavailable.
        if dispatcher_state_file_usable; then
          HAS_PR=$(github_state_prs_fixing_issue_count "$ISSUE_NUMBER" 2>/dev/null || echo "0")
        else
          HAS_PR=$(gh pr list --repo "$GITHUB_REPO" --search "Fixes #$ISSUE_NUMBER" --state all --json number --jq 'length' 2>/dev/null || echo "0")
        fi
        if [ "$HAS_PR" -gt 0 ]; then
          echo "[$(date)] Agent exited $EXIT_CODE but PR exists for #$ISSUE_NUMBER — treating as success" >> "$LOGFILE"
        else
          # Check 2: Agent posted a comment (work was done even without a PR — audits, milestones, etc.)
          # Note: comments are not in the state file, so this remains a direct API call.
          BOT_COMMENTED=$(gh api "repos/$GITHUB_REPO/issues/$ISSUE_NUMBER/comments?per_page=5&direction=desc" \
            --jq "[.[] | select($BOT_USER_JQ_MATCH)] | length" 2>/dev/null || echo "0")
          if [ "$BOT_COMMENTED" -gt 0 ]; then
            echo "[$(date)] Agent exited $EXIT_CODE but posted comments on #$ISSUE_NUMBER — treating as success" >> "$LOGFILE"
          else
            echo "[$(date)] Failed #$ISSUE_NUMBER (workspace=$WORKSPACE, exit=$EXIT_CODE) — no PR or comments found" >> "$LOGFILE"
            gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPO" --add-label "bot:failed" 2>/dev/null || true
          fi
        fi
      fi
    ) &

    CHILD_PID=$!
    echo "$CHILD_PID" > "$CLAIM_FILE"

    log "Launched agent for #$ISSUE_NUMBER (PID $CHILD_PID, workspace=$WORKSPACE)"
    DISPATCHED=$((DISPATCHED + 1))

    # Small delay between dispatches to avoid overwhelming GitHub API
    sleep 1
  done < <(echo "$ITEMS" | jq -c '.[]')
done

log "Dispatch cycle complete. dispatched=$DISPATCHED running=$(count_running_agents)/$MAX_CONCURRENT"
