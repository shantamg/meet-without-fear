#!/bin/bash
# github-app-token.sh — Print a fresh GitHub App installation access token.
#
# This is the token-refresh helper for the slam-bot GitHub App migration
# (see shantamg/meet-without-fear#1652). It generates a JWT signed with the App's private
# key, exchanges it for an installation access token from
# POST /app/installations/:id/access_tokens, and caches the result until
# shortly before it expires.
#
# Usage:
#   # As a command — prints the token on stdout:
#   TOKEN=$(github-app-token.sh)
#
#   # Typical wiring in lib/config.sh:
#   export GH_TOKEN=$(github-app-token.sh)
#   export GITHUB_TOKEN="$GH_TOKEN"
#
# Environment:
#   GH_APP_ID              — the numeric App ID (from the App settings page)
#   GH_APP_INSTALLATION_ID — the numeric installation ID (from the install URL)
#   GH_APP_PRIVATE_KEY_PATH — path to the .pem file (default:
#                             /opt/slam-bot/secrets/slam-bot-app.pem)
#   GH_APP_TOKEN_CACHE     — cache file path (default: /tmp/slam-bot-gh-app-token.json)
#   MWF_BOT_PAT            — fallback PAT to print if the App is not configured.
#                             Optional — if unset and the App is not configured,
#                             exit 1.
#
# Exit codes:
#   0 — token printed on stdout (either fresh, cached, or PAT fallback)
#   1 — App not configured AND no PAT fallback
#   2 — private key file missing/unreadable
#   3 — JWT generation failed (openssl error)
#   4 — installation token exchange failed (curl/API error)
#   5 — response parse error (malformed JSON)
#
# Dependencies: bash, openssl, curl, jq, date. No Python, no PyJWT — we
# handcraft the JWT with openssl so there's zero dependency on PyJWT being
# installed on the EC2 box.
#
set -euo pipefail

# ── Resolve inputs ──────────────────────────────────────────────────────────
APP_ID="${GH_APP_ID:-}"
INSTALL_ID="${GH_APP_INSTALLATION_ID:-}"
PEM_PATH="${GH_APP_PRIVATE_KEY_PATH:-/opt/slam-bot/secrets/slam-bot-app.pem}"
CACHE_FILE="${GH_APP_TOKEN_CACHE:-/tmp/slam-bot-gh-app-token.json}"

err() { echo "[github-app-token] $1" >&2; }

# ── Fallback mode: App not configured ──────────────────────────────────────
# If the App is fully unconfigured (all three required vars empty), fall back
# to the legacy PAT. This lets lib/config.sh wire in the helper unconditionally
# without breaking on machines that haven't flipped over yet.
if [ -z "$APP_ID" ] && [ -z "$INSTALL_ID" ]; then
  if [ -n "${MWF_BOT_PAT:-}" ]; then
    printf '%s\n' "$MWF_BOT_PAT"
    exit 0
  fi
  err "GH_APP_ID and GH_APP_INSTALLATION_ID unset, and no MWF_BOT_PAT fallback available"
  exit 1
fi

# Partial configuration is an error — we want to fail loud so nobody accidentally
# runs the bot with a half-set App config.
if [ -z "$APP_ID" ] || [ -z "$INSTALL_ID" ]; then
  err "Partial App config: GH_APP_ID='$APP_ID' GH_APP_INSTALLATION_ID='$INSTALL_ID' — set both or neither"
  exit 1
fi

# Both IDs must be numeric — GitHub's JWT payload requires `iss` as a JSON
# number (see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
if ! [[ "$APP_ID" =~ ^[0-9]+$ ]]; then
  err "GH_APP_ID must be numeric, got: '$APP_ID'"
  exit 1
fi
if ! [[ "$INSTALL_ID" =~ ^[0-9]+$ ]]; then
  err "GH_APP_INSTALLATION_ID must be numeric, got: '$INSTALL_ID'"
  exit 1
fi

if [ ! -r "$PEM_PATH" ]; then
  err "Private key not readable at: $PEM_PATH"
  exit 2
fi

