# Stage: Review PR

## Input

- PR number (required)
- Repo (optional, default: `shantamg/meet-without-fear`)
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for PR metadata (title, labels, author, headRefName, baseRefName). You **MUST NOT** call `gh pr view --json title,labels` or `gh pr list --json labels` for fields already in the state file. Re-fetching them via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Check for in-progress label from state file
github_state_pr_has_label "$PR_NUMBER" "bot:in-progress" && echo "skip"
# Get PR title from state file
TITLE=$(github_state_pr_field "$PR_NUMBER" title)
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh pr view <number> --repo shantamg/meet-without-fear --json body,files,additions,deletions` — PR body and file list (not in state file)
- `gh pr diff <number> --repo shantamg/meet-without-fear` — full diff (not in state file)
- `gh issue list --search "<keywords>"` — keyword search across issues (search is not in state file)
- `gh pr list --search "<keywords>" --state merged` — search merged PRs (merged PRs not in state file)
- `gh pr view <number> --json comments` — PR comments (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Claim the PR** — check if already claimed via state file, then signal:
   ```bash
   github_state_pr_has_label "$PR_NUMBER" "bot:in-progress" && { echo "Another bot agent is already reviewing this."; exit 0; }
   gh pr edit <number> --repo shantamg/meet-without-fear --add-label "bot:in-progress"
   ```
2. **Acknowledge**: `gh pr comment <number> --body "On it — reviewing now."`
3. **Fetch PR details**: title and author from state file; body, files, additions, deletions via `gh pr view` (escape hatch)
4. **Get full diff**: `gh pr diff`
5. **Gather context** — before reviewing, search for related work and domain knowledge. This makes the review substantive, not just a surface-level diff read.

   a. **Search for related issues and PRs** — find past bugs, prior attempts, and related work in this area (search is not in state file — escape hatch):
   ```bash
   gh issue list --repo shantamg/meet-without-fear --search "<keywords>" --state all --limit 10 --json number,title,state
   gh pr list --repo shantamg/meet-without-fear --search "<keywords>" --state merged --limit 5 --json number,title
   ```

   b. **Search vector memory** — semantic search across code, issues, and docs:
   ```bash
   # Search code patterns related to this change
   /opt/slam-bot/scripts/memory/search.sh --code "<key terms from changed files>"
   # Search issues for related bugs or feature requests
   /opt/slam-bot/scripts/memory/search.sh --collections "issues" "<PR title or problem description>"
   ```

   c. **Check recent file history** — detect churn, regressions, or active development:
   ```bash
   git log --since="2 weeks ago" --oneline -- <changed files>
   ```

   d. **Read relevant docs** — based on changed files, load docs from `CLAUDE.md` routing table

   Use the gathered context to inform your review — flag if the PR re-introduces a previously fixed bug, conflicts with recent architectural changes, or misses patterns established by related PRs.

6. **Review the code** — check for:
   - Correctness (logic errors, null risks, race conditions)
   - Types (missing types, `any` usage)
   - Tests (missing coverage, edge cases)
   - Security (injection, XSS, secrets in code)
   - Architecture (service boundaries, separation of concerns)
   - Database (migration files present, not `db:push`)
   - Performance (N+1 queries, unnecessary re-renders)
   - Style (NativeWind, consistent patterns)
7. **Submit review** via `gh pr review`:
   - Good: `--approve`
   - Needs work: `--request-changes`
   - Minor suggestions: `--comment`
8. **Add inline comments** for specific lines via GitHub API
9. **Release claim and mark reviewed**:
   ```bash
   gh pr edit <number> --repo shantamg/meet-without-fear --remove-label "bot:in-progress" --add-label "bot:reviewed"
   ```

## Output

Review submitted with structured body:
- Summary (1-2 sentences)
- Feedback (category + file:line references)
- Verdict (approve / request changes / comment)

## Safety

- Be constructive — suggest fixes, don't just criticize
- Distinguish blocking issues from nice-to-haves
- Acknowledge good patterns and thoughtful decisions

## Completion

Single-stage. Workspace run is complete after review is submitted.
