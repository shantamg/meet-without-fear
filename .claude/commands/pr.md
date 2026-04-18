# Create Pull Request

You are creating a pull request for the current branch to merge into main.

## Step 1: Pre-flight checks

Run these in parallel and report results:

- `git branch --show-current` — verify you're NOT on main
- `npm run test` — all tests pass
- `npm run check` — type checks pass

If any check fails, stop and fix the issue before continuing.

## Step 2: Documentation updates

1. Review the diff (`git diff main...HEAD`) — identify any docs in `docs/` that need updating based on the changes
2. If docs need updating:
   - Update affected docs (set `updated` frontmatter to today's date)
   - If a new feature was built and no living doc exists, create one in the appropriate `docs/` section
   - If a plan doc was used, archive it to `docs/archive/`
   - Commit doc updates on the branch
3. If no docs need updating, move on

## Step 3: Detect linked GitHub issues

Before writing the PR description, determine if this PR is linked to any GitHub issue(s). Check ALL of these sources:

1. **Branch name** — extract issue numbers from patterns like `fix/thing-123`, `feat/thing-#456`, `issue-789`, or any digits at the end of the branch name. Verify each candidate by running `gh issue view <number> --json state,title` to confirm it exists.
2. **Commit messages** — scan `git log main..HEAD --oneline` for `#<number>` references.
3. **Prompt context** — check if the user's original request, `[PROVENANCE]` block, or environment variables reference an issue number.

Collect all confirmed issue numbers. These will be used in the PR body.

## Step 4: Analyze changes for PR description

1. Run `git diff main...HEAD` to see the changes
2. Run `git log main..HEAD --oneline` to see commit messages
3. Analyze the changes and create 3-7 brief, user-friendly bullet points
4. Focus on user-facing changes (features, fixes, improvements)
5. Format: "Add:", "Fix:", "Improve:", "Update:" etc.

## Step 5: Create the PR

1. **Generate PR title** — concise summary of the main change. If there's a linked issue, include `(#N)` in the title.
2. **Confirm with user** — use AskUserQuestion to confirm or let user customize the title
3. **Push if needed** — `git push -u origin <branch-name>`
4. **Create PR** — use `gh pr create` with confirmed title and formatted body (use HEREDOC), requesting review from `shantamg` (`--reviewer shantamg`)

## Step 6: Return the PR URL

Show the user the created PR URL.

## PR Body Format

**CRITICAL — Issue auto-close:** If any linked issues were found in Step 3, the body MUST include a `Fixes #N` line for EACH linked issue on its own line, placed right after the Changes section. This is how GitHub auto-closes issues on merge. Without this exact syntax, issues stay open and require manual cleanup. GitHub recognizes these keywords: `Closes`, `Fixes`, `Resolves` (each followed by `#<issue-number>`). Use `Fixes` as the default. For multiple issues, use one line per issue (e.g., `Fixes #123` then `Fixes #456`).

```
## Changes
- Add: ...
- Fix: ...
- Improve: ...

Fixes #<issue-number>

## Provenance
- **Channel:** (use the value from the [PROVENANCE] block if available, otherwise #channel-name)
- **Requested by:** (use the value from the [PROVENANCE] block if available, otherwise @username)
- **Original message:** (use the EXACT value from the [PROVENANCE] block if available — do NOT paraphrase)
- **Prompt(s) used:** brief description of the approach / slash commands invoked

## Docs updated
- `docs/path/to/updated-doc.md` (or "No doc changes needed")
```

Every PR must include the **Provenance** section so the team can trace how the work was initiated. This applies to all PRs — whether created from Slack requests, cron jobs, or manual triggers.

**Important:** If a `[PROVENANCE]` block is present in your prompt context, use those exact values for Channel, Requested by, and Original message. Do NOT paraphrase the original message or re-derive the requester name — the provenance was resolved programmatically and is authoritative.

## Embedding images in PR descriptions

If the PR relates to a visual bug or UI change and you have screenshot files, use `/attach-image` to upload and get the `<img>` tag, then embed it in the PR body.

## Important Notes

- Always confirm the title with the user using AskUserQuestion
- Keep bullet points brief and user-focused
- Skip internal refactoring unless it has user impact
- Make sure there are actual changes between the branch and main

Begin by running the pre-flight checks.
