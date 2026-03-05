# E2E Session Playthrough — Multi-Agent Architecture

Multi-agent E2E playthrough where **naive user agents** experience the app with fresh eyes while **observer agents** evaluate correctness and UX quality. User agents have zero knowledge of testIDs — they discover the UI by reading snapshots and deciding what to do, just like real users.

## Architecture

```
Orchestrator (you)
  ├── User Agent A (fresh per stage) → agent-browser --session user-a
  │     Knows: persona, goal, summary of what happened so far
  │     Writes: /tmp/e2e/transcripts/user-a.jsonl
  │
  ├── User Agent B (fresh per stage) → agent-browser --session user-b
  │     Knows: persona, goal, summary of what happened so far
  │     Writes: /tmp/e2e/transcripts/user-b.jsonl
  │
  ├── Flow Auditor (at checkpoints) → reads DB + transcripts + console
  │     Writes: /tmp/e2e/audit-report.md
  │
  ├── UX Observer (at checkpoints) → reads transcripts only
  │     Writes: /tmp/e2e/ux-report.md
  │
  └── Report Synthesizer (at end) → reads all files
        Writes: /tmp/e2e/final-report.md
```

## File Layout

```
/tmp/e2e/
  scenario.json          # Selected scenario + personas
  state.json             # Orchestrator state (user IDs, session ID, current stage)
  transcripts/
    user-a.jsonl         # User A interaction log (appended across agent spawns)
    user-b.jsonl         # User B interaction log (appended across agent spawns)
  screenshots/           # Named screenshots from confusion/stuck moments
  audit-report.md        # Flow Auditor findings
  ux-report.md           # UX Observer scores + evidence
  final-report.md        # Synthesized report
```

---

## Section 1: Scenario System

Parse `$ARGUMENTS` for flags:
- `--scenario <name>` — select a built-in scenario (default: `cooperative-couple`)
- `--start-at <stage>` — skip to a specific stage via seed-session API
- `--user-a "..."` and `--user-b "..."` — custom persona descriptions (overrides scenario)

### Built-in Scenarios

**cooperative-couple** (default):
```json
{
  "name": "cooperative-couple",
  "context": "Alice and Bob are a couple who had a fight about household chores. Alice feels Bob doesn't do his fair share. Bob feels Alice is too controlling about how chores are done. Both want to resolve it.",
  "userA": {
    "name": "Alice",
    "email": "alice@e2e.test",
    "persona": "You are Alice, a 32-year-old woman frustrated that your partner Bob doesn't help enough with household chores. You feel exhausted doing most of the work. You're willing to listen but need to feel heard first. You tend to be direct and sometimes come across as critical even when you don't mean to. Speak naturally — short sentences, real emotions, not therapy-speak."
  },
  "userB": {
    "name": "Bob",
    "email": "bob@e2e.test",
    "persona": "You are Bob, a 34-year-old man who feels your partner Alice micromanages how you do chores. When you do help, she re-does it 'the right way,' which makes you stop trying. You shut down when criticized. You want things to be better but don't know how to bring it up without a fight. Speak naturally — you're not great at expressing feelings."
  }
}
```

**defensive-couple**:
```json
{
  "name": "defensive-couple",
  "context": "Maria and James are a couple dealing with trust issues after James stayed out late without telling Maria. Maria feels disrespected. James feels suffocated. Both are defensive.",
  "userA": {
    "name": "Maria",
    "email": "alice@e2e.test",
    "persona": "You are Maria, 29. Your partner James stayed out until 3am without telling you where he was. You're hurt and angry. You tend to bring up past incidents when arguing. You want an apology but also want to understand why he did it. You're emotional and sometimes raise your voice (use caps or exclamation marks). You don't trust easily."
  },
  "userB": {
    "name": "James",
    "email": "bob@e2e.test",
    "persona": "You are James, 31. You went out with friends and lost track of time. You feel guilty but also feel like Maria is overreacting. You get defensive when accused and tend to minimize problems. You love Maria but hate feeling controlled. You give short answers when frustrated."
  }
}
```

**roommate-dispute**:
```json
{
  "name": "roommate-dispute",
  "context": "Sam and Alex are roommates. Sam plays loud music late at night. Alex is a light sleeper who has early morning classes. They've been passive-aggressive about it for weeks.",
  "userA": {
    "name": "Sam",
    "email": "alice@e2e.test",
    "persona": "You are Sam, 22, a music production student. You need to work on music in the evenings — it's not just fun, it's homework. You use headphones sometimes but mixing requires speakers. You think Alex is being unreasonable — they moved in knowing you're a music student. You're friendly but firm about your right to use common spaces."
  },
  "userB": {
    "name": "Alex",
    "email": "bob@e2e.test",
    "persona": "You are Alex, 21, a pre-med student with 7am anatomy labs. You can't sleep with bass vibrating through the walls. You've tried earplugs, white noise, everything. You like Sam as a person but you're at your breaking point. You tend to be conflict-avoidant and have been leaving passive-aggressive notes instead of talking directly."
  }
}
```

### Scenario Selection Logic

1. If `--scenario <name>` provided → use that built-in scenario
2. If `--user-a` and `--user-b` provided → create custom scenario with those persona descriptions, use default names/emails
3. Otherwise → use `cooperative-couple`

### Valid `--start-at` values

