# global-facts.json

Cross-session consolidated facts for a user. Built up over multiple MWF sessions to provide continuity for returning users.

**Location:** `data/mwf-users/{slack_user_id}/global-facts.json`

## Schema

Array of fact objects:

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique fact identifier (matches original per-session fact ID) |
| `category` | `string` enum | `People \| Logistics \| Conflict \| Emotional \| History` |
| `fact` | `string` | Human-readable description of the fact |
| `first_seen` | `string` (ISO-8601) | When the fact was first extracted |
| `last_confirmed` | `string` (ISO-8601) | When the fact was last confirmed or referenced |
| `source_sessions` | `string[]` | Session IDs where this fact appeared |

## Example

```json
[
  {
    "id": "uuid",
    "category": "People | Logistics | Conflict | Emotional | History",
    "fact": "Has a sister they're close to since childhood",
    "first_seen": "ISO-8601",
    "last_confirmed": "ISO-8601",
    "source_sessions": ["session_id_1", "session_id_2"]
  }
]
```

## Notes

- Maximum 50 global facts per user
- Facts are merged from per-session `notable-facts.json` at session completion or stage transitions
- Deduplication by UUID — if the same fact ID already exists, `last_confirmed` and `source_sessions` are updated
- Category enum matches `notable-facts.json`
