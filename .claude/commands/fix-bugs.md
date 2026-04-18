# Fix Bugs — Automated Bug, Security & Bot-PR Issue Resolver

You are an orchestrator that finds all open GitHub issues labeled `bug`, `security`, or `bot-pr`, then spawns parallel sub-agents to investigate and fix each one.

## Step 1: Fetch all open issues

```bash
# Fetch bug, security, and bot-pr issues, merge, deduplicate, and exclude wontfix
BUG_ISSUES=$(gh issue list --label bug --state open --json number,title,body,labels --limit 50)
SEC_ISSUES=$(gh issue list --label security --state open --json number,title,body,labels --limit 50)
BOTPR_ISSUES=$(gh issue list --label bot-pr --state open --json number,title,body,labels --limit 50)
echo "$BUG_ISSUES" "$SEC_ISSUES" "$BOTPR_ISSUES" | jq -s 'add | unique_by(.number) | [.[] | select([.labels[].name] | index("wontfix") | not)]'
```

Report what you found in a table: issue number, title, labels, and whether it looks fixable in code (vs. manual/config/credentials work).

If any issues are NOT code-fixable (e.g., credential rotation, external service config), list them separately and skip them — explain why to the user.

**Skip `wontfix` issues** — these have been reviewed by the team and marked as intentional or not actionable. Do not re-open, re-create, or attempt to fix them.

If there are no open issues matching these labels, tell the user and stop.

**Security issues** (labeled `security`) should be treated with the same fix-and-PR workflow as bugs. When creating branches and PRs for security fixes, use:
- Branch format: `fix/security-<short-description>-<issue-number>`
- PR title format: `fix(security): <description> (#<issue-number>)`

**Bot-PR issues** (labeled `bot-pr`) are general implementation requests — the issue describes what to build or change. When creating branches and PRs for bot-pr issues, use:
- Branch format: `feat/<short-description>-<issue-number>`
- PR title format: `feat(<area>): <description> (#<issue-number>)`
- After the PR is successfully created, **remove the `bot-pr` label** from the issue:
  ```bash
  gh issue edit <issue-number> --remove-label bot-pr
  ```
  The label is removed because the issue is now linked to the PR.

## Step 2: Launch sub-agents in batches (max 3 concurrent)

Process bugs in batches of **3 at a time** to avoid overwhelming the EC2 instance (t3.medium: 2 vCPU, 4GB RAM). Wait for a batch to complete before launching the next.

For EACH code-fixable bug, launch a sub-agent using the Agent tool with:
- `isolation: "worktree"` — so each agent works in an isolated copy of the repo
- `run_in_background: true` — so agents within a batch run in parallel

Launch up to 3 agents per batch in a single message (parallel tool calls). When all 3 complete, launch the next batch.

Each agent's prompt MUST include:

1. The full issue title, number, and body
2. Instructions to:
   - Read relevant docs first (check the docs routing table in CLAUDE.md)
   - Create a feature branch: `git checkout -b fix/<short-description>-<issue-number>`
   - Check the `[ACTIVE WORK-IN-PROGRESS]` section (if present in context) for overlapping work. If another agent is already working on the same issue, skip it
   - Investigate the root cause thoroughly before writing any code
   - Implement the fix with minimal, focused changes
   - Write tests covering the fix
   - Run existing tests to make sure nothing is broken (`npm run test` from repo root)
   - Commit changes with a descriptive message
   - Push the branch
   - Create a PR with:
     - `--reviewer shantamg` (for human review)
     - Title format: `fix(<area>): <description> (#<issue-number>)` (or `feat(<area>):` for bot-pr issues)
     - Body must include `Fixes #<issue-number>` for auto-close
   - If the issue has the `bot-pr` label, remove it after PR creation:
     ```bash
     gh issue edit <issue-number> --remove-label bot-pr
     ```
   - Work from the repo root (`meet-without-fear/`)

3. Key project context:
   - Mobile app: React Native + Expo in `mobile/`
   - Backend: Hono/Node in `backend/`
   - Shared types: `shared/`
   - Database schema: `backend/prisma/schema.prisma`
   - Styling: NativeWind (`className` props, NOT `StyleSheet.create`)
   - Tests: vitest (backend), jest-expo (mobile). Always `npm run test` + `npm run check` before committing.

## Step 3: Report results

As each agent completes, report:
- Issue number and title
- What the root cause was
- What was fixed
- PR link
- Review status (PR awaiting human review from shantamg)

Once all agents finish, show a final summary table of all bugs/security/bot-pr issues and their status.

## Important

- Do NOT duplicate work the sub-agents are doing
- Do NOT fix bugs yourself — delegate everything to sub-agents
- If a sub-agent fails, report the failure and suggest next steps
- Each sub-agent works in its own worktree, so there are no conflicts between them
- Maximum 3 concurrent agents to stay within EC2 resource limits
- PRs require human review — no auto-merge
