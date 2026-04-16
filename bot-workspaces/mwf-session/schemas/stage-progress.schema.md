# stage-progress.json

Per-user stage tracking and gate satisfaction. Read on every incoming message to determine which stage behavior to apply.

**Location:** `data/mwf-sessions/{session_id}/stage-progress.json`

## Schema

| Field | Type | Description |
|---|---|---|
| `current_stage` | `number` (0–4) | The stage both users are currently in |
| `users` | `object` | Map of Slack user ID → per-user progress |

### Per-user progress object

| Field | Type | Description |
|---|---|---|
| `stage_status` | `string` enum | `NOT_STARTED \| IN_PROGRESS \| COMPLETE` |
| `gates_satisfied` | `object` | Map of gate key → `boolean` for the current stage |
| `last_active` | `string \| null` (ISO-8601) | Last message timestamp for this user |

### Gate keys per stage

| Stage | Gate Keys | Description |
|---|---|---|
| 0 | `agreedToTerms` | User accepted terms and onboarding |
| 1 | `feelHeardConfirmed` | User confirmed feeling heard |
| 2 | `empathyDraftReady`, `empathyConsented`, `partnerValidated` | Empathy synthesis drafted, consented, and validated by partner |
| 3 | `needsConfirmed`, `commonGroundConfirmed` | User confirmed needs; common ground identified |
| 4 | `strategiesSubmitted`, `rankingsSubmitted`, `agreementCreated` | Strategies proposed, ranked, and agreement created |

## Example

```json
{
  "current_stage": 0,
  "users": {
    "U_A_ID": {
      "stage_status": "IN_PROGRESS",
      "gates_satisfied": { "agreedToTerms": false },
      "last_active": "ISO-8601"
    },
    "U_B_ID": {
      "stage_status": "NOT_STARTED",
      "gates_satisfied": {},
      "last_active": null
    }
  }
}
```

## Notes

- `current_stage` advances only when **both** users have all gates satisfied for the current stage
- `gates_satisfied` resets to the new stage's gate keys (all `false`) on stage advancement
- If file corruption creates a state where users are in different stages, the bot falls back to the lower stage
