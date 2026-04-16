# session.json

Session metadata and pairing state. Created when a user starts an MWF session; updated when a partner joins.

**Location:** `data/mwf-sessions/{session_id}/session.json`

## Schema

| Field | Type | Description |
|---|---|---|
| `session_id` | `string` (UUID) | Unique session identifier |
| `join_code` | `string` (6-char alphanumeric) | Code shared with conversation partner to join |
| `created_at` | `string` (ISO-8601) | When the session was created |
| `status` | `string` enum | Session lifecycle state |
| `user_a` | `object \| null` | First user (session creator) |
| `user_b` | `object \| null` | Second user (joins via code) |

### `status` enum

| Value | Meaning |
|---|---|
| `waiting_for_partner` | Session created, waiting for User B to join |
| `active` | Both users paired, session in progress |
| `completed` | All stages finished |
| `abandoned` | Session abandoned (timeout or user exit) |

### User object

| Field | Type | Description |
|---|---|---|
| `slack_user_id` | `string` | Slack user ID (e.g. `U0AD3TF2U7L`) |
| `display_name` | `string` | Slack display name |
| `thread_ts` | `string` | Slack thread timestamp for this user's DM thread |

## Example

```json
{
  "session_id": "uuid",
  "join_code": "abc123",
  "created_at": "ISO-8601",
  "status": "waiting_for_partner | active | completed | abandoned",
  "user_a": { "slack_user_id": "U...", "display_name": "...", "thread_ts": "..." },
  "user_b": { "slack_user_id": "U...", "display_name": "...", "thread_ts": "..." }
}
```

## Notes

- `user_b` is `null` until a partner joins via the `join_code`
- `join_code` is generated once at creation and never changes
- Sessions older than 90 days are auto-cleaned by the sweeper job
