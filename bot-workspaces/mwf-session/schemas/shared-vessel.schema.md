# Shared Vessel Files

Consensual content shared between both users. Content only enters the shared vessel after explicit user consent.

**Location:** `data/mwf-sessions/{session_id}/shared/`

## consented-content.json

Content that a user has consented to share with their partner. Raw input is transformed into an abstracted form before sharing.

| Field | Type | Description |
|---|---|---|
| `source_user` | `string` | Slack user ID of the consenting user |
| `transformed` | `string` | Abstracted/synthesized version of the content |
| `consent_ts` | `string` (ISO-8601) | When consent was given |
| `consent_active` | `boolean` | Whether consent is still active (can be revoked) |

```json
[
  {
    "source_user": "U0AD3TF2U7L",
    "transformed": "Feels unacknowledged for daily caregiving responsibilities",
    "consent_ts": "ISO-8601",
    "consent_active": true
  }
]
```

## common-ground.json

Needs or concerns confirmed by both users as shared.

| Field | Type | Description |
|---|---|---|
| `need` | `string` | Description of the shared need |
| `confirmed_by` | `string[]` | Slack user IDs of users who confirmed |
| `ts` | `string` (ISO-8601) | When common ground was identified |

```json
[
  {
    "need": "Both want to feel respected in family decisions",
    "confirmed_by": ["U_A_ID", "U_B_ID"],
    "ts": "ISO-8601"
  }
]
```

## agreements.json

Agreements reached between both users.

| Field | Type | Description |
|---|---|---|
| `description` | `string` | What was agreed |
| `agreed_by` | `string[]` | Slack user IDs of users who agreed |
| `status` | `string` enum | `proposed \| accepted \| rejected` |
| `ts` | `string` (ISO-8601) | When the agreement was created/updated |

```json
[
  {
    "description": "Schedule a weekly 30-minute check-in about caregiving tasks",
    "agreed_by": ["U_A_ID", "U_B_ID"],
    "status": "accepted",
    "ts": "ISO-8601"
  }
]
```

## micro-experiments.json

Small actionable experiments for users to try between sessions.

| Field | Type | Description |
|---|---|---|
| `description` | `string` | What to try |
| `status` | `string` enum | `proposed \| in_progress \| completed \| skipped` |
| `follow_up` | `string` | Notes or outcome from the experiment |

```json
[
  {
    "description": "Try thanking each other for one caregiving task this week",
    "status": "proposed",
    "follow_up": ""
  }
]
```

## Retrieval Contract

| Stage | Access |
|---|---|
| 0 | Not readable |
| 1 | Not readable |
| 2 | `consented-content.json` only |
| 3 | `consented-content.json`, `common-ground.json` |
| 4 | All shared files |

## Notes

- Content enters the shared vessel **only** after explicit user consent
- If a user revokes consent (`consent_active: false`), the content is no longer readable by the partner's stage contract
- Raw user input is never stored here — only transformed/abstracted versions
