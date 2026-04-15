# PR Conventions

## Required Elements

Every PR created by the bug-fix workspace MUST include:

### 1. Title

Format varies by issue label (see `references/branch-naming.md`):
- Bug: `fix(<area>): <description> (#<issue-number>)`
- Security: `fix(security): <description> (#<issue-number>)`
- Bot-PR: `feat(<area>): <description> (#<issue-number>)`

### 2. Body

Use HEREDOC format to avoid shell escaping issues:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Changes
- Fix: <one-line description of each change>
- Add: <tests added>

## Root Cause
<one paragraph explaining why the bug happened and how the fix addresses it>

Related to #<issue-number>

## Provenance
- **Source:** GitHub Issue #<issue-number>
- **Prompt(s) used:** fix-bugs workspace (stages 01-06)

## Docs updated
- <doc path> (or "No doc changes needed")
EOF
)" --reviewer shantamg,mengerink
```

### 3. Issue Linking

- **Always use `Related to #N`** (never `Fixes #N`) — all issues stay open for human verification
- Place the linking line on its own line for reliable parsing
- Use `Related to`, not `Fixes`, `Closes`, or `Resolves` (project convention)
- Always post a verification comment on the issue after PR creation (see `shared/skills/pr.md`)

### 4. Reviewers

Always request: `--reviewer shantamg,mengerink`

PRs require human review. Never auto-merge.

## Post-PR Actions

### For `bot-pr` labeled issues

Remove the label after successful PR creation:
```bash
gh issue edit <issue-number> --repo shantamg/meet-without-fear --remove-label bot-pr
```

The shell script `fix-bugs.sh` also performs this as a post-session safety net by checking for linked PRs.

## What NOT to Do

- Never force-push to any branch
- Never push directly to `main`
- Never auto-merge PRs
- Never skip the issue linking line (`Related to #N`)
- Never create PRs without requesting reviewers
