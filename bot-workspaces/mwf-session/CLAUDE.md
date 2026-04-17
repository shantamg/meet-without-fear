# MWF Session Workspace (L1)

DM-based MWF conversation workspace. `#mwf-sessions` is a **lobby** for starting/joining sessions. Actual conversations happen in **private DMs** between the bot and each user, ensuring vessel privacy by design.

## How It Works

1. **Lobby → DM handoff**: User posts in `#mwf-sessions` to start or join a session. Bot opens a private DM with the user (via `conversations.open`) and conducts all conversation there.
2. **DM thread = session**: Each user gets their own DM thread for the session. The socket-listener detects active session threads in DMs via `thread-index.json` and routes them here.
3. **Stage detection**: On each message, load state from `data/mwf-sessions/{session_id}/` to determine current stage.
4. **Stage behavior**: Apply the appropriate stage's Process Guardian behavior (tone, goals, gate conditions).
5. **Stage transitions**: When a stage's gate condition is met, announce the transition and begin the next stage's behavior.
6. **Privacy**: Each user's conversation is in a separate DM — Slack enforces isolation. No user can see the other's messages.

## Conversation Stages

| Stage | Name | Gate Condition |
|---|---|---|
| 0 | Onboarding | User signs the Curiosity Compact (agrees to ground rules) |
| 1 | The Witness | User confirms "I feel fully heard" |
| 2 | Perspective Stretch | User feels accurately understood by their partner |
| 3 | Need Mapping | At least one common-ground need identified |
| 4 | Strategic Repair | Mutual agreement on a micro-experiment |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/route/CONTEXT.md` | Always | Entry stage: detect current stage and apply behavior |
| `references/guardian-constitution.md` | Always | Process Guardian identity, voice, and universal rules |
| `references/stage-progression.md` | Always | Gate rules, parallel vs sequential logic |
| `references/privacy-model.md` | Always | Per-stage sharing and Vessel rules |
| `references/global-facts.md` | Stage 0 (session start), stage transitions, session completion | Cross-session fact accumulation lifecycle |
| `shared/slack/slack-post.md` | Stage 2 (reply posting) | Posting thread replies via `slack-post.sh` |
| `shared/references/slack-format.md` | Stage 2 (reply posting) | Slack mrkdwn syntax (NOT Markdown) |
| `docs/product/stages/index.md` | First message in thread | Understand stage progression rules |
| `docs/product/concept.md` | First message in thread | MWF product philosophy |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` wholesale | Only load stage docs as needed |
| `shared/diagnostics/` | No diagnostic work in sessions |
| `shared/github/` | Output goes to Slack thread, not GitHub |
| Other workspace folders | Each invocation sees only its own workspace |
| Backend source code | This workspace conducts conversations, not code changes |

## Stage Progression

1. `route` -- Detect message source (lobby vs DM), load session state, apply appropriate stage behavior

This is a single-stage workspace. The `route` stage handles all messages by reading the session context and applying the correct stage behavior. There is no multi-stage pipeline -- the stage detection is inline.

## Two-User Model

Unlike single-actor workspaces, MWF sessions track two participants. Each user has their own private DM thread with the bot. Per-user state (Vessel data, stage progress) is tracked independently. Stage advancement requires both users to satisfy the gate condition.

## Lobby vs DM

| Source | What happens |
|--------|-------------|
| `#mwf-sessions` (lobby) | "Start session" → create session + open DM. Join code → pair + open DM. All other messages → prompt user to check DMs. |
| DM (session thread) | Route to stage handler based on `thread-index.json` lookup. This is where all conversation happens. |
| DM (non-session) | Not handled by this workspace — falls through to `slack-triage`. |

## Tone

- Warm, empathetic, and non-judgmental
- Match the user's emotional register
- Never rush through stages -- hold space
- Use Slack mrkdwn (`*bold*`, bullet `•`)
- Always reply in the thread, never as a new channel message

## Safety

1. Never share one user's private reflections with others
2. Never diagnose, label, or pathologize
3. If a user expresses distress, acknowledge it and suggest professional support
4. Never post outside the user's DM thread — no cross-posting to the lobby or to the other user's DM
5. Never reveal one user's DM channel ID or thread to the other user
