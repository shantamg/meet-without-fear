# Autonomous E2E Testing — Big Picture Plan

The end goal: slam-paws can run a real Playwright e2e test against the MWF web app on EC2, capture screenshots and DB state, post results to a navigable web dashboard, and let a human (Shantam or Darryl) browse runs, branch from any prior snapshot, and re-run after a fix. All triggerable from Slack.

This document is the umbrella plan. The dashboard sub-plan lives at [`TEST_DASHBOARD_PLAN.md`](./TEST_DASHBOARD_PLAN.md).

## Why this exists

Today, slam-paws can do code review, fix bugs from issues/Sentry, and post Slack messages — but it can't *use the product*. Every fix is reasoned about from code reading, never verified end-to-end. Two real consequences:

1. PR #141 fixed the `[AI processing]` placeholder bug, but PR #188 (Darryl's blank-revision) is the same class of bug in a path the test suite doesn't cover. Drift accumulates between fixes and the regressions that should catch them.
2. Darryl repeatedly hit "session can't complete" bugs that weren't visible to the bot. The human-in-the-loop bottleneck is *Shantam's testing time*, not the bot's coding time.

Closing this loop turns the bot from a code-only contributor into a full developer that can ship + verify in one cycle.

## The pipeline (target state)

```
[ Trigger ] → [ Run ] → [ Capture ] → [ Store ] → [ Browse ]
   slack          bot           screenshots,        Vercel       test-dashboard
   web ui         starts        DB state,           Postgres     web app
   cron           backend +     console errors      + Blob       (with branch /
                  expo,         + transcript                       re-run buttons)
                  drives
                  webkit
```

Each leg has multiple components, listed in detail below.

## What's shipped

Infrastructure on slam-bot (EC2 host `52.88.216.17`):

| Component | Status |
|---|---|
| Postgres 16 + pgvector | Installed via apt |
| 3 mwf databases (`meet_without_fear`, `_shadow`, `_test`) + `mwf_user` | Created |
| 50 Prisma migrations | Applied |
| Backend / e2e / mobile / shared `node_modules` | Installed |
| Playwright 1.59.1 + Chromium + WebKit + system deps | Installed |
| `edge-tts` (for voice messages) | Installed via pipx |
| Env vars on `/opt/slam-bot/.env` | Copied from local: Ably, Bedrock, Clerk, OpenAI, Resend, AssemblyAI, plus `E2E_AUTH_BYPASS=true`, `MOCK_LLM=true`, `DAILY_SUMMARY_CHANNEL_ID` |

**Caveat:** none of the EC2-only setup is in any repo or Ansible. If the box is rebuilt, this all has to be redone manually. Future: an Ansible playbook or terraform module captures it.

Code shipped (PRs merged):

| PR | Subject |
|---|---|
| #190 | `process-queue.sh` — `conversations.replies` for thread-reply cancel + always remove hourglass on cancel |
| #191 | socket-listener monitors `#daily-summary` channel |
| #192 | e2e — drop stale `compact-agree-checkbox` testID + `--no-dev` for production bundle |
| #193 | backend CORS allowlist includes `localhost:8082` (e2e port) |
| #194 | e2e — update waiting-status copy assertion |

Test status:
- `single-user-journey.spec.ts` runs end-to-end on EC2 and progresses through ~19 of ~25 steps successfully.
- All of Stage 0 (compact, mood-check), all of Stage 1 (chat → feel-heard → invite), and into Stage 2 empathy share work.
- Fails at Step 20 (post-empathy-share navigation to `/share` route). Likely 1-3 more drift bugs to chase.

Dashboard scaffold (open as branch `feat/test-dashboard`, **not yet merged**):
- `tools/test-dashboard/`: Vite + React 19 + react-router-dom v7 SPA with 5 routes (runs feed, run detail, snapshots tree, snapshot detail, new run).
- `tools/test-dashboard/api/`: Vercel serverless functions backed by `@vercel/postgres`. Endpoints: `runs/index`, `runs/[id]`, `snapshots/index`, `snapshots/[id]`, `artifacts/index`. Bot mutations gated by `x-bot-token`.
- `tools/test-dashboard/db/{schema.sql,migrate.ts}`: idempotent DDL with CHECK constraints + FKs, migrate script run via `tsx`.
- `tools/test-dashboard/SETUP.md`: 8-step operator guide for provisioning Vercel project / Postgres / Blob / GH variables / EC2 env.
- `scripts/ec2-bot/scripts/write-test-result.ts`: CLI the EC2 bot calls after each run. Uploads screenshots to Vercel Blob, posts run + artifact rows, PATCHes final run status.
- `.github/workflows/vercel-deploy-test-dashboard.yml`: deploys on push to main when `tools/test-dashboard/**` changes.

