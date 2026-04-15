#!/bin/bash
# activity-journal.sh — Persistent activity journal for bot continuity.
#
# Provides two functions:
#   write_journal_entry()  — Appends a session summary to the journal (called at cleanup)
#   build_journal_context() — Returns recent journal entries for prompt injection
#
# Journal file: $BOT_STATE_DIR/activity-journal.jsonl (one JSON object per line)
# Rendered on read into a compact markdown block for the prompt.
#
# Sourced by run-claude.sh (via cleanup-agent.sh and invoke-claude.sh).
# Expects config.sh to be loaded (for BOT_STATE_DIR).

ACTIVITY_JOURNAL="${BOT_STATE_DIR}/activity-journal.jsonl"

# ── write_journal_entry ─────────────────────────────────────────────────────
# Append a structured entry to the activity journal.
#
# Reads from env/args set by run-claude.sh:
#   COMMAND_SLUG, WORKSPACE_NAME, CHANNEL, PROVENANCE_REQUESTER,
#   PROVENANCE_CHANNEL, PROVENANCE_MESSAGE, AGENT_HOME (for meta.json),
#   WORKTREE_BRANCH
#
# Extracts git commits made during the session and computes duration.
write_journal_entry() {
  local now_utc
  now_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Read start time from meta.json (if agent home still exists)
  local started_at=""
  local duration_min=""
  if [ -f "$AGENT_HOME/meta.json" ]; then
    started_at=$(jq -r '.startedAt // empty' "$AGENT_HOME/meta.json" 2>/dev/null || true)
  fi

  # Compute duration in minutes
  if [ -n "$started_at" ]; then
    local start_epoch end_epoch
    # macOS date vs GNU date compatibility
    if date -j -f "%Y-%m-%dT%H:%M:%SZ" "$started_at" +%s >/dev/null 2>&1; then
      start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$started_at" +%s 2>/dev/null || echo "")
    else
      start_epoch=$(date -d "$started_at" +%s 2>/dev/null || echo "")
    fi
    end_epoch=$(date +%s)
    if [ -n "$start_epoch" ] && [ -n "$end_epoch" ]; then
      duration_min=$(( (end_epoch - start_epoch) / 60 ))
    fi
  fi

  # Get current branch
  local branch
  branch="${WORKTREE_BRANCH:-$(git branch --show-current 2>/dev/null || echo "unknown")}"

  # Get commits made during this session (since start time), flattened to single line
  local commits=""
  local commit_count=0
  if [ -n "$started_at" ]; then
    local raw_commits
    raw_commits=$(git log --since="$started_at" --oneline --no-merges 2>/dev/null | head -5 || true)
    if [ -n "$raw_commits" ]; then
      commit_count=$(echo "$raw_commits" | wc -l | tr -d ' ')
      # Join multi-line commits with " | " to keep JSONL single-line
      commits=$(echo "$raw_commits" | tr '\n' '|' | sed 's/|$//; s/|/ | /g')
    fi
  fi

  # Truncate provenance message to 120 chars
  local request="${PROVENANCE_MESSAGE:-(scheduled)}"
  if [ ${#request} -gt 120 ]; then
    request="${request:0:117}..."
  fi

  # Workspace or command slug
  local workspace="${WORKSPACE_NAME:-$COMMAND_SLUG}"

  # Build JSON entry (guaranteed single line via jq -c)
  local entry
  entry=$(jq -nc \
    --arg ts "$now_utc" \
    --arg workspace "$workspace" \
    --arg channel "${PROVENANCE_CHANNEL:-}" \
    --arg requester "${PROVENANCE_REQUESTER:-}" \
    --arg request "$request" \
    --arg branch "$branch" \
    --arg commits "$commits" \
    --argjson commit_count "$commit_count" \
    --arg duration "${duration_min:-0}" \
    '{ts: $ts, workspace: $workspace, channel: $channel, requester: $requester, request: $request, branch: $branch, commits: $commits, commit_count: $commit_count, duration: ($duration | tonumber)}' \
  2>/dev/null)

  if [ -n "$entry" ]; then
    echo "$entry" >> "$ACTIVITY_JOURNAL" 2>/dev/null || true
  fi
}

# ── build_journal_context ───────────────────────────────────────────────────
# Read the journal and render recent entries as a compact markdown block.
# Returns empty string if no journal or no recent entries.
#
# Uses a single jq invocation to render all entries (no per-line subshells).
# Output is capped at 20 entries to keep token count reasonable (~800-1200 tokens).
build_journal_context() {
  [ -f "$ACTIVITY_JOURNAL" ] || return 0
  [ -s "$ACTIVITY_JOURNAL" ] || return 0

  # Render all entries in one jq call (reads JSONL natively)
  local rendered
  rendered=$(tail -20 "$ACTIVITY_JOURNAL" | jq -r '
    # Build header line: "- TIMESTAMP — workspace (channel, requester) — Xmin"
    "- " + .ts + " — " + .workspace
    + (if .channel != "" then
        " (" + .channel + (if .requester != "" then ", " + .requester else "" end) + ")"
      else "" end)
    + (if .duration > 0 then " — " + (.duration | tostring) + "min" else "" end),

    # Request line (if not scheduled)
    (if .request != "" and .request != "(scheduled)" then
      "  Request: \"" + .request + "\""
    else empty end),

    # Commits line (if any)
    (if .commit_count > 0 and .commits != "" then
      "  Commits (" + (.commit_count | tostring) + "): " + .commits
    else empty end),

    # Branch line (if not main/unknown)
    (if .branch != "" and .branch != "main" and .branch != "unknown" then
      "  Branch: " + .branch
    else empty end)
  ' 2>/dev/null)

  [ -n "$rendered" ] || return 0

  echo "[RECENT BOT ACTIVITY — last 48h]"
  echo "Use this to maintain continuity across sessions. You are an autonomous bot."
  echo ""
  echo "$rendered"
  echo ""
  echo "[END RECENT BOT ACTIVITY]"
}
