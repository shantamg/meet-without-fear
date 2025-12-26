---
slug: /backend/state-machine
sidebar_position: 3
---

# State Machine

Session lifecycle management and stage-scoped data access rules.

## Documents

### Session States (coming soon)
Session lifecycle FSM with state transitions

### Stage Gates (coming soon)
Advancement conditions linked to stage documentation

### [Retrieval Contracts](./retrieval-contracts.md)
**Critical** - Per-stage data access rules that enforce privacy

## Core Concept

The State Machine Layer enforces:

1. **Session Lifecycle**: Created → Active → Stages → Resolved
2. **Stage Progression**: Gate conditions that must be satisfied
3. **Data Access Rules**: What can be retrieved at each stage

```mermaid
stateDiagram-v2
    [*] --> CREATED: Session initiated
    CREATED --> INVITED: Partner invited
    INVITED --> ACTIVE: Partner accepts
    ACTIVE --> STAGE_0: Begin process
    STAGE_0 --> STAGE_1: Both sign compact
    STAGE_1 --> STAGE_2: Both feel heard
    STAGE_2 --> STAGE_3: Mutual understanding
    STAGE_3 --> STAGE_4: Common ground found
    STAGE_4 --> RESOLVED: Agreement reached

    ACTIVE --> PAUSED: Cooling period
    PAUSED --> ACTIVE: Resume

    ACTIVE --> ABANDONED: Timeout/withdrawal
    PAUSED --> ABANDONED: Extended pause
```

## Key Principles

| Principle | Implementation |
|-----------|----------------|
| Parallel work in Stages 1-3 | Each user progresses independently |
| Sequential work in Stages 0 & 4 | Requires real-time coordination |
| Gate enforcement | No advancement until conditions met |
| Retrieval contracts | Hard rules on data access per stage |

[Back to Backend](../index.md)