The dashboard is read-and-write-capable in code, but **no real run has flowed through it yet** because none of the operationalization is done.

## What's NOT done — in priority order

### Tier 0 — Operationalize Phase 1A (gets the dashboard live)

Without these, `feat/test-dashboard` is just dead code in the repo.

1. **Provision Vercel project** + Postgres + Blob per `tools/test-dashboard/SETUP.md` Steps 1-4.
2. **Run db migration** (`npx tsx db/migrate.ts` against the new Postgres).
3. **Set env vars** on the EC2 bot:
   - `TEST_DASHBOARD_API_URL` — the Vercel deployment URL
   - `BOT_WRITER_TOKEN` — generated random string, also set on Vercel project as same name
   - `BLOB_READ_WRITE_TOKEN` — auto-issued by the Blob integration
4. **Install bot-side deps** in `~/projects/meet-without-fear/scripts/ec2-bot/`: `npm i -D tsx` and `npm i @vercel/blob` (or wire into the existing root install).
5. **Decide hostname** — `test-dashboard.meetwithoutfear.com` via CNAME, or just use the auto Vercel URL for v1.
6. **Merge `feat/test-dashboard`** PR (the GH workflow auto-deploys from main).

Estimated time: 30-60 min of click-ops + one `vercel link` session.

### Tier 1 — Wire the bot to actually call the writer

The dashboard exists, the writer script exists, but no playwright run actually invokes the writer yet. Need:

