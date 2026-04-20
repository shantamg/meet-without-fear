# Stage: Incremental Audit

## Input

- Lookback period (default: `48 hours ago`). Must use git-compatible format: `N hours ago`, `N days ago`.

## Process

1. **Identify changes**: `git log --since="$LOOKBACK" --name-only --pretty=format:` + `git log --since="$LOOKBACK" --oneline`
2. **Map changed code to docs** using the code-to-doc mapping in workspace CONTEXT.md
3. **Fan out targeted audit agents** (one per docs section, NOT per doc):
   - Read git diffs for changed files in their area
   - Read affected docs
   - Compare docs against current code using commit messages as context
   - Return: changes detected, issues found (expected vs actual), docs still OK
4. **Check for undocumented code**: new files/modules added without corresponding docs
5. **Doc hygiene** on modified docs: valid frontmatter, `updated` date bumped, correct section, referenced from index
6. **Fix issues**: update drifted docs, create missing docs, fix frontmatter. Commit changes.
7. **Create PR** if changes made (via `shared/skills/pr.md`)
8. **Post summary** to #agentic-devs (channel ID from `.claude/config/services.json` key `agentic-devs`)

## Output

- Fixed docs committed and PR created (if needed)
- Summary posted to Slack

## Completion

Single-stage. Complete after PR created (or "no changes" reported).

On completion, no label swap needed (cron-triggered).