These map to the `targetStage` parameter of `POST /api/e2e/seed-session`:
- `CREATED` — session just created, compact not signed
- `EMPATHY_SHARED_A` — User A completed Stage 1 and shared empathy
- `FEEL_HEARD_B` — User B felt heard, reconciler has run
- `RECONCILER_SHOWN_B` — User B received share suggestion
- `CONTEXT_SHARED_B` — User B shared context
- `EMPATHY_REVEALED` — Both validated each other's empathy
- `NEED_MAPPING_COMPLETE` — Stage 3: needs identified
- `STRATEGIC_REPAIR_COMPLETE` — Stage 4: strategies collected

Write the resolved scenario to `/tmp/e2e/scenario.json`.

---

## Section 2: Phase 0 — Infrastructure Setup

### Step 0: Verify PostgreSQL with pgvector

This project uses devenv (Nix) to run PostgreSQL 16 with pgvector. Before starting servers:

```bash
# Check if PostgreSQL is running on port 5432
pg_isready -h localhost -p 5432 2>&1
```

If NOT running, start it manually using the Nix store binary:
```bash
PG_BIN=/nix/store/60z8vahbnw8vj9y4pqdmgfq9dgjwknbh-postgresql-and-plugins-16.9/bin
PGDATA=/Users/shantam/Software/meet-without-fear/.devenv/state/postgres
$PG_BIN/pg_ctl -D "$PGDATA" -l /tmp/e2e/postgres.log -o "-p 5432 -k /tmp" start
```

**WARNING:** Do NOT use `devenv up` — it requires a TTY and crashes in background mode. Use `pg_ctl` directly.

**WARNING:** Another project (scheduler4) may be running PostgreSQL 17.x on port 5432 WITHOUT pgvector. Check with:
```bash
ps aux | grep "bin/postgres" | grep -v grep
```
If you see a postgresql-17.x binary, kill it first — it won't have pgvector and migrations will fail with "extension vector is not available".

Verify pgvector works:
```bash
psql -h localhost -p 5432 -U mwf_user -d meet_without_fear -c "SELECT 1;" 2>&1
```

### Step 1: Kill existing servers

```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :8081 | xargs kill -9 2>/dev/null
echo "Ports cleared"
```

### Step 2: Verify environment

Check that `backend/.env` contains `E2E_AUTH_BYPASS=true`. If not, add it.

### Step 3: Create output directories

```bash
rm -rf /tmp/e2e && mkdir -p /tmp/e2e/{transcripts,screenshots}
```

### Step 4: Start servers in background

Run all three as background tasks:

```bash
# Backend (port 3000) — tsx without watch, no file watcher overhead
cd /Users/shantam/Software/meet-without-fear/backend && E2E_AUTH_BYPASS=true npx tsx src/server.ts 2>&1 | tee /tmp/e2e/backend.log

# Mobile web (port 8081) — --no-dev disables file watching and bundles in production mode
cd /Users/shantam/Software/meet-without-fear/mobile && EXPO_PUBLIC_E2E_MODE=true npx expo start --web --no-dev --clear 2>&1 | tee /tmp/e2e/mobile.log

# Website (port 3001) — dev mode required (no build step), file watcher overhead is minimal
cd /Users/shantam/Software/meet-without-fear && npm run dev:website 2>&1 | tee /tmp/e2e/website.log
```

### Step 5: Health check (with auth guard)

Wait 15 seconds, then verify all servers:

```bash
# Backend — check E2E auth works (HARD ABORT if not)
# IMPORTANT: Do NOT use POST /api/e2e/cleanup as health check — it deletes all E2E data!
# Use a safe GET endpoint instead.
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/e2e/seed -H 'Content-Type: application/json' -d '{"email":"healthcheck@e2e.test","name":"HealthCheck"}')
if [ "$BACKEND_STATUS" = "401" ] || [ "$BACKEND_STATUS" = "403" ]; then
  echo "FATAL: Backend returned $BACKEND_STATUS — E2E_AUTH_BYPASS is not set. Aborting."
  exit 1
fi
[ "$BACKEND_STATUS" = "200" ] && echo "Backend: OK" || echo "Backend: NOT READY ($BACKEND_STATUS)"

# Mobile web
curl -sf http://localhost:8081 -o /dev/null && echo "Mobile web: OK" || echo "Mobile web: NOT READY"

# Website
curl -sf http://localhost:3001 -o /dev/null && echo "Website: OK" || echo "Website: NOT READY"
```

**HARD ABORT**: If the backend returns 401 or 403 despite `E2E_AUTH_BYPASS=true`, stop the entire run immediately. Do NOT retry — this indicates a misconfigured environment and continuing would cause every API call to fail silently (auth looping). Fix the env and re-run.

For non-auth failures (connection refused, 500), retry up to 3 times with 10s gaps.

### Step 5b: Resource guard

Check available memory before proceeding. Three servers + two headed browsers can use 4-6GB:

```bash
# Check available memory (macOS)
FREE_MB=$(vm_stat | awk '/Pages free/ {free=$3} /Pages speculative/ {spec=$3} END {printf "%d", (free+spec)*4096/1048576}')
echo "Available memory: ${FREE_MB}MB"
if [ "$FREE_MB" -lt 2048 ]; then
  echo "WARNING: Less than 2GB free. E2E run may cause swapping. Consider closing other apps."
fi
```

If memory drops below 1GB during the run, the orchestrator should kill the browsers and servers before the system starts swapping.

### Step 6: Seed users and session

**If `--start-at` was specified:**

