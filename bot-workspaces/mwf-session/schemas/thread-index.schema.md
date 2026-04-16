# thread-index.json

Maps Slack thread timestamps to session IDs. Used on each incoming message to look up which session a thread belongs to.

**Location:** `data/mwf-sessions/thread-index.json`

## Schema

Object with keys of format `{channel_id}:{thread_ts}` mapping to session IDs.

| Key format | Value type | Description |
|---|---|---|
| `{channel_id}:{thread_ts}` | `string` (UUID) | Session ID this thread belongs to |

## Example

```json
{
  "C_CHANNEL_ID:TS_USER_A": "session_id",
  "C_CHANNEL_ID:TS_USER_B": "session_id"
}
```

## Lookup Flow

1. On each incoming message, construct key as `{channel_id}:{thread_ts}`
2. Look up in `thread-index.json`
3. If found → load that session's state files from `data/mwf-sessions/{session_id}/`
4. If not found → check if message contains a join code or is a new session request

## Notes

- Each session has two entries (one per user thread), both pointing to the same session ID
- Entries are added when a session is created (User A) and when a partner joins (User B)
- Entries are removed when the session folder is cleaned by the 90-day sweeper
