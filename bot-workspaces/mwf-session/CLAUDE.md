# MWF Session (L1)

Drive a Meet Without Fear conversation session through stages 0–4. Each stage maps to a product-defined conversation phase with specific gates, privacy rules, and coordination modes. This workspace handles two users per session.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `references/stage-progression.md` | Always | Gate rules, parallel vs sequential logic |
| `references/privacy-model.md` | Always | Per-stage sharing and Vessel rules |
| `references/conversation-tone.md` | Always | Process Guardian voice and style |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` wholesale | Stage CONTEXT.md files reference only what they need |
| repo source code | This workspace drives conversation, not code changes |
| `shared/diagnostics/` | No diagnostic work — conversation facilitation only |
| Other workspaces | Irrelevant context |

## Stage Progression

0. `0-onboarding` — Present Curiosity Compact, collect signatures from both users (**sequential**)
1. `1-witness` — Deep listening: each user shares until they feel fully heard (**parallel**)
2. `2-perspective-stretch` — Empathy building with consensual bridge for sharing (**parallel → coordinated**)
3. `3-need-mapping` — Translate complaints into universal needs, find common ground (**coordinated**)
4. `4-strategic-repair` — Design reversible micro-experiments from shared needs (**parallel → coordinated**)

## Two-User Model

Unlike single-actor workspaces, MWF sessions track two participants. Each stage receives a `user_id` identifying which participant is messaging. Per-user state (Vessel data, stage progress) is tracked independently. Stage advancement requires both users to satisfy the gate condition.
