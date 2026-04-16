# Stage: Route

## Input

- Slack message from `#mwf-sessions` thread (via prompt file)
- `channel_id` and `thread_ts` from the incoming message
- `user_id` identifying which participant sent this message

## Process

### 1. Thread-to-Session Lookup

Look up the incoming thread in the session index:

1. Construct key: `{channel_id}:{thread_ts}`
2. Read `data/mwf-sessions/thread-index.json` (see `schemas/thread-index.schema.md`)
3. Look up the constructed key in the index

**If found** → extract `session_id`, continue to step 2.

**If not found** → this is a new or unrecognized thread:
- Check if the message body contains a 6-character alphanumeric join code → route to partner-join flow (Stage 0)
- Otherwise treat as a new session request → route to Stage 0 (Onboarding) to create a new session

### 2. State File Loading

Load session state from `data/mwf-sessions/{session_id}/`:

1. Read `session.json` for session metadata (see `schemas/session.schema.md`)
   - `status`: must be `active` or `waiting_for_partner` to proceed
   - If `completed` or `abandoned` → reply that this session has ended
   - `user_a` / `user_b`: identify which participant sent this message via `user_id` match
2. Read `stage-progress.json` for current stage and gate status (see `schemas/stage-progress.schema.md`)
   - `current_stage`: the stage number (0–4) to apply
   - `users.{user_id}.stage_status`: this user's progress within the current stage
   - `users.{user_id}.gates_satisfied`: which gates this user has already passed

### 3. Lockfile Acquisition

Prevent concurrent processing of the same session:

1. Attempt to create `data/mwf-sessions/{session_id}/.lock` (atomic create — fail if file already exists)
2. **If lock acquired** → continue to step 4
3. **If lock held** (file already exists) → reply: "I'm still processing your previous message — one moment." and stop

The lock MUST be released (delete `.lock`) when processing completes, whether the turn succeeds or errors. Wrap all subsequent steps in a try/finally pattern.

### 4. Retrieval Contract Enforcement

Based on `current_stage` from `stage-progress.json`, enforce file access rules from `references/privacy-model.md`:

| Stage | Files Readable | Files Forbidden |
|---|---|---|
| 0 | `session.json`, `stage-progress.json` | All vessel files |
| 1 | Own `vessel-{x}/*`, `conversation-summary.md` | Partner's vessel, `shared/*` |
| 2 | Own vessel + `shared/consented-content.json` | Partner's raw vessel |
| 3 | Own `vessel-{x}/needs.json` + `shared/consented-content.json`, `shared/common-ground.json` | Partner's raw vessel, own raw events |
| 4 | `shared/*` (all) | Both users' raw vessels |

The `synthesis/` directory is **never** read during user-facing turns.

Only load vessel files permitted for the current stage. If a stage handler requests a forbidden file, deny the read.

### 5. Stage Dispatch

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
- Any permitted vessel/shared files loaded in step 4
- The `user_id` of the current message sender

### 6. Post-Turn State Updates

After the stage handler completes and the reply is posted:

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

### 7. Reply in Thread

Compose and post the response as a Slack thread reply. See `shared/slack/slack-post.md` for the posting procedure and `shared/references/slack-format.md` for Slack mrkdwn formatting (not Markdown).

## Output

- A reply posted to the Slack thread
- Updated `stage-progress.json` reflecting any gate changes or stage advancement
- Updated `session.json` if session status changed
- Updated `thread-index.json` if new thread mapping was added
- Lockfile released

## Completion

This stage runs once per message. No multi-stage pipeline — each invocation handles one message, updates state files, and replies.