```bash
curl -s -X POST http://localhost:3000/api/e2e/seed-session \
  -H 'Content-Type: application/json' \
  -d '{
    "userA": {"email": "alice@e2e.test", "name": "<User A name from scenario>"},
    "userB": {"email": "bob@e2e.test", "name": "<User B name from scenario>"},
    "targetStage": "<start-at value>"
  }' | tee /tmp/e2e/seed-result.json | jq .
```

Save the returned `userA.id`, `userB.id`, `session.id`, and `pageUrls` from the response.

**If starting from scratch (no `--start-at`):**

```bash
# Cleanup old E2E data
curl -s -X POST http://localhost:3000/api/e2e/cleanup | jq .

# Seed User A
curl -s -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@e2e.test","name":"<User A name>"}' | tee /tmp/e2e/user-a.json | jq .

# Seed User B
curl -s -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@e2e.test","name":"<User B name>"}' | tee /tmp/e2e/user-b.json | jq .
```

Save the returned `id` values.

### Step 7: Launch browsers

**Browser A:**
```bash
agent-browser --session user-a --headed open "http://localhost:8081/?e2e-user-id=<USER_A_ID>&e2e-user-email=alice@e2e.test"
agent-browser --session user-a set viewport 390 812
agent-browser --session user-a wait --load networkidle
```

**Browser B** (if `--start-at` was used, both launch now; otherwise launch later when User B is invited):
```bash
agent-browser --session user-b --headed open "http://localhost:8081/?e2e-user-id=<USER_B_ID>&e2e-user-email=bob@e2e.test"
agent-browser --session user-b set viewport 390 812
agent-browser --session user-b wait --load networkidle
```

If `--start-at` was used and `pageUrls` were returned, navigate each browser directly to their session page URL.

---

## Section 3: Agent Prompts

### Naive User Agent Prompt

Spawn as a `general-purpose` agent. Give it this prompt (fill in the `{...}` placeholders):

```
You are playing the role of a real person using a conflict resolution app for the first time.

**Your persona:**
{persona}

**Your partner's name:** {partnerName}

**Your goal for this session:**
{goal}

**What happened so far (if anything):**
{previousContext}

**IMPORTANT RULES:**
1. You have NEVER used this app before. You don't know what buttons exist, what screens look like, or what the flow is. Discover everything by reading the screen.
2. Interact ONLY through the agent-browser CLI with session `{browserSession}`. Your primary loop is: snapshot → read → think → act.
3. Chat in-character. Write what your character would actually say — short, natural, emotional when appropriate. Do NOT write long therapeutic paragraphs.
4. When the screen says "waiting for partner" or similar — STOP. Log a `done` entry with reason "waiting for partner" and end your session. The orchestrator will restart you when your partner is ready.
5. End your session when: (a) your stage goal is clearly complete, (b) the screen shows you're waiting for your partner, (c) you are genuinely stuck for 3+ consecutive interactions with no progress, or (d) you've taken 25+ total actions (safety limit).
6. **Invitation handling:** If the app shows an invitation to send to your partner, do NOT try to actually send it (SMS, email, etc). Just review the message and tap "I have sent it" / Continue / Confirm. The orchestrator handles getting your partner into the session via API. After confirming the invitation, log `done` with reason "waiting for partner".

**TRANSCRIPT LOGGING:**
After EVERY interaction, append a JSON line to `/tmp/e2e/transcripts/{browserSession}.jsonl`. Each line must be one of these types:

- snapshot: `{"ts":"<ISO>","type":"snapshot","screen":"<describe what you see>","elements":"<key interactive elements with @refs>"}`
- think: `{"ts":"<ISO>","type":"think","thought":"<your reasoning>","confidence":"high|medium|low"}`
- action: `{"ts":"<ISO>","type":"action","action":"click|fill|scroll|navigate","target":"<what you're interacting with>","ref":"<@ref from snapshot>"}`
- result: `{"ts":"<ISO>","type":"result","expected":"<what you thought would happen>","actual":"<what actually happened>","success":true|false}`
- confusion: `{"ts":"<ISO>","type":"confusion","description":"<what's confusing>","screenshot":"/tmp/e2e/screenshots/<name>.png"}`
- stuck: `{"ts":"<ISO>","type":"stuck","description":"<why you're stuck>","tried":["<things you tried>"]}`
- done: `{"ts":"<ISO>","type":"done","reason":"<goal complete|waiting for partner|stuck|action limit>","state":"<current screen state>"}`

Take a screenshot (save to /tmp/e2e/screenshots/) whenever you're confused or stuck.

**CRITICAL TIPS for React Native Web:**
- The chat send button is an SVG icon near the bottom-right. It does NOT appear in accessibility snapshots. After typing a message with `fill`, click the send button using JavaScript:
  ```
  agent-browser --session {browserSession} eval 'document.querySelector("[aria-label=\"Send message\"]")?.click() || document.querySelectorAll("div[tabindex]").forEach(el => { const r = el.getBoundingClientRect(); if (r.x > 300 && r.y > 700 && r.width > 20 && r.width < 60) el.click(); })'
  ```
- After sending a message, wait 5-10 seconds for the AI to respond before taking the next snapshot.
- Some buttons (especially Pressable components) don't appear in snapshots. If you can see something on a screenshot but can't find it in the snapshot, use `eval` to find and click it by aria-label or position:
  ```
  agent-browser --session {browserSession} eval 'document.querySelector("[aria-label=\"LABEL\"]")?.click()'
  ```
- When a `click @ref` doesn't work on a React Native button, try using `eval` with the element's coordinates from the snapshot.

**agent-browser commands:**
- Snapshot: `agent-browser --session {browserSession} snapshot -i`
- Click: `agent-browser --session {browserSession} click @e1`
- Type: `agent-browser --session {browserSession} fill @e1 "text"`
- Scroll: `agent-browser --session {browserSession} scroll down` or `scroll up`
- Screenshot: `agent-browser --session {browserSession} screenshot /tmp/e2e/screenshots/<name>.png`
- Wait for page: `agent-browser --session {browserSession} wait --load networkidle`
- Wait ms: `agent-browser --session {browserSession} wait 3000`
- Errors: `agent-browser --session {browserSession} errors`
- Eval JS: `agent-browser --session {browserSession} eval '<js code>'`

**START NOW:** Take your first snapshot and begin exploring the app.
```

