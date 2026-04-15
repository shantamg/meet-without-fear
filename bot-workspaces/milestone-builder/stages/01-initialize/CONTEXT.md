# Stage: Initialize

## Input

- Parent issue body (from prompt or `gh issue view`)
- `shared/milestone-conventions.md` — branch naming rules
- `shared/dependency-parser.md` — how to extract dependency metadata
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (title, labels, state). You **MUST NOT** call `gh issue view --json labels,state,title` per sub-issue — that data is in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make:
- `gh issue view {PARENT} --repo shantamg/meet-without-fear` — to read the parent issue **body** and **comments** (not in state file)
- `gh issue view {N} --repo shantamg/meet-without-fear --comments` — to read sub-issue **comments** for dependency metadata parsing (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Read the parent issue**. Get title from the state file. Get body via `gh issue view` (escape hatch). Extract:
   - Plan name (from title, lowercased and hyphenated)
   - All sub-issue numbers (from task list `#N` references in body)
   - Any special instructions or constraints

2. **Fetch each sub-issue** from the **state file** — do NOT call `gh issue view` per sub-issue for metadata. For each:
   ```bash
   github_state_issue "$N"  # returns title, state, labels
   ```
   - Title and current state (open/closed) — from state file
   - Labels (check for `bot:*` workspace labels or `blocked`) — from state file
   - Dependency metadata — parse from comments via `gh issue view {N} --comments` (escape hatch)

3. **Create milestone branch**:
   ```bash
   git checkout main && git pull
   git checkout -b milestone/{plan-name}
   git push -u origin milestone/{plan-name}
   ```

4. **Validate plan structure**:
   - Every sub-issue has dependency metadata OR is in wave 1 (no dependencies)
   - At least one sub-issue is labeled with a `bot:*` dispatch label or has no blockers
   - No circular dependencies exist

5. **Post milestone context on each sub-issue** so dispatched agents know the branch target:
   ```
   gh issue comment <number> --body "<!-- milestone-context: {plan-name} -->
   ## Milestone Context
   **Branch from:** milestone/{plan-name}
   **PR target:** milestone/{plan-name} (use \`--base milestone/{plan-name}\` when creating PR)
   **Parent issue:** #{parent-number}"
   ```

6. **Label sub-issues** — use the **label-registry key** (the `bot:*` label name), NOT the workspace directory name:
   - Sub-issues with no unresolved dependencies → add `bot:pr` label (NOT `bot:general-pr` — that's the workspace directory name, not the dispatch label). Only use a different `bot:*` label if the issue explicitly needs a different workspace (e.g., `bot:investigate` for research tasks).
   - Sub-issues with unresolved dependencies → add `blocked` label
   - **NEVER add `bot:spec-builder` or `bot:milestone-planner`** — those are upstream workspaces, not implementation dispatchers.
   - **Reference**: check `bot/label-registry.json` for valid label names if unsure.

7. **Comment on parent issue** with initialization summary. **MUST include the marker** so future ticks skip to monitor:
   ```
   <!-- milestone-initialized -->
   ## Milestone Initialized: {plan-name}
   **Branch:** milestone/{plan-name}
   [wave breakdown, validation warnings, etc.]
   ```

## Output

- Milestone branch created and pushed
- Sub-issues labeled with `bot:{workspace}` dispatch labels or `blocked`
- Initialization comment on parent issue

## Completion

Proceed to `stages/02-monitor/` — the monitor stage runs as a tick loop.
