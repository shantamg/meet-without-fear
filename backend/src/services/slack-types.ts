/**
 * Shared types for the Slack MWF session flow. Extracted into its own module
 * so controllers and services can import the payload shape without creating a
 * controller → service → controller cycle.
 */

export interface SlackMessagePayload {
  channel: string;
  user: string;
  text: string;
  thread_ts?: string;
  ts: string;
  /** `true` when the message was posted in the `#mwf-sessions` lobby channel. */
  isLobby?: boolean;
  /** Slack team id, useful for multi-workspace installs (unused today). */
  team?: string;
}