### Context Summary for Fresh Agents

Each time the orchestrator spawns a new user agent (for a new stage, or after a wait), it must provide `{previousContext}` — a brief summary so the agent understands where things stand. Examples:

**First spawn (no context):**
> This is your first time opening the app. No prior context.

**After Stage 1 complete, starting Stage 2:**
> You already told the AI your side of the story about the chore conflict. The AI understood that you feel exhausted and unappreciated. You confirmed you felt heard. Now the app is moving to the next phase.

**After waiting for partner:**
> You were waiting for your partner to finish their turn. They've now completed their part. Take a snapshot to see what's changed on your screen and continue from there.

The orchestrator builds this summary by reading the agent's most recent transcript entries (last 5-10 lines of their JSONL file) and the current DB state.

### Flow Auditor Prompt

Spawn as a `general-purpose` agent at each checkpoint:

```
You are the Flow Auditor for an E2E playthrough of a conflict resolution app. You have FULL knowledge of the app's internals.

**Your job:** Verify that the app is functioning correctly at this checkpoint.

**Checkpoint:** {checkpointName}
**Expected state:** {expectedState}

**Check the following:**

1. **Database state** — Query the database to verify session stage, message counts, empathy status, etc:
   ```bash
   cd /Users/shantam/Software/meet-without-fear/backend && npx tsx -e "
   const { PrismaClient } = require('@prisma/client');
   const p = new PrismaClient();
   (async () => {
     // Query relevant tables for session {sessionId}
     const session = await p.session.findUnique({ where: { id: '{sessionId}' }, include: { stageProgress: true, messages: { orderBy: { createdAt: 'desc' }, take: 5 } } });
     console.log(JSON.stringify(session, null, 2));
     await p.$disconnect();
   })();
   "
   ```

2. **Transcript issues** — Read `/tmp/e2e/transcripts/user-a.jsonl` and `/tmp/e2e/transcripts/user-b.jsonl`. Look for:
   - `confusion` entries (things the user found unclear)
   - `stuck` entries (places the user couldn't proceed)
   - `result` entries where `success: false`
   - Sequences of 3+ actions without a successful result

3. **Console errors** — Check both browsers for JavaScript errors:
   ```bash
   agent-browser --session user-a errors
   agent-browser --session user-b errors
   ```

4. **Cross-browser sync** — After one user completes an action that should update the partner's view:
   - Take snapshots of both browsers
   - Verify the partner's UI reflects the change (e.g., stage advancement, new messages)

5. **Server logs** — Check `/tmp/e2e/backend.log` for errors:
   ```bash
   grep -i "error\|fail\|exception\|unhandled" /tmp/e2e/backend.log | tail -20
   ```

**Output:** Write your findings to `/tmp/e2e/audit-report.md`. Append to the file (don't overwrite). Format:

```markdown
## Checkpoint: {checkpointName}
**Time:** <timestamp>
**DB State:** <summary>
**Issues Found:**
- [BUG] <description> (severity: critical/major/minor)
- [SYNC] <description>
- [ERROR] <description>
**Transcript Concerns:**
- <user>: <description of confusion/stuck pattern>
**Status:** PASS / FAIL / WARN
```
```

### UX Observer Prompt

Spawn as a `general-purpose` agent at each checkpoint:

```
You are a UX Observer evaluating a conflict resolution app. You have NO knowledge of the app's internals — you only see what users experienced.

**Read the transcripts:**
- `/tmp/e2e/transcripts/user-a.jsonl`
- `/tmp/e2e/transcripts/user-b.jsonl`

**Read the scenario:** `/tmp/e2e/scenario.json`

**Evaluate on 5 dimensions (score 1-5 each):**

1. **Discoverability** — Could users find what they needed without help?
   - Evidence: confusion entries, stuck entries, number of actions before finding the right button
   - 5 = always obvious, 1 = users frequently lost

2. **Clarity** — Was the text/microcopy clear and helpful?
   - Evidence: confusion entries about wording, think entries showing misunderstanding
   - 5 = crystal clear, 1 = confusing or misleading text

3. **Flow** — Did the experience feel natural and well-paced?
   - Evidence: stuck entries, long gaps between actions, unnecessary back-and-forth
   - 5 = smooth progression, 1 = broken or confusing flow

4. **Emotional Safety** — Did the app handle sensitive content appropriately?
   - Evidence: user reactions to AI responses, any jarring or dismissive AI output
   - 5 = empathetic and appropriate, 1 = tone-deaf or harmful

5. **Confidence** — Did users feel confident about what to do and what was happening?
   - Evidence: think entries with low confidence, confusion entries, repeated actions
   - 5 = always confident, 1 = frequently unsure

**Output:** Write to `/tmp/e2e/ux-report.md`. Append to the file. Format:

```markdown
## UX Evaluation: {checkpointName}

