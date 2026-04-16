# Data Directory

Runtime data for file-based MWF session state. Not checked into git (except `.gitkeep` files).

## Directory Structure

```
data/
├── mwf-sessions/                     # All MWF session state
│   ├── thread-index.json             # Thread-TS → session ID mapping
│   └── {session_id}/                 # Per-session folder
│       ├── session.json              # Session metadata + pairing
│       ├── stage-progress.json       # Per-user stage + gate tracking
│       ├── .lock                     # Per-session lockfile (presence = locked)
│       ├── vessel-a/                 # User A's private vessel
│       │   ├── notable-facts.json
│       │   ├── emotional-thread.json
│       │   ├── needs.json
│       │   └── boundaries.json
│       ├── vessel-b/                 # User B's private vessel (same structure)
│       │   └── ...
│       ├── shared/                   # Shared Vessel (consensual content only)
│       │   ├── consented-content.json
│       │   ├── common-ground.json
│       │   ├── agreements.json
│       │   └── micro-experiments.json
│       ├── synthesis/                # AI reasoning trace (dev-only)
│       │   ├── internal-dialogue.md
│       │   └── pattern-notes.md
│       └── conversation-summary.md   # Rolling narrative summary
│
└── mwf-users/                        # Per-user cross-session data
    └── {slack_user_id}/
        └── global-facts.json         # Consolidated facts (max 50)
```

## Retention

Completed and abandoned session folders are auto-cleaned after 90 days, matching Slack free-plan message retention.

## Schema Reference

Reference schemas for all JSON files are documented in `bot-workspaces/mwf-session/schemas/`.
