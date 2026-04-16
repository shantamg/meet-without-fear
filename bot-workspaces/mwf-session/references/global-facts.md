# Global Facts — Cross-Session Accumulation

Global facts give the Process Guardian continuity with returning users. Instead of starting from scratch each session, the bot has context about people, history, and emotional patterns the user has shared before.

## Lifecycle

```
Session N (per-turn)          Session end / stage transition       Session N+1 (start)
─────────────────────         ──────────────────────────────       ───────────────────
Extract facts →               Consolidate into global-facts.json → Load as context
vessel-{x}/notable-facts.json   data/mwf-users/{user_id}/           for new session
```

### 1. Extraction (per turn, Stages 1–3)

Facts are extracted into each user's private vessel during conversation. See `schemas/notable-facts.schema.md` for the per-session schema.

- Max 20 facts per session per user
- Each fact has a stable UUID, category, and source stage
- Facts stay in the user's vessel — never shared with the partner

### 2. Consolidation (on trigger)

Merge per-session `vessel-{x}/notable-facts.json` into `data/mwf-users/{slack_user_id}/global-facts.json`. See `schemas/global-facts.schema.md` for the target schema.

**Triggers:**
- **Session completion** — when both users satisfy all Stage 4 gates and `session.json` status is set to `completed`
- **Stage transitions** — when `current_stage` advances in `stage-progress.json` (e.g., Stage 1 → 2, Stage 2 → 3, etc.)

**Algorithm:**

1. Read the user's `vessel-{x}/notable-facts.json` for the current session
2. Read (or create) `data/mwf-users/{slack_user_id}/global-facts.json`
3. For each session fact:
   - **If the fact's UUID already exists in global facts**: update `last_confirmed` to now, append the current `session_id` to `source_sessions` (if not already present)
   - **If the UUID is new**: map the session fact to a global fact entry:
     ```
     {
       id:              <same UUID from session fact>,
       category:        <same category>,
       fact:            <same fact text>,
       first_seen:      <session fact's extracted_at>,
       last_confirmed:  <now>,
       source_sessions: [<current session_id>]
     }
     ```
4. Write the updated global facts back to file

**Over-limit consolidation (max 50 facts):**

If the merged result exceeds 50 facts:
1. Sort by `last_confirmed` ascending (oldest-confirmed first)
2. Group the oldest facts by `category`
3. Within each category group, merge facts with similar content into a single summary fact:
   - Combine `source_sessions` arrays
   - Use the earliest `first_seen` and latest `last_confirmed`
   - Rewrite `fact` as a concise summary covering all merged facts
   - Generate a new UUID for the merged fact
4. Repeat until the count is at or below 50

### 3. Loading (on session start)

When a new session begins (Stage 0, Phase 0A or Phase 0B), check if the user has existing global facts:

1. Look up `data/mwf-users/{slack_user_id}/global-facts.json`
2. If the file exists and is non-empty, load it as additional context
3. Inject the facts into the session as background knowledge — the bot can reference them naturally without quoting them verbatim
4. Do NOT tell the user "I remember from last time" or make the continuity feel surveillance-like — use the facts to inform questions and reflections naturally

**Privacy rules:**
- Global facts are per-user and private — never share one user's global facts with the other user
- Facts follow the same Vessel isolation rules as all other per-user data
- The partner cannot read or infer the contents of the other user's global facts

## File Locations

| File | Path | Scope |
|---|---|---|
| Per-session facts | `data/mwf-sessions/{session_id}/vessel-{a\|b}/notable-facts.json` | One session, one user |
| Global facts | `data/mwf-users/{slack_user_id}/global-facts.json` | All sessions for one user |

## Schema Reference

- Per-session: `schemas/notable-facts.schema.md`
- Global: `schemas/global-facts.schema.md`