# ── Cache hit path ──────────────────────────────────────────────────────────
# Installation tokens live 60 minutes. We keep a 5-minute safety buffer so
# calls in-flight don't race the expiry.
now_epoch=$(date +%s)

if [ -f "$CACHE_FILE" ]; then
  cached_expires_iso=$(jq -r '.expires_at // empty' "$CACHE_FILE" 2>/dev/null || echo "")
  cached_token=$(jq -r '.token // empty' "$CACHE_FILE" 2>/dev/null || echo "")

  if [ -n "$cached_expires_iso" ] && [ -n "$cached_token" ]; then
    # Parse the ISO 8601 timestamp. `date -d` works on Linux (EC2); BSD date
    # (macOS) uses -j -f. Try both.
    cached_expires_epoch=$(
      date -d "$cached_expires_iso" +%s 2>/dev/null \
      || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$cached_expires_iso" +%s 2>/dev/null \
      || echo 0
    )
    if [ "$cached_expires_epoch" -gt $((now_epoch + 300)) ]; then
      printf '%s\n' "$cached_token"
      exit 0
    fi
  fi
fi

# ── Build and sign a JWT via openssl ────────────────────────────────────────
# RS256 JWT. Header = {"typ":"JWT","alg":"RS256"}, payload = iat/exp/iss.
# iat back-dated by 60s and exp set to iat+540s (9-min total) to give us a
# safe margin against GitHub's clock drift tolerance (GitHub rejects JWTs
# older than 10 minutes or iat in the future).

# base64url: standard base64, swap +/ for -_, strip padding and newlines
b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }

header_b64=$(printf '{"typ":"JWT","alg":"RS256"}' | b64url)

iat=$((now_epoch - 60))
exp=$((now_epoch + 540))
# GitHub's documented JWT payload uses `iss` as a JSON number (not a string).
# Both APP_ID and the timestamps are numeric, so unquoted %d for all three.
payload_b64=$(printf '{"iat":%d,"exp":%d,"iss":%d}' "$iat" "$exp" "$APP_ID" | b64url)

signing_input="${header_b64}.${payload_b64}"

# Sign with RS256 (SHA-256 with RSA). openssl dgst -sign takes the private key.
signature_b64=$(
  printf '%s' "$signing_input" \
    | openssl dgst -sha256 -sign "$PEM_PATH" 2>/dev/null \
    | b64url
) || {
  err "openssl JWT signing failed (bad private key path=$PEM_PATH?)"
  exit 3
}

if [ -z "$signature_b64" ]; then
  err "openssl produced an empty signature"
  exit 3
fi

jwt="${signing_input}.${signature_b64}"

# ── Exchange JWT for installation access token ─────────────────────────────
# POST /app/installations/:id/access_tokens returns {"token":"ghs_...", "expires_at":"2026-..."}
api_url="https://api.github.com/app/installations/${INSTALL_ID}/access_tokens"

response=$(
  curl -sS -X POST \
    -H "Authorization: Bearer $jwt" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -w "\nHTTP_STATUS:%{http_code}" \
    "$api_url" 2>&1
) || {
  err "curl failed talking to $api_url"
  exit 4
}

http_status=$(printf '%s' "$response" | awk -F: '/^HTTP_STATUS:/ {print $2}')
response_body=$(printf '%s' "$response" | sed '/^HTTP_STATUS:/d')

if [ "$http_status" != "201" ]; then
  err "installation token exchange failed (HTTP $http_status):"
  err "$response_body" | head -5
  exit 4
fi

# ── Parse, cache, print ─────────────────────────────────────────────────────
token=$(printf '%s' "$response_body" | jq -r '.token // empty' 2>/dev/null || echo "")
expires_at=$(printf '%s' "$response_body" | jq -r '.expires_at // empty' 2>/dev/null || echo "")

if [ -z "$token" ] || [ -z "$expires_at" ]; then
  err "failed to parse token/expires_at from response: $response_body"
  exit 5
fi

# Atomic cache write
tmp_cache="${CACHE_FILE}.tmp.$$"
printf '%s' "$response_body" > "$tmp_cache"
chmod 600 "$tmp_cache" 2>/dev/null || true
mv "$tmp_cache" "$CACHE_FILE"

printf '%s\n' "$token"
