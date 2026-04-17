# notable-facts.json

Categorized facts extracted from a user's conversation. Stored per-user in their private vessel.

**Location:** `data/mwf-sessions/{session_id}/vessel-{a|b}/notable-facts.json`

## Schema

Array of fact objects:

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique fact identifier |
| `category` | `string` enum | Fact category |
| `fact` | `string` | Human-readable description of the fact |
| `extracted_at` | `string` (ISO-8601) | When the fact was extracted |
| `source_stage` | `number` (0–4) | Stage during which the fact was extracted |

### `category` enum

| Value | Description |
|---|---|
| `People` | People mentioned in the conflict |
| `Logistics` | Practical details (timing, location, arrangements) |
| `Conflict` | Core conflict dynamics and triggers |
| `Emotional` | Emotional states and responses |
| `History` | Background and relationship history |

## Example

```json
[
  {
    "id": "uuid",
    "category": "People | Logistics | Conflict | Emotional | History",
    "fact": "User's partner is their sister; they've been close since childhood",
    "extracted_at": "ISO-8601",
    "source_stage": 1
  }
]
```

## Notes

- Maximum 20 facts per session per user
- When the limit is exceeded, oldest facts by timestamp are consolidated/merged
- Facts are private to each user's vessel — never readable by the other user's stage contract
