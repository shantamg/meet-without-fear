# Stage: PR

## Input

- Implemented changes from Stage 01 (modified files in working tree)
- Issue number and provenance (channel, requester, original message)
- `shared/skills/pr.md` — PR creation conventions
- `shared/references/github-ops.md` — GitHub operations patterns

## Process

1. **Detect milestone context** — check if this issue is part of a milestone:
   - Read issue comments for a `<!-- milestone-context: -->` HTML tag or a bot comment mentioning `milestone/` branch
   - Also check if the issue has a `blocked` label history or is referenced from a milestone parent issue
   - If a milestone branch is found, the PR must target that branch (not `bot/staging`)
   - If no milestone context, target `bot/staging` (default — see `shared/skills/pr.md` for rationale)

2. **Create branch** (if not already on a feature branch):
   - If milestone detected: branch from the milestone branch
     ```bash
     git fetch origin milestone/{plan-name}
     git checkout -b feat/<short-description>-<issue-number> origin/milestone/{plan-name}
     ```
   - Otherwise: branch from `bot/staging`
     ```bash
     git fetch origin bot/staging
     git checkout -b feat/<short-description>-<issue-number> origin/bot/staging
     ```

3. **Stage and commit** the changes:
   - Stage specific files (not `git add -A`)
   - Write a concise commit message describing the change

4. **Push** the branch:
   ```bash
   git push -u origin <branch-name>
   ```

5. **Create PR** following `shared/skills/pr.md` format:
   - Title: short description (under 70 characters)
   - Body: Changes bullets, issue link (`Related to #N` — never `Fixes #N`, per `shared/skills/pr.md`), Provenance section, Docs updated
   - If milestone: add `--base milestone/{plan-name}` to `gh pr create`
   - If no milestone: add `--base bot/staging` to `gh pr create`
   - Do NOT request human reviewers — bot reviews and merges autonomously to non-main branches

6. **Add review labels to the PR** — trigger both generic code review and plan-alignment review:
   ```bash
   gh pr edit <number> --add-label "bot:needs-review"
   gh pr edit <number> --add-label "bot:review-impl"
   ```
   `bot:needs-review` triggers the standard pr-reviewer code quality check.
   `bot:review-impl` triggers a plan-alignment review that checks the implementation against the original issue requirements, research findings, and spec.

7. **Swap labels** on the issue:
   - Remove `bot:pr` label
   - Add `bot:pr-created` label

## Output

- PR URL
- Issue label updated
- PR labeled for both code review and plan-alignment review

## Completion

This is the final stage. Report the PR URL. The pr-reviewer workspace picks up both review types.