| Dimension | Score | Evidence |
|-----------|-------|----------|
| Discoverability | X/5 | <specific transcript references> |
| Clarity | X/5 | <specific transcript references> |
| Flow | X/5 | <specific transcript references> |
| Emotional Safety | X/5 | <specific transcript references> |
| Confidence | X/5 | <specific transcript references> |

**Overall:** X/5
**Top Issues:**
1. <most impactful issue with evidence>
2. <second issue>
3. <third issue>
```
```

### Report Synthesizer Prompt

Spawn as a `general-purpose` agent at the very end:

```
You are the Report Synthesizer. Read ALL files and produce the final E2E report.

**Read these files:**
- `/tmp/e2e/scenario.json` — scenario used
- `/tmp/e2e/state.json` — orchestrator state INCLUDING interventions array
- `/tmp/e2e/transcripts/user-a.jsonl` — User A's full transcript
- `/tmp/e2e/transcripts/user-b.jsonl` — User B's full transcript
- `/tmp/e2e/audit-report.md` — Flow Auditor findings
- `/tmp/e2e/ux-report.md` — UX Observer scores

**CRITICAL: Check `state.json` interventions array.** If it has ANY entries, the result MUST be "INTERVENED COMPLETION" — never "NATURAL COMPLETION". Also check audit-report.md for any "SILENT UI FAILURE" entries.

**Produce `/tmp/e2e/final-report.md` with this structure:**

```markdown
# E2E Playthrough Report
**Scenario:** <name>
**Date:** <date>
**Duration:** <start to end time>
**Result:** NATURAL COMPLETION / INTERVENED COMPLETION / BLOCKED (at stage X)

## Summary
<2-3 sentence overview of what happened>

## Completion Integrity
**Classification:** Natural / Intervened / Blocked
**Interventions:** <count> stage(s) required seed-session jumps
**Silent UI Failures:** <count> buttons that appeared to work but had no backend effect
**Sync Timeouts:** <count> times DB lagged behind UI

> ⚠️ If any interventions occurred, this run does NOT prove the app works end-to-end.
> The stages that required intervention have critical UX or functionality issues.

## Intervention Audit Trail
| # | Stage | User | Reason | Action | Screenshot |
|---|-------|------|--------|--------|------------|
| 1 | Stage 1 | user-a | No visible "feel heard" button | seed-session jump | hard-fail-user-a-stage1.png |

## Silent UI Failures
| # | Stage | User | Agent Claim | DB Reality |
|---|-------|------|-------------|------------|
| 1 | Stage 1 | user-a | "confirmed feel heard" | stageProgress still GATHERING |

## Progress Timeline
| Time | User | Event | Notes |
|------|------|-------|-------|
| ... | A | Created session | ... |
| ... | A | Signed compact | ... |
| ... | B | Joined session | ... |

## Bugs Found
| # | Severity | Description | Evidence | Stage |
|---|----------|-------------|----------|-------|
| 1 | critical | ... | transcript line / screenshot | ... |

## UX Scores
| Dimension | Score | Trend |
|-----------|-------|-------|
| Discoverability | X/5 | ... |
| ... | | |

## Confusion Heatmap
List every confusion and stuck entry from both transcripts, grouped by screen/stage:
- **Stage 1 (Tell Your Side):** 3 confusion moments — <summaries>
- **Compact Screen:** 1 stuck moment — <summary>

## Recommendations
1. <highest impact recommendation with evidence>
2. ...
3. ...

## Raw Data
- User A transcript: /tmp/e2e/transcripts/user-a.jsonl (<N> entries)
- User B transcript: /tmp/e2e/transcripts/user-b.jsonl (<N> entries)
- Screenshots: /tmp/e2e/screenshots/ (<N> files)
- Interventions: <N> (from state.json)
```
```

---

## Section 4: Orchestrator Loop

You (the orchestrator) drive the overall flow. You spawn **fresh user agents for each stage** — this keeps context clean and lets you provide updated summaries of what happened so far.

### State File: `/tmp/e2e/state.json`

The orchestrator maintains a state file that tracks IDs discovered during the run:

```json
{
  "userA": { "id": "<from seed response>", "email": "alice@e2e.test", "name": "Alice" },
  "userB": { "id": "<from seed response>", "email": "bob@e2e.test", "name": "Bob" },
  "sessionId": null,
  "invitationId": null,
  "currentStage": "PRE_SESSION",
  "interventions": []
}
```

User IDs come from the seed API response (Step 6). Session ID and invitation ID are discovered later — see below.

The `interventions` array tracks every time the orchestrator had to "cheat" past a blocker. Any run with interventions is flagged as **Intervened Completion** (not Natural Completion) in the final report. Each entry looks like:

```json
{
  "type": "intervention",
  "ts": "<ISO timestamp>",
  "stage": "FEEL_HEARD_B",
  "user": "user-a",
  "reason": "stuck after diagnostic scan — no visible 'feel heard' affordance",
  "action": "seed-session jump to next stage",
  "screenshot": "/tmp/e2e/screenshots/stuck-user-a-stage1.png"
}
```

### Execution Model

**Step 1: Spawn User A for Stage 1** (run in background)

User A creates a session, signs the compact, chats with the AI, and eventually reaches the invitation screen. When User A logs a `done` entry, the agent stops.

**Step 2: Discover session ID**

When User A's agent finishes (or periodically while it runs), query the DB to find the session User A created:

```bash
cd /Users/shantam/Software/meet-without-fear/backend && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const session = await p.session.findFirst({
    where: { userVessels: { some: { userId: '<USER_A_ID>' } } },
    orderBy: { createdAt: 'desc' },
    include: { invitations: true }
  });
  console.log(JSON.stringify({
    sessionId: session?.id,
    invitationId: session?.invitations?.[0]?.id,
    status: session?.status
  }));
  await p.\$disconnect();
})();
"
```

Write the discovered `sessionId` and `invitationId` to `/tmp/e2e/state.json`.

**Step 3: Accept invitation via API**

```bash
curl -s -X POST "http://localhost:3000/api/invitations/<INVITATION_ID>/accept" \
  -H 'Content-Type: application/json' \
  -H 'x-e2e-user-id: <USER_B_ID>' \
  -H 'x-e2e-user-email: bob@e2e.test' | jq .
```

**Step 4: Launch Browser B and navigate to session**

```bash
agent-browser --session user-b --headed open "http://localhost:8081/?e2e-user-id=<USER_B_ID>&e2e-user-email=bob@e2e.test"
agent-browser --session user-b set viewport 390 812
agent-browser --session user-b wait --load networkidle
```

Then navigate User B's browser to the session (the URL will be something like `http://localhost:8081/session/<SESSION_ID>`). Also refresh User A's browser so it picks up the partner-joined state:

```bash
agent-browser --session user-a open "http://localhost:8081/session/<SESSION_ID>"
agent-browser --session user-a wait --load networkidle
```

**Step 5: Spawn User B for Stage 1** (run in background)

Give User B their Stage 1 goal + persona. No previous context needed — this is their first interaction.

**Step 6: Monitor and advance (Truth Arbiter)**

The orchestrator is the **Truth Arbiter** — it never blindly trusts an agent's claim of success. Every `done` entry is cross-referenced with the database.

The orchestrator loop:

1. Wait for an agent to finish (they stop on `done` — either goal complete, waiting for partner, stuck, or action limit)
2. Read the agent's transcript — check the last `done` entry's `reason` field
3. **DB VERIFICATION** (mandatory before advancing):

```bash
cd /Users/shantam/Software/meet-without-fear/backend && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const sp = await p.stageProgress.findMany({ where: { sessionId: '<SESSION_ID>' }, orderBy: { updatedAt: 'desc' } });
  const s = await p.session.findUnique({ where: { id: '<SESSION_ID>' }, select: { status: true } });
  const msgCount = await p.message.count({ where: { sessionId: '<SESSION_ID>' } });
  console.log(JSON.stringify({ session: s, stages: sp, messageCount: msgCount }, null, 2));
  await p.\$disconnect();
})();
"
```

   - If the agent reported "goal complete" but the DB shows no stage advancement → log a **Silent UI Failure**: the agent thinks it clicked a button that did nothing. This is a critical bug. Append to audit-report.md:
     ```
     ## SILENT UI FAILURE
     **User:** user-a
     **Stage:** Stage 1
     **Agent claim:** "goal complete — confirmed feel heard"
     **DB state:** stageProgress still at GATHERING, feelHeard not set
     **Diagnosis:** Agent clicked a button that appeared to work but had no backend effect
     ```
   - If the agent reported "goal complete" and DB confirms → advance normally
   - If DB is behind (agent done but stage not advanced) → wait 10 seconds and re-check once. If still behind, log a **Sync Timeout** and treat as a silent UI failure

4. Run checkpoint observers (Flow Auditor + UX Observer in parallel)
5. If both agents completed their goal AND DB confirms → advance to next stage, spawn fresh agents with new goals + context summary
6. If one agent is waiting for partner → the partner's agent should still be running; wait for it
7. If an agent is stuck → run Diagnostic-then-Jump protocol (see below)

### If `--start-at` was used

Both browsers are already open and navigated to their session URLs. The orchestrator spawns both user agents immediately with the goal for the target stage. `{previousContext}` should describe the seeded state:

> The session has been set up with pre-existing data. You and your partner have already completed the earlier stages. Take a snapshot to see where things stand and continue from there.

### Wait Handling

When a user agent sees "waiting for partner," it **stops** (logs `done` with reason `waiting for partner`). The orchestrator then:

1. Waits for the partner's agent to finish its turn
2. Polls DB to confirm state has advanced
3. Spawns a **fresh agent** for the waiting user with an updated context summary:
   > You were waiting for your partner to finish. They've completed their part. Take a snapshot to see what's changed.

This is simpler and more reliable than having agents poll in a loop. The orchestrator controls all the timing.

### Stuck Detection: Diagnostic-then-Jump Protocol

If a user agent's last `done` entry has reason `stuck`, follow this protocol **in order**:

**Phase 1: Deep Scan (diagnostic)**

Before giving up, force the agent to do a full-page inventory. Spawn a new agent with this goal:

> You got stuck earlier. Before we skip ahead, do a thorough scan of your current screen:
> 1. Scroll all the way to the bottom, taking a snapshot at each scroll position
> 2. Scroll back to the top
> 3. Describe every interactive element you see, including any that might be partially hidden, in a drawer, or behind a menu
> 4. Take a screenshot of the full page
> 5. If you now see something you missed before, try it. Otherwise, log `done` with reason `stuck` again.

This catches the case where the affordance exists but was below the fold or in a collapsed section.

**Phase 2: Escalation (directed goal)**

