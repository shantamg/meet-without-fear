# Stage 04: Finalize

## Input

- All sub-issues in the dependency graph are closed
- Milestone branch has all feature PRs squash-merged
- `plan.json` from Stage 01 (parent issue info)
- `shared/milestone-conventions.md` for PR format
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file to check issue labels and state where possible. The state file contains all **open** issues/PRs. For closed issues and merged PRs, you must use `gh` (escape hatches below).

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue list --repo shantamg/meet-without-fear --milestone {plan-name} --state closed` — closed issues are not in the state file (it only tracks open items)
- `gh pr list --repo shantamg/meet-without-fear --base {milestone-branch} --state merged` — merged PRs are not in the state file

Any other `gh` read call indicates a bug — use the state file for open issue labels/state.

## Process

1. **Verify completeness**: Check open sub-issues from the state file first. For issues still in the state file (open), verify they have the `fix-merged` label.
   ```bash
   # Open sub-issues without fix-merged label — use state file
   for N in <sub-issue-numbers>; do
     if github_state_issue "$N" >/dev/null 2>&1; then
       github_state_issue_has_label "$N" "fix-merged" || echo "Missing: $N"
     fi
   done
   ```
   If any sub-issues are missing the `fix-merged` label, return to Stage 03.

2. **Compile summary**: Gather all merged PRs and closed issues (escape hatches — closed/merged items not in state file).
   ```bash
   # All closed issues in this plan (not in state file)
   gh issue list --repo shantamg/meet-without-fear --milestone {plan-name} --state closed --json number,title

   # All merged PRs targeting the milestone branch (not in state file)
   gh pr list --repo shantamg/meet-without-fear --base {milestone-branch} --state merged --json number,title
   ```

3. **Doc check**: Review if any docs need updating based on the collected changes.
   - Read `docs/code-to-docs-mapping.json` for the code→doc mapping
   - For each merged PR, check if it modified code in mapped areas without updating the corresponding docs
   - If any docs were not updated by the individual PRs, update them now
   - Check `docs/canonical-facts.json` for cross-doc values that may have changed
   - Set `updated` frontmatter to today's date
   - Commit doc updates to the milestone branch

4. **Create milestone-to-main PR**: Following the format in `shared/milestone-conventions.md`.
   ```bash
   gh pr create \
     --base main \
     --head {milestone-branch} \
     --title "feat: {plan-name} — milestone merge (#{parent-issue})" \
     --body "$(cat <<'EOF'
   ## Summary
   Merges the `milestone/{plan-name}` branch to `main`.

   ### Issues Closed
   - #{N} — {title}
   ...

   ### PRs Merged
   - PR #{P} — {title}
   ...

   ### What Was Built
   - <bullet 1>
   - <bullet 2>
   ...

   Related to #{parent-issue-number}
   EOF
   )" \
     --reviewer shantamg
   ```

5. **Update parent issue labels**:
   ```bash
   gh issue edit {PARENT} --repo shantamg/meet-without-fear --remove-label bot:project-orchestrator --add-label milestone-ready
   ```

6. **Comment on parent issue** with the final summary and milestone PR link:
   ```bash
   gh issue comment {PARENT} --repo shantamg/meet-without-fear --body "All sub-issues complete. Milestone PR: #{PR_NUMBER}. Ready for human review."
   ```

## Output

- Milestone-to-main PR created (requires human review)
- Parent issue labeled `milestone-ready`
- Summary posted on parent issue

## Exit Criteria

- Milestone PR exists targeting `main`
- Parent issue has `milestone-ready` label
- `bot:project-orchestrator` label removed from parent issue
- Summary comment posted on parent issue

## Completion

This is the final stage. Report:
- Parent issue number
- Number of sub-issues completed
- Number of PRs merged to milestone branch
- Milestone PR URL
- Human reviewer assigned

The orchestrator is done. The milestone PR awaits human review and merge to `main`.
