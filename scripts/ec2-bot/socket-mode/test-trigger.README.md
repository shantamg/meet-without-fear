# Slack `@slam_paws test` trigger

Lets you kick off a Playwright e2e run from any channel where the bot can read messages, instead of SSHing to EC2 to launch `run-and-publish.sh` by hand.

## Usage

In Slack, mention the bot followed by `test <scenario>`:

```
@slam_paws test single-user-journey
@slam_paws test two-browser-stage-2
@slam_paws test stage-3-4-complete from-snapshot:01HK1234
```

The scenario name is the spec's filename without `.spec.ts`. See `e2e/tests/` for the canonical list.

## What happens

1. **Immediate**: bot adds 👀 reaction and posts a thread reply: *"Running `<scenario>`… result will appear here when the run completes."*
2. **`run-and-publish.sh` runs in the background**: spawns Playwright, captures screenshots, posts artifacts to Vercel Blob, finalizes the dashboard row.
3. **On completion**: bot swaps 👀 for ✅ (pass) or ❌ (fail), posts a thread reply with the dashboard URL.

The handler is non-blocking — multiple test triggers in flight at once is fine.

## Where it works

Any channel where the slam-bot can read messages. Doesn't require the channel to be in `CHANNEL_CONFIG` because the test handler short-circuits before the normal channel routing.

DMs work too: in a DM with the bot, just type `<@SLAM_BOT> test single-user-journey`.

## Acceptable scenario names

The parser only accepts scenario names matching `[a-z0-9][a-z0-9-]*` to keep shell injection paths closed. So:

- ✅ `single-user-journey`
- ✅ `two-browser-stage-2`
- ❌ `"two browser stage 2"` (quoted with spaces)
- ❌ `../../../etc/passwd` (path traversal)
- ❌ `--evil` (flag injection)

## Optional flags

- `from-snapshot:<id>` — branch the run from a saved snapshot. The id comes from the dashboard's snapshot detail page URL.

## Thread replies

If you trigger from inside a thread, the result reply lands in the same thread. Triggering from the channel root opens a new thread.

## Permission model

There's no allowlist today — anyone in a channel where the bot is present can trigger a test. This is consistent with how the test-dashboard's `BOT_WRITER_TOKEN` is the trust root. If we need finer-grained control later, gate via Slack user ID.

## Environment requirements

Already satisfied if the EC2 bot has the env from the test-dashboard rollout:

- `TEST_DASHBOARD_API_URL`
- `BOT_WRITER_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `DATABASE_URL` (for the actual test DB the e2e suite runs against)

After deploying this PR, restart the socket listener so the new handler is loaded:

```bash
ssh slam-bot
sudo systemctl restart slam-bot-socket
```

(The `deploy.sh` script in `scripts/ec2-bot/` syncs the listener and reinstalls the systemd unit.)

## Local sanity test

The pure-string parser has standalone tests:

```bash
BOT_USER_ID=U_TEST node scripts/ec2-bot/socket-mode/test-parse-test-command.mjs
# ✓ 14/14 parse cases passed
```

These are the only tests that don't require a live Slack workspace. End-to-end testing happens by talking to the bot in Slack after deploy.

## Troubleshooting

- **No reaction at all**: bot may not have message-read permission in that channel. Invite it.
- **`Could not launch <scenario>`**: `run-and-publish.sh` not at `/opt/slam-bot/scripts/`. Check the deploy symlink.
- **`could not parse run URL`**: wrapper failed before printing the dashboard URL — check `/var/log/slam-bot/test-runs.log` (or whatever `2>&1` redirects the spawn to).
- **Reaction stays at 👀 forever**: spawned process never exited. Check `ps aux | grep run-and-publish`.