If the Deep Scan agent is still stuck, spawn one more agent with a **more directed goal** — still no testIDs, but narrower scope:
- Instead of "Tell the AI what happened" → "Look for a text input area at the bottom of the screen. Type what happened with the chores."
- Instead of "Signal you feel heard" → "After reading the AI's summary, look for a button or option that lets you confirm it captured your feelings."

**Phase 3: Seed-Session Jump (intervention)**

If still stuck after escalation, the blocker is a genuine UX failure. The orchestrator:

1. Takes a final screenshot: `agent-browser --session <session> screenshot /tmp/e2e/screenshots/hard-fail-<user>-<stage>.png`
2. Appends an intervention to `state.json`:
   ```json
   {
     "type": "intervention",
     "ts": "<ISO timestamp>",
     "stage": "<current stage>",
     "user": "<user-a or user-b>",
     "reason": "stuck after diagnostic scan + escalation — <description of what's missing>",
     "action": "seed-session jump",
     "screenshot": "/tmp/e2e/screenshots/hard-fail-<user>-<stage>.png"
   }
   ```
3. Uses `POST /api/e2e/seed-session` to jump to the next stage
4. Refreshes both browsers and continues the run

**CRITICAL**: Any use of seed-session to skip a stage marks the entire run as **Intervened Completion**. The Report Synthesizer must flag this prominently — the test passed "technically" but the UX is broken at that stage.

### Stage Transition Detection

Poll the database to detect when stages advance:

```bash
cd /Users/shantam/Software/meet-without-fear/backend && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const sp = await p.stageProgress.findMany({ where: { sessionId: '<SESSION_ID>' }, orderBy: { updatedAt: 'desc' } });
  const s = await p.session.findUnique({ where: { id: '<SESSION_ID>' }, select: { status: true } });
  console.log(JSON.stringify({ session: s, stages: sp }, null, 2));
  await p.\$disconnect();
})();
"
```

### Fresh Agent Lifecycle Summary

```
Stage 1A: spawn User A agent → runs until done → orchestrator discovers session ID
           → accepts invitation → spawns User B agent
Stage 1B: User B agent runs → done → orchestrator checks DB
           → User A may need re-spawn if UI changed
Stage 2:  spawn fresh agents for both users with Stage 2 goals + context summaries
           → agents run in parallel (background) → both finish → checkpoint
Stage 3:  spawn fresh agents with Stage 3 goals + summaries of Stage 1-2
Stage 4:  spawn fresh agents with Stage 4 goals + summaries of Stage 1-3
```

Each agent gets: persona (unchanged), goal (stage-specific), previousContext (built from transcript + DB).

---

## Section 5: Checkpoints

At each checkpoint, spawn Flow Auditor and UX Observer agents (can run in parallel).

| # | Checkpoint | Trigger | What to Verify |
|---|-----------|---------|----------------|
| 1 | Session Created | User A creates session | Session exists in DB, compact unsigned |
| 2 | Compact Signed | User A signs compact | Compact record created, stage advances |
| 3 | Stage 1A Complete | User A signals "feel heard" | Messages exist, feelHeard flag set |
| 4 | Invitation Accepted | User B joins | Both users in session, invitation status updated |
| 5 | Stage 1B Complete | User B signals "feel heard" | Reconciler ran, empathy generated |
| 6 | Share Suggestion | Reconciler offers share | ReconcilerShareOffer exists, UI shows panel |
| 7 | Context Exchanged | Both share/receive context | SHARED_CONTEXT messages exist for both |
| 8 | Empathy Revealed | Both validate | empathyRevealed flags set |
| 9 | Session Complete | Stage 3+ done or session ends | Final session status correct |

---

## Section 6: Orchestrator Stage Goals Reference

These are the goals you give to each user agent at each stage. They describe WHAT to accomplish, never HOW (no testIDs, no button names).

### Stage 1: Tell Your Side

**User A (first):**
> You've just opened a new conflict resolution session. The app will guide you through telling your side of the story. Talk to the AI about what happened — describe the conflict from your perspective. Be honest and speak naturally as your character would.
>
> Early on, the app will show an invitation message for your partner (an "Invite [partner name]" button). When you see it, tap "I have sent it" or the continue/confirm button — do NOT try to actually send it via SMS/email. The orchestrator handles getting your partner into the session via API.
>
> Keep chatting after confirming the invitation. The AI will continue to help you process your feelings. Eventually a "feel heard" button or similar confirmation will appear — tap it when you genuinely feel the AI understands your experience. After confirming feel-heard, log `done` with reason "waiting for partner".

**User B (after joining):**
> You've just joined a conflict resolution session your partner started. The app will ask you to tell your side of the story. Talk to the AI about what happened from YOUR perspective. Be honest — you'll probably see things differently than your partner. When you feel like the AI understands you, look for a way to confirm that.

### Stage 2: Empathy Exchange

**User (receiving share suggestion):**
> The app may suggest sharing something with your partner. Read what it's offering and decide what feels right. Follow the app's guidance — it will walk you through an exchange of perspectives.

**User (receiving context from partner):**
> Your partner has shared something with you. Read it carefully and respond honestly. The app will guide you through understanding their perspective.

### Stage 2 Escalation Goals (if stuck):

> Look for a panel or card that appeared on your screen — it might be asking you to share your empathy with your partner, or showing you something your partner shared. Tap on it to continue.

### Stage 3: Needs Mapping

**Both users:**
> The app wants to understand what each of you needs going forward. Talk to the AI about what matters most to you in resolving this conflict. What do you need from your partner? What are you willing to offer?

### Stage 4: Strategic Repair

