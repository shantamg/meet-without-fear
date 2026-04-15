# Stage 01: Initialize

## Input

- Parent issue number (from prompt or `bot:project-orchestrator` label trigger)
- `shared/milestone-conventions.md` for branch naming rules
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (title, labels, state). You **MUST NOT** call `gh issue view --json labels,state,title` or `gh issue list` for fields already in the state file. Re-fetching them via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make:
- `gh issue view {PARENT} --repo shantamg/meet-without-fear` — to read the parent issue **body** and **comments** (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Read parent issue**: Get title and labels from the state file. Fetch body and comments via `gh` (escape hatch).
   ```bash
   TITLE=$(github_state_issue_field "$PARENT" title)
   # Body and comments are not in state file — escape hatch:
   gh issue view {PARENT} --repo shantamg/meet-without-fear
   ```

2. **Extract sub-issues**: Parse the parent issue body for referenced sub-issues (`#N`). For each, get title, state, and labels from the **state file** — do NOT call `gh issue view` per sub-issue.
   ```bash
   github_state_issue "$N"  # returns full JSON: number, title, state, labels
   ```

3. **Derive plan name**: From the parent issue title — lowercase, hyphenated, stripped of special characters. Example: "Health Scoring Redesign" becomes `health-scoring-redesign`.

4. **Create milestone branch**: Branch off `main` (or off a parent milestone if nested).
   ```bash
   git fetch origin main
   git checkout -b milestone/{plan-name} origin/main
   git push origin milestone/{plan-name}
   ```
   If the milestone branch already exists, skip creation and use it as-is.

5. **Write plan.json**: Save the full issue list and initial state.

## Output

`plan.json` written to the workspace output area (or passed to Stage 02 in context). Schema:

```json
{
  "parent_issue": 700,
  "parent_title": "Health Scoring Redesign",
  "milestone_branch": "milestone/health-scoring-redesign",
  "created_at": "2026-03-18T00:00:00Z",
  "sub_issues": [
    {
      "number": 585,
      "title": "Workspace folder structure",
      "state": "OPEN",
      "labels": []
    }
  ]
}
```

Milestone branch exists and is pushed to origin.

## Exit Criteria

- Milestone branch exists on remote
- plan.json contains all sub-issues with current state
- At least one sub-issue identified

## Completion

Proceed to `stages/02-resolve-dependencies/` with plan.json.

If no sub-issues are found in the parent issue, halt and comment on the parent issue:
```
Unable to initialize plan: no sub-issues found in issue body. Please add sub-issue references (#N) and re-trigger.
```
