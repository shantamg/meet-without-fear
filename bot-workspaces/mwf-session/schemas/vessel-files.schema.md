# Per-User Vessel Files

Private vessel files for each user. These live in the user's vessel directory and are never directly readable by the other user.

**Location:** `data/mwf-sessions/{session_id}/vessel-{a|b}/`

## emotional-thread.json

Emotional intensity readings tracked over the conversation.

| Field | Type | Description |
|---|---|---|
| `ts` | `string` (ISO-8601) | Timestamp of the reading |
| `intensity` | `number` (1–10) | Emotional intensity level |
| `context` | `string` | Brief description of the emotional context |

```json
[
  {
    "ts": "ISO-8601",
    "intensity": 6,
    "context": "Frustration mixed with sadness when discussing caregiving"
  }
]
```

## needs.json

Identified needs extracted from the user's conversation.

| Field | Type | Description |
|---|---|---|
| `need` | `string` | Description of the identified need |
| `evidence` | `string[]` | Quotes or references supporting the need |
| `confirmed` | `boolean` | Whether the user has confirmed this need |

```json
[
  {
    "need": "To feel acknowledged for caregiving effort",
    "evidence": ["I do everything and nobody notices"],
    "confirmed": false
  }
]
```

## boundaries.json

Stated boundaries from the user.

| Field | Type | Description |
|---|---|---|
| `boundary` | `string` | Description of the boundary |
| `non_negotiable` | `boolean` | Whether the user considers this non-negotiable |

```json
[
  {
    "boundary": "Won't discuss finances in front of the kids",
    "non_negotiable": true
  }
]
```

## Retrieval Contract

| Stage | Access |
|---|---|
| 0 | Not readable |
| 1 | Own vessel only |
| 2 | Own vessel only (shared content goes through Shared Vessel via consent) |
| 3 | Own `needs.json` only |
| 4 | Not readable (all interaction through Shared Vessel) |
