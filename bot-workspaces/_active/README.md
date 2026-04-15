# _active/ — Runtime Agent Registry

This directory is the live agent communication layer for the bot workspace system. It is **populated at runtime** by `run-claude.sh` and **cleaned up** when agents exit.

**This directory is gitignored** — only this README and `.gitkeep` are checked in.

## Directory Structure (runtime)

```
_active/
  agent-{PID}/
    meta.json          # Job metadata: pid, startedAt, commandSlug, channel, messageTs
    route.json         # Auto-detected workspace/stage (populated by PostToolUse hook)
    stream.log         # Claude's streaming text output (tee'd in real-time)
    inbox/
      unread/          # Other agents or system leave messages here (*.md files)
      read/            # PostToolUse hook moves messages here after injection
  _archived/           # Completed agent directories (kept briefly for debugging)
```

## Lifecycle

1. **Startup** (`run-claude.sh`): Creates `agent-{PID}/` with empty `route.json`, writes `meta.json`, starts tee-ing to `stream.log`.
2. **Route detection** (`check-pending-messages.sh` PostToolUse hook): When the agent reads a `bot-workspaces/*/stages/*/CONTEXT.md`, the hook writes `route.json` and creates a symlink from the stage's `output/` directory back to the agent home.
3. **Message delivery**: Other agents write `*.md` files to `inbox/unread/`. The PostToolUse hook picks them up and injects them as `additionalContext`.
4. **Cleanup** (`run-claude.sh` EXIT trap): Checks for unread messages, removes symlinks, archives or removes the agent directory.

## Inter-Agent Communication

```bash
# See who is running
ls _active/

# Check what agent 12345 is doing
cat _active/agent-12345/meta.json
cat _active/agent-12345/route.json

# See their live output
tail -20 _active/agent-12345/stream.log

# Leave them a message
echo "Found root cause in authMiddleware.ts" > _active/agent-12345/inbox/unread/msg-$(date +%s).md

# Or use the helper script:
agent-message.sh --to-pid 12345 --message "Found root cause in authMiddleware.ts"
```

## Routing Accuracy Audit

The `_archived/` directory accumulates `meta.json` + `route.json` pairs from completed agents. Use the audit script to measure routing accuracy:

```bash
# Full report
scripts/ec2-bot/scripts/audit-routing.sh

# Last 7 days
scripts/ec2-bot/scripts/audit-routing.sh --days 7

# Filter to one workspace
scripts/ec2-bot/scripts/audit-routing.sh --workspace slack-triage

# Machine-readable JSON
scripts/ec2-bot/scripts/audit-routing.sh --json

# Show every agent row
scripts/ec2-bot/scripts/audit-routing.sh --verbose
```

The expected routing table lives in `bot-workspaces/expected-routes.json`. When adding a new command slug or workspace, add the mapping there so the audit can verify correct routing.

## Related Scripts

- `scripts/ec2-bot/scripts/run-claude.sh` — Creates/cleans up agent directories
- `scripts/ec2-bot/scripts/check-pending-messages.sh` — PostToolUse hook (route detection + message injection)
- `scripts/ec2-bot/scripts/agent-message.sh` — Helper for sending messages between agents
- `scripts/ec2-bot/scripts/audit-routing.sh` — Routing accuracy report from archived agent data
