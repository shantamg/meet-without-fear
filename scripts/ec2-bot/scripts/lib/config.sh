#!/bin/bash
# config.sh — Central bot configuration.
#
# ALL configurable values live here. Scripts source this file instead of
# hardcoding paths, repo names, or channel IDs. To adapt this bot for a
# different project, only this file needs to change.
#
# Sourced by run-claude.sh (and transitively by all lib/ scripts).
# Can also be sourced directly by standalone scripts that don't go through run-claude.sh.
#
# Values can be overridden by environment variables (e.g., in .env).

# ── Identity ────────────────────────────────────────────────────────────────
BOT_NAME="${BOT_NAME:-slam-bot}"
GITHUB_REPO="${GITHUB_REPO:-shantamg/meet-without-fear}"

# ── Paths ───────────────────────────────────────────────────────────────────
BOT_HOME="${BOT_HOME:-/opt/slam-bot}"
BOT_ENV_FILE="${BOT_ENV_FILE:-${BOT_HOME}/.env}"
BOT_LOG_DIR="${BOT_LOG_DIR:-/var/log/${BOT_NAME}}"
BOT_STATE_DIR="${BOT_STATE_DIR:-${BOT_HOME}/state}"
BOT_QUEUE_DIR="${BOT_QUEUE_DIR:-${BOT_HOME}/queue}"

# Repository and workspace paths
REPO_ROOT="${REPO_ROOT:-${HOME}/meet-without-fear}"
PROJECT_DIR="${PROJECT_DIR:-${REPO_ROOT}}"
WORKSPACES_DIR="${WORKSPACES_DIR:-${PROJECT_DIR}/bot-workspaces}"
ACTIVE_DIR="${ACTIVE_DIR:-${WORKSPACES_DIR}/_active}"

# Script paths (after symlink, these point to the repo)
BOT_SCRIPTS_DIR="${BOT_SCRIPTS_DIR:-${BOT_HOME}/scripts}"

# ── Lock/flag file prefix ───────────────────────────────────────────────────
LOCK_PREFIX="${LOCK_PREFIX:-/tmp/${BOT_NAME}}"

# ── gh call budget ────────────────────────────────────────────────────────────
GH_BUDGET_THRESHOLD="${GH_BUDGET_THRESHOLD:-200}"

# ── API budget monitoring ────────────────────────────────────────────────────
# Per-workspace gh call tracking (written by gh-budget.sh at session end)
API_BUDGET_DIR="${API_BUDGET_DIR:-${BOT_STATE_DIR}/api-budget}"
# Rate-limit time series (sampled every 10 min by api-budget-monitor.sh)
RATE_LIMIT_TIMESERIES="${RATE_LIMIT_TIMESERIES:-${API_BUDGET_DIR}/rate-limit-timeseries.jsonl}"
# Per-workspace budget allocation (max gh calls/day before alerting)
WORKSPACE_BUDGET_DEFAULT="${WORKSPACE_BUDGET_DEFAULT:-500}"

# ── Concurrency ─────────────────────────────────────────────────────────────
MAX_CONCURRENT="${MAX_CONCURRENT:-5}"
RESERVED_INTERACTIVE_SLOTS="${RESERVED_INTERACTIVE_SLOTS:-2}"

# ── Queue settings ──────────────────────────────────────────────────────────
MAX_QUEUE_RETRIES="${MAX_QUEUE_RETRIES:-3}"
QUEUE_TTL_MINUTES="${QUEUE_TTL_MINUTES:-120}"

# ── Process lifecycle ───────────────────────────────────────────────────────
IDLE_THRESHOLD_MIN="${IDLE_THRESHOLD_MIN:-5}"
TRIAGE_MIN_AGE="${TRIAGE_MIN_AGE:-10}"
HARD_CAP_MIN="${HARD_CAP_MIN:-45}"

# ── Slack ───────────────────────────────────────────────────────────────────
BOT_OPS_CHANNEL_ID="${BOT_OPS_CHANNEL_ID:-}"

# ── Heartbeats ──────────────────────────────────────────────────────────────
HEARTBEAT_DIR="${HEARTBEAT_DIR:-${BOT_STATE_DIR}/heartbeats}"
CLAIMS_DIR="${CLAIMS_DIR:-${BOT_STATE_DIR}/claims}"

# ── Derived values (computed from above, don't override) ────────────────────
REGISTRY_FILE="${WORKSPACES_DIR}/label-registry.json"

# ── Source secrets if not already loaded ─────────────────────────────────────
if [ -z "${SLACK_BOT_TOKEN:-}" ] && [ -f "$BOT_ENV_FILE" ]; then
  source "$BOT_ENV_FILE"
fi

# ── GitHub auth — prefer App, fall back to PAT ──────────────────────────────
# Delegated to lib/github-app-token.sh which handles both modes:
#   - If GH_APP_ID and GH_APP_INSTALLATION_ID are set: mint a fresh
#     installation access token signed by the App's private key. Cached for
#     ~55 min; refreshed automatically on expiry.
#   - Otherwise: print $MWF_BOT_PAT as a fallback.
export MWF_BOT_PAT GH_APP_ID GH_APP_INSTALLATION_ID GH_APP_PRIVATE_KEY_PATH GH_APP_TOKEN_CACHE

__mwf_gh_token=$("${BOT_SCRIPTS_DIR}/lib/github-app-token.sh" 2>/dev/null || true)
if [ -n "$__mwf_gh_token" ]; then
  export GH_TOKEN="$__mwf_gh_token"
  export GITHUB_TOKEN="$__mwf_gh_token"
fi
unset __mwf_gh_token
