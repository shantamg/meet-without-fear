#!/usr/bin/env node
/**
 * publish-bot-event.mjs — Publish bot session events to Ably for live dashboard streaming.
 *
 * Usage:
 *   node publish-bot-event.mjs <event> <json-payload>
 *
 * Events:
 *   session.started  — when run-claude.sh begins a new session
 *   session.output   — batched lines of Claude output (throttled)
 *   session.ended    — when run-claude.sh exits
 *
 * Channel: bot:sessions
 *
 * Requires ABLY_API_KEY in environment (sourced from /opt/slam-bot/.env).
 * Gracefully exits with code 0 if ABLY_API_KEY is not set (no-op on dev machines).
 */

import Ably from "ably";

const CHANNEL_NAME = "bot:sessions";
const ABLY_API_KEY = process.env.ABLY_API_KEY;

if (!ABLY_API_KEY) {
  // Graceful no-op — don't break run-claude.sh on machines without Ably
  process.exit(0);
}

const event = process.argv[2];
const payloadJson = process.argv[3];

if (!event || !payloadJson) {
  console.error("Usage: publish-bot-event.mjs <event> <json-payload>");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(payloadJson);
} catch (err) {
  console.error("Invalid JSON payload:", err.message);
  process.exit(1);
}

try {
  const client = new Ably.Rest({ key: ABLY_API_KEY });
  const channel = client.channels.get(CHANNEL_NAME);
  await channel.publish(event, payload);
} catch (err) {
  // Non-fatal — don't break the bot if Ably publish fails
  console.warn("[publish-bot-event] Failed to publish (non-fatal):", err.message);
}