1. **`scripts/ec2-bot/scripts/test-runner.sh`** — single entry point that:
   - Parses args: `--scenario <name>` (required), `--from-snapshot <id>` (optional), `--screenshot-policy {failures|every-step}` (default `failures`)
   - Restores DB from snapshot if `--from-snapshot` given (uses existing `backend/snapshots/reset-to-snapshot.ts`)
   - Starts the playwright run, captures stdout
   - Globs the resulting `e2e/test-results/**/test-failed-*.png` and `video.webm`
   - Calls `write-test-result.ts` with all artifacts + scenario + status + duration + final stage
   - Optionally takes a final DB snapshot (always-on per default per Shantam's preference) and posts to `snapshots` table
   - Echoes the dashboard URL for the run

2. **Cron entry** for daily smoke run (`0 7 * * *` runs `single-user-journey` and posts to `#daily-summary`).

Without Tier 1, the dashboard stays empty.

### Tier 2 — Slack trigger (`@slam_paws test …`)

1. **`bot-workspaces/session-test/CLAUDE.md`** — workspace contract:
   - Classifies the request: `run`, `list`, `diff`, `snapshot`
   - Resolves args (scenario name, snapshot id) from natural language
   - Invokes `test-runner.sh` with the right flags
   - Posts a thread reply with: dashboard URL + (if pass) one screenshot, (if fail) screenshot of failure point + assertion text
2. **Channel handler** in `socket-listener.mjs`:
   - Either pattern-match `@slam_paws test ...` in any monitored channel, OR
   - Add a dedicated `#tests` channel to `CHANNEL_CONFIG` (mirror the `#daily-summary` PR pattern)
3. **Trigger via slash command** (optional, more discoverable): `/test-session [scenario]` registered in the Slack app.

After Tier 2, the loop closes for the first time: type in slack → bot runs test → posts result + dashboard link.

### Tier 3 — Web "New run" trigger (Phase 1B)

The dashboard `NewRunPage.tsx` already exists and posts to `/api/runs` with `status=queued`. The piece missing is the bot polling for queued rows.

1. **`scripts/ec2-bot/scripts/poll-queued-runs.sh`** — cron entry that:
   - Hits `GET /api/runs?status=queued` every minute
   - Picks the oldest, calls `PATCH /api/runs/:id` to mark `running`
   - Invokes `test-runner.sh` with the row's scenario + snapshot args
   - On completion, the writer already PATCHes the row to `pass`/`fail`
2. **Authentication** — uses the same `BOT_WRITER_TOKEN` the writer uses.

After Tier 3, you can click "Run" in the dashboard and the bot picks it up within a minute.

### Tier 4 — Snapshot lineage (the branchable graph)

Today: `backend/snapshots/create-snapshot.ts` and `reset-to-snapshot.ts` produce/restore raw `.sql` dumps with no metadata. The dashboard's `snapshots` table exists but is unpopulated.

1. **Extend `create-snapshot.ts`** to take `--scenario`, `--parent-snapshot-id`, `--final-stage`, `--code-sha` args and write the metadata row to the dashboard's Postgres via the writer API.
2. **`test-runner.sh`** always calls `create-snapshot.ts` at end of run with the right metadata (default-on per Shantam's design preference).
3. **`reset-to-snapshot.ts`** stays as-is (it just restores from a `.sql` file given a path).
4. **Optionally**: store the `.sql` file in Vercel Blob too so snapshots are recoverable even if EC2 dies. Not critical for v1.

After Tier 4, the snapshot tree page on the dashboard becomes useful and the "branch from snapshot" flow works.

### Tier 5 — Cost + quality guards

1. **Daily cap** for live-AI runs (real Bedrock costs ~$1-3/run). Env-driven: `MAX_LIVE_AI_RUNS_PER_DAY=5`. Bot refuses if exceeded.
2. **Disk guard** — snapshots accumulate; `.sql` files run 10-50 MB each. Cron rotation: keep all snapshots from last 7 days, weekly snapshots beyond that, monthly beyond 30 days.
3. **Memory guard** — backend + expo + 2 webkit instances on a 3.7 GB box can OOM. test-runner.sh checks free memory before launching browsers; aborts with a clean error if < 1 GB free.

### Tier 6 — Phase 1C polish (dashboard nice-to-haves)

1. **DB diff view** on run detail page — JSON diff of relevant tables (Session, Message, StageProgress, EmpathyAttempt) between starting and ending snapshots.
2. **Live tail** via Ably during a run. Bot publishes `test-runs:updates` events at start, every step, completion. Dashboard subscribes; in-progress runs auto-refresh.
3. **Auth** — Clerk allowlist (Shantam + Darryl emails) before sharing the URL externally.
4. **Transcript view** — sequential view of every chat message + AI response in the test session.
5. **Queue sidebar** showing pending/running/recently-completed runs.

### Tier 7 — Reach beyond `single-user-journey`

Once the loop works for one test, expand:

1. **Fix the remaining drift in `single-user-journey.spec.ts`** (Step 20+ — share screen navigation). 1-3 more PR cycles.
2. **`two-browser-stage-2.spec.ts`** — covers the empathy refinement bug (#188) Darryl hit. Almost certainly needs its own drift fixes.
3. **`live-ai-full-flow.spec.ts`** — real Bedrock, the full loop. Manual trigger only (cost). One run a day on cron.
4. **Adapt the `e2e-session-playthrough` skill** for autonomous bot use. The skill is currently designed for Shantam's local Mac (devenv, headed browsers). Port to EC2 with headless + the existing test-runner.sh.

## Decisions still open

1. **Vercel Postgres vs. existing Render Postgres for test data?** Plan recommendation: Vercel Postgres (isolated from production). The scaffold assumes this.
2. **Run from web → bot trigger model?** Plan recommendation: bot polls Vercel Postgres every minute (no inbound HTTPS exposure on EC2). The scaffold supports this.
3. **Auth in Phase 1A?** Plan recommendation: skip until before sharing with Darryl. Scaffold currently has no auth.
4. **Hostname for the dashboard?** Default: auto Vercel URL. Optional: CNAME `test-dashboard.meetwithoutfear.com` pointing at Vercel.
5. **Snapshot retention policy** (Tier 5.2) — exact thresholds.
6. **Cron schedule for daily smoke run** — what scenario, what time, post to which channel.

## Minimum to "first useful Slack interaction"

If the goal is "Shantam types `@slam_paws test single-user-journey` in Slack and a screenshot + dashboard link comes back," the smallest path is:

1. Tier 0 step 1-6 (provision Vercel + merge dashboard PR) — ~45 min
2. Tier 1 step 1 (`test-runner.sh`) — ~30 min
3. Tier 2 step 1 + 2 (`session-test` workspace + channel handler) — ~45 min

After those three, the slack-trigger loop closes. Tier 3+ are additive.

## Path forward (suggested sequence for next sittings)

1. **Sitting 1 — Operationalize:** Tier 0 (Vercel provisioning) + merge `feat/test-dashboard`. End state: dashboard URL exists, empty.
2. **Sitting 2 — Wire the writer:** Tier 1.1 (`test-runner.sh`) + run `single-user-journey` once manually. End state: one row in the dashboard, screenshot visible.
3. **Sitting 3 — Slack trigger:** Tier 2. End state: `@slam_paws test ...` works.
4. **Sitting 4 — Snapshot graph:** Tier 4. End state: tree view populates, "Run from here" buttons work.
5. **Sitting 5 — Web trigger:** Tier 3. End state: "New run" button on dashboard works.
6. **Sitting 6+ — Polish + expand:** Tiers 5, 6, 7 as needed.

Each sitting is self-contained and ships value independently.