**Both users:**
> You're in the final stage. The app is helping you and your partner find concrete solutions. Engage with whatever the app presents — it might ask you to evaluate strategies, make commitments, or agree on next steps.

### Universal Escalation (for any stage):

> Take a careful look at your screen. Is there a button, card, panel, or prompt you haven't interacted with yet? Sometimes the next step is in a drawer or panel that slides up from the bottom, or in a menu. Try scrolling down or looking for any highlighted/colored elements. If you see text asking you to do something, follow those instructions.

---

## Section 7: Report Generation

After the session resolves (all stages complete) or the orchestrator decides to stop (agents stuck, critical error):

1. **Spawn Report Synthesizer** agent to read all files and produce `/tmp/e2e/final-report.md`

   The synthesizer MUST read `/tmp/e2e/state.json` and check the `interventions` array. The run's result classification:

   | Interventions | Silent UI Failures | Result |
   |---------------|-------------------|--------|
   | 0 | 0 | **NATURAL COMPLETION** — the app works as intended |
   | 0 | 1+ | **TECHNICALLY COMPLETE, UI FAILURES** — app works but buttons silently fail |
   | 1+ | any | **INTERVENED COMPLETION** — test passed but only because we cheated past blockers |
   | n/a | n/a (run stopped) | **BLOCKED** — could not complete even with intervention |

   The final report MUST include an **Intervention Audit Trail** section listing every intervention from state.json with screenshots. This prevents the test suite from masking critical UX issues by silently skipping past them.

2. **Print summary** to the user:
   - Overall result (NATURAL COMPLETION / INTERVENED COMPLETION / BLOCKED)
   - **If intervened**: list every stage that required intervention
   - **If silent UI failures**: list every button that didn't work
   - Bugs found (count + top 3)
   - UX scores (5 dimensions)
   - Location of full report: `/tmp/e2e/final-report.md`
3. **Clean up browsers:**
   ```bash
   agent-browser --session user-a close
   agent-browser --session user-b close
   ```

---

## Section 8: Execution Checklist

Follow this checklist when running the playthrough:

- [ ] Parse arguments (scenario, start-at)
- [ ] Kill ports, verify env, start servers
- [ ] Health check all 3 servers
- [ ] Create /tmp/e2e/ directory structure
- [ ] Seed users/session, write state.json with user IDs
- [ ] Write scenario.json
- [ ] Launch Browser A, authenticate, wait for networkidle
- [ ] Spawn User A agent for Stage 1 (background)
- [ ] When User A finishes: query DB for session ID + invitation ID, update state.json
- [ ] Accept invitation via API
- [ ] Launch Browser B, authenticate, wait for networkidle
- [ ] Navigate both browsers to session URL
- [ ] Spawn User B agent for Stage 1 (background)
- [ ] When both agents finish: run checkpoint observers, read transcripts, check DB
- [ ] For each subsequent stage: spawn fresh agents with updated goals + context summaries
- [ ] On `stuck`: re-spawn with escalation goal; if still stuck, skip via seed-session
- [ ] On `waiting for partner`: wait for partner agent, then re-spawn waiting user
- [ ] When complete/blocked: spawn Report Synthesizer
- [ ] Print summary, clean up browsers

## Key Reminders

- **No testIDs in user agent prompts.** They discover the UI by reading snapshots.
- **Use `fill` not `type`** for React Native Web text inputs (in the agent-browser commands reference).
- **EXPO_PUBLIC_E2E_MODE must be set at bundle time** — before starting Expo, not after.
- **Invitation acceptance is mechanical** — the orchestrator does it via API, not the user agent.
- **Real AI responses** — no fixtures, no mocking. Tests actual Bedrock calls.
- **Agents interact via agent-browser CLI**, not Playwright MCP tools.
- **Never trust agent claims.** Always cross-reference `done` entries with DB state before advancing.
- **Auth failures = hard abort.** 401/403 from backend means E2E_AUTH_BYPASS is broken — don't retry.
- **Every seed-session jump is an intervention.** Log it, screenshot it, flag the run as Intervened.
- **Diagnostic before jumping.** Always do a Deep Scan (full-page scroll + inventory) before skipping a stage.
- **M4 16GB RAM constraint.** 3 servers + 2 headed browsers ≈ 4-6GB. Watch memory, kill early if swapping.
- **NEVER use POST /api/e2e/cleanup as a health check.** It deletes all E2E data. If called while an agent is mid-session, it destroys the session and causes 403 errors on all subsequent API calls. Use a GET endpoint for health checks.
- **React Native Web send button is invisible to snapshots.** The chat send button is a `<div tabindex=0>` with an SVG child, not an accessible button. Agents must use `eval` with coordinate-based or aria-label-based clicking to interact with it.
- **PostgreSQL must be the Nix PG16 with pgvector.** Other PostgreSQL instances (e.g., from scheduler4 devenv) on port 5432 will lack pgvector and migrations will fail. Always verify the binary: `ps aux | grep postgres`.
- **`devenv up` crashes without a TTY.** Use `pg_ctl` directly to start PostgreSQL in background mode.
- **Prisma schema uses `userVessels` not `participants`.** DB queries for session membership must use `userVessels`. Invitations are `invitations` (plural array), not `invitation`.
- **Always include E2E auth params when navigating browsers.** If you navigate to a session URL without `?e2e-user-id=X&e2e-user-email=Y`, the app loses auth context and shows a broken "Partner" compact screen. Every `agent-browser open` call must include the full auth query string.
