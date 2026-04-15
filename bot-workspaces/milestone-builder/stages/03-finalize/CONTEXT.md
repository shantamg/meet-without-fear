# Stage: Finalize

## Input

- Parent issue number (from prompt)
- Milestone branch name
- `shared/milestone-conventions.md` — PR format for milestone→main
- `shared/skills/pr.md` (root) — PR creation patterns

## Process

1. **Verify completion**: Confirm all sub-issues from the parent issue are closed.
   If any remain open, return to stage 02 (should not happen under normal flow).

2. **Compile summary**: For each closed sub-issue, collect:
   - Issue number and title
   - Associated merged PR number and title
   - One-line description of what was built

3. **Doc check**: Review if any docs need updating based on the collected changes.
   - Read `docs/code-to-docs-mapping.json` for the code→doc mapping
   - For each merged PR, check if it modified code in mapped areas without updating the corresponding docs
   - If any docs were not updated by the individual PRs, update them now
   - Check `docs/canonical-facts.json` for cross-doc values that may have changed
   - Set `updated` frontmatter to today's date
   - Commit doc updates to the milestone branch

4. **Add plan-alignment review to the milestone→main PR**:
   - For each sub-issue PR that was merged to the milestone branch, verify it was reviewed against its requirements
   - Add `bot:review-impl` label to the milestone→main PR to trigger a final plan-alignment review of the full changeset against the parent issue requirements

5. **Create milestone→main PR**:
   - Title: `feat: {plan-name} — milestone merge (#{parent-issue})`
   - Body: per milestone-conventions.md format (Issues Closed, PRs Merged, What Was Built)
   - Target: `main`
   - Reviewers: `shantamg`
   - Add `bot:review-impl` label to trigger plan-alignment review
   - Do NOT merge — humans merge to main

6. **Update labels on parent issue**:
   - Remove `bot:milestone-builder`
   - Add `milestone-ready`

7. **Comment on parent issue**:
   - Link to the milestone→main PR
   - Summary of everything completed
   - List all sub-issue PRs and their review status
   - Tag @shantamg for review

## Output

- Milestone→main PR created (not merged)
- Parent issue labels updated
- Completion comment on parent issue

## Completion

This is the final stage. The milestone→main PR awaits human review and merge.
