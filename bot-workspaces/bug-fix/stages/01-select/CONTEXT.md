# Stage 01: Select Issues

## Input

- Labels to scan: `bug`, `security`, `bot-pr`
- Optional: pre-filtered issue numbers from shell script (passed as prompt constraint)
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (labels, title, state). You **MUST NOT** call `gh issue list` or `gh issue view --json labels` to fetch issue lists or check labels — that data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Fetch issues by label — zero GraphQL cost
BUG_ISSUES=$(github_state_issues_with_label "bug")
SEC_ISSUES=$(github_state_issues_with_label "security")
BOTPR_ISSUES=$(github_state_issues_with_label "bot-pr")
TITLE=$(github_state_issue_field "$NUMBER" title)
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue view <number> --repo shantamg/meet-without-fear --json body` — issue **body** for context (not in state file)
- `gh api "repos/shantamg/meet-without-fear/issues/$NUMBER/comments"` — comment count check (not in state file)
- `gh api graphql` — linked PR timeline check (not in state file)

See `references/github-queries.md` for the exact queries. Any other `gh` read call indicates a bug.

## Process

### 1. Fetch open issues

Fetch `bug`, `security`, and `bot-pr` issues and deduplicate. See `references/github-queries.md` for the exact `gh` commands.

### 2. Filter to untouched issues only

An issue is **untouched** if it has:
- Zero comments (any comment, including from the bot, counts as activity)
- No linked pull requests (cross-referenced PRs in the timeline)

Check each issue using the GraphQL and REST queries in `references/github-queries.md`. Keep only if both counts are zero.

### 3. Classify fixability

For each untouched issue, determine if it is **code-fixable** or **manual/config work**:

| Category | Code-fixable? | Examples |
|---|---|---|
| Code bug | Yes | Crash, wrong behavior, UI glitch |
| Security vulnerability | Yes | Auth bypass, data exposure |
| Implementation request (bot-pr) | Yes | Feature to build |
| Credential rotation | No | API key expired |
| External service config | No | DNS, third-party dashboard |
| Infrastructure provisioning | No | New server, new service |

Skip non-code-fixable issues with an explanation.

### 4. Determine branch naming

| Issue label | Branch format | PR title format |
|---|---|---|
| `bug` | `fix/<description>-<issue>` | `fix(<area>): <description> (#<issue>)` |
| `security` | `fix/security-<description>-<issue>` | `fix(security): <description> (#<issue>)` |
| `bot-pr` | `feat/<description>-<issue>` | `feat(<area>): <description> (#<issue>)` |

### 5. Check WIP registry

Before proceeding with any issue, check `[ACTIVE WORK-IN-PROGRESS]` in context. If another agent is already working on the same issue, skip it.

## Output

A table of selected issues:

```
| # | Title | Labels | Branch Name | Fixable? |
```

Plus the full issue body for each selected issue (needed by Stage 02).

## Shell Pre-Check Mapping

The shell script `scripts/ec2-bot/scripts/fix-bugs.sh` performs the untouched-issue filter **before** invoking Claude. When running via the shell script, the prompt already constrains which issue numbers to process. This stage still validates the constraint and fetches full issue context.

When running manually (e.g., `/fix-bugs` command), this stage performs the full filtering itself.

## Exit Criteria

- At least one code-fixable, untouched issue found -- proceed to Stage 02
- No qualifying issues found -- exit with a report ("No untouched bug/security/bot-pr issues")

## Orchestrator Batching

Process issues in batches of **3 concurrent sub-agents** (EC2 constraint: t3.medium, 2 vCPU, 4GB RAM). Each sub-agent gets one issue and runs Stages 02-06 independently in its own worktree (`isolation: "worktree"`).

## Completion

For each selected issue, launch a sub-agent with Stages 02-06. Pass the issue number, title, body, labels, and branch name.
