# Stage: Route

## Input

- Slack message (via prompt file) from either:
  - `#mwf-sessions` channel (lobby — start/join only)
  - A DM with the bot (active session conversation)
- `channel_id` and `thread_ts` from the incoming message
- `user_id` identifying which participant sent this message

## Process

### 1. Determine Message Source

Check `channel_id` against the `#mwf-sessions` lobby channel ID (from `.claude/config/services.json` or env).

**If lobby message** → go to step 1A (Lobby Handler).
**If DM message** → go to step 2 (Session Lookup).

### 1A. Lobby Handler (#mwf-sessions)

The lobby is a short exchange in a thread. The bot resolves the user's name from Slack (via the `user_id` in the event — use the Slack user's display name or real name from the message context) and asks one question: who to invite.

**Step 1: User posts "start" (or similar) in `#mwf-sessions`**

Reply in a thread:
> "Hi {name}! Who would you like to have this conversation with? @mention them so I can send the invitation."

The user's name comes from their Slack profile (already available in the message event or via `users.info`). Do NOT ask for their name.

**Step 2: User @mentions their partner**

Extract the partner's Slack user ID from the @mention. Resolve the partner's display name from Slack as well. Then:

1. **Create the session**:
   - Generate a UUID for `session_id`
   - Create `data/mwf-sessions/{session_id}/` directory
   - Write `session.json` (status: `waiting_for_partner`, user_a populated with name + slack_user_id, partner's slack_user_id stored for later invitation delivery)
   - Write `stage-progress.json` (current_stage: 0, user_a: NOT_STARTED)
   - Create empty vessel dirs: `vessel-a/`, `shared/`, `synthesis/`

2. **Open a DM with User A** (`conversations.open` with `users=<user_a_id>`):
   - Post a welcome message as a top-level DM message
   - **Reply to that message in a thread** to seed the conversation (e.g., "To get started, I'd like to walk you through a few ground rules...")
   - Write to `thread-index.json`: `"{dm_channel_id}:{welcome_msg_ts}": "{session_id}"`
   - Update `session.json` with User A's `thread_ts`

3. **Reply in the lobby thread**:
   > "I've sent you a private message to get started. Head over to your DMs with me."

4. **User A continues in DM** → enters Stage 0 Phase A (Curiosity Compact), then Phase B (Invitation Crafting). The invitation crafting phase is a multi-turn conversation where the bot helps the user compose a thoughtful message to their partner (see `stages/0-onboarding/CONTEXT.md` Phase B). The invitation is NOT sent immediately.

5. **When the invitation is finalized** (user approves the draft):
   - Open a DM with the partner (`conversations.open` with `users=<partner_id>`)
   - Post the crafted invitation as a top-level DM message
   - **Reply to that message in a thread**: "If you'd like to participate, just reply here with your first name to get started."
   - Write to `thread-index.json`: `"{partner_dm_channel_id}:{invitation_msg_ts}": "{session_id}"`

**When the partner responds in their DM thread:**
- The socket listener matches it via `thread-index.json` → routes to this workspace
- The route stage loads the session, sees `status: waiting_for_partner` and this user is the partner
- Ask for their name, pair them, then proceed to Phase 0B (pairing + onboarding)

**Any other lobby message** → reply in thread: "To start a session, just say `start`."

### 2. Session Lookup (DM messages)

Look up the incoming DM thread in the session index:

1. Construct key: `{channel_id}:{thread_ts}`
2. Read `data/mwf-sessions/thread-index.json` (see `schemas/thread-index.schema.md`)
3. Look up the constructed key in the index

**If found** → extract `session_id`, continue to step 3.
**If not found** → this DM is not part of an active session. Reply: "This doesn't seem to be part of an active session. Head to #mwf-sessions to start or join one."

### 3. State File Loading

Load session state from `data/mwf-sessions/{session_id}/`:

1. Read `session.json` for session metadata (see `schemas/session.schema.md`)
   - `status`: must be `active` or `waiting_for_partner` to proceed
   - If `completed` or `abandoned` → reply that this session has ended
   - `user_a` / `user_b`: identify which participant sent this message via `user_id` match
2. Read `stage-progress.json` for current stage and gate status (see `schemas/stage-progress.schema.md`)
   - `current_stage`: the stage number (0-4) to apply
   - `users.{user_id}.stage_status`: this user's progress within the current stage
   - `users.{user_id}.gates_satisfied`: which gates this user has already passed

### 4. Lockfile Acquisition

Prevent concurrent processing of the same session:

1. Attempt to create `data/mwf-sessions/{session_id}/.lock` (atomic create -- fail if file already exists)
2. **If lock acquired** → continue to step 5
3. **If lock held** (file already exists) → reply: "I'm still processing your previous message -- one moment." and stop

The lock MUST be released (delete `.lock`) when processing completes, whether the turn succeeds or errors. Wrap all subsequent steps in a try/finally pattern.

### 5. Retrieval Contract Enforcement

Based on `current_stage` from `stage-progress.json`, enforce file access rules from `references/privacy-model.md`:

| Stage | Files Readable | Files Forbidden |
|---|---|---|
| 0 | `session.json`, `stage-progress.json` | All vessel files |
| 1 | Own `vessel-{x}/*`, `conversation-summary.md` | Partner's vessel, `shared/*` |
| 2 | Own vessel + `shared/consented-content.json` | Partner's raw vessel |
| 3 | Own `vessel-{x}/needs.json` + `shared/consented-content.json`, `shared/common-ground.json` | Partner's raw vessel, own raw events |
| 4 | `shared/*` (all) | Both users' raw vessels |

The `synthesis/` directory is **never** read during user-facing turns.

### 6. Stage Dispatch

Route to the appropriate stage CONTEXT based on `current_stage`:

| `current_stage` | Stage CONTEXT |
|---|---|
| 0 | `stages/0-onboarding/CONTEXT.md` |
| 1 | `stages/1-witness/CONTEXT.md` |
| 2 | `stages/2-perspective-stretch/CONTEXT.md` |
| 3 | `stages/3-need-mapping/CONTEXT.md` |
| 4 | `stages/4-strategic-repair/CONTEXT.md` |

Pass the loaded state as context for the stage to use:
- `session.json` contents (session metadata, user pairing)
- `stage-progress.json` contents (current stage, user's gate status)
- Any permitted vessel/shared files loaded in step 5
- The `user_id` of the current message sender

### 7. Post-Turn State Updates

After the stage handler completes and the reply is composed:

1. **Update `stage-progress.json`**:
   - Set `users.{user_id}.last_active` to current ISO-8601 timestamp
   - Update `users.{user_id}.gates_satisfied` if any gates were satisfied during this turn
   - If all gates for the current stage are satisfied for **both** users:
     - Advance `current_stage` by 1
     - Reset both users' `gates_satisfied` to the new stage's gate keys (all `false`)
     - Set both users' `stage_status` to `IN_PROGRESS`
   - If this user satisfied all gates but partner has not:
     - Set this user's `stage_status` to `GATE_PENDING`
2. **Update `session.json`** if session status changed (e.g., partner joined → `active`, all stages done → `completed`)
3. **Update `thread-index.json`** if a new thread was created (new session or partner join)
4. **Release lockfile**: delete `data/mwf-sessions/{session_id}/.lock`

### 8. Reply in DM Thread

Post the response in the user's DM thread. See `shared/slack/slack-post.md` for the posting procedure and `shared/references/slack-format.md` for Slack mrkdwn formatting (not Markdown).

**Never post session content in the lobby channel.** Lobby replies are limited to "check your DMs" confirmations.

## Output

- A reply posted to the user's DM thread (or lobby confirmation)
- Updated state files as described in step 7
- Lockfile released

## Completion

This stage runs once per message. No multi-stage pipeline -- each invocation handles one message, updates state files, and replies.
