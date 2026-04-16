# Stage Progression Rules

## Coordination Modes

| Stage | Mode | Meaning |
|---|---|---|
| 0 — Onboarding | Sequential | Both users interact in a shared flow; both must sign before advancing |
| 1 — Witness | Parallel | Each user works independently at own pace; system waits for both to complete |
| 2 — Perspective Stretch | Parallel → Coordinated | Independent empathy-building, then coordinated exchange with consent |
| 3 — Need Mapping | Coordinated | Synthesized needs from both Vessels compared; both must confirm overlap |
| 4 — Strategic Repair | Parallel → Coordinated | Independent proposals, then anonymous pooling, ranking, and agreement |

## Gate Conditions

Each stage has an advancement gate. Both users must satisfy it before the session moves forward.

| Stage | Gate Condition |
|---|---|
| 0 | Both users sign the Curiosity Compact (`agreedToTerms: true`) |
| 1 | Each user explicitly confirms: "I feel fully heard" |
| 2 | Each user feels accurately reflected by their partner's empathy attempt |
| 3 | At least one common-ground need identified and confirmed by both users |
| 4 | Mutual agreement on at least one micro-experiment |

## Gate Keys

Gate state is persisted in `stage-progress.json`. Each key is a boolean that must be satisfied before the stage can advance. Stage advancement requires **both users** to satisfy all gate keys for the current stage.

| Stage | Gate Keys |
|---|---|
| 0 | `agreedToTerms` |
| 1 | `feelHeardConfirmed` |
| 2 | `empathyDraftReady`, `empathyConsented`, `partnerValidated` |
| 3 | `needsConfirmed`, `commonGroundConfirmed` |
| 4 | `strategiesSubmitted`, `rankingsSubmitted`, `agreementCreated` |

## Per-User Status

Each user tracks their own `StageStatus` independently:

| Status | Meaning |
|---|---|
| `NOT_STARTED` | User has not entered this stage |
| `IN_PROGRESS` | User is actively working in this stage |
| `GATE_PENDING` | User satisfied the gate, waiting for partner |
| `COMPLETED` | Both users satisfied the gate; stage is done |

## Advancement Flow

1. User satisfies gate → status becomes `GATE_PENDING`
2. System checks if partner is also `GATE_PENDING`
3. If yes → both users move to `COMPLETED`, next stage becomes `IN_PROGRESS`
4. If no → user sees "waiting for partner" indicator

## No Skipping

Stages must be completed in order (0 → 1 → 2 → 3 → 4). A user cannot enter stage N+1 until stage N is `COMPLETED` for both users.
