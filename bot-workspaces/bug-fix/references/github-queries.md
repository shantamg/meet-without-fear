# GitHub Issue Queries

## Global State File (MANDATORY)

All issue/PR metadata reads **MUST** come from the global state file, not direct `gh` calls. Source the helper library first:

```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Re-fetching labels, state, or title via `gh issue list` or `gh issue view --json labels` is a **strict violation** of the bot's GitHub API budget policy (#1649).

## Fetch Open Issues by Label

```bash
# Use state file helpers — zero GraphQL cost
BUG_ISSUES=$(github_state_issues_with_label "bug")
SEC_ISSUES=$(github_state_issues_with_label "security")
BOTPR_ISSUES=$(github_state_issues_with_label "bot-pr")

# Get title from state file:
TITLE=$(github_state_issue_field "$NUMBER" title)

# When you narrow to issues you'll actually process, fetch body per issue
# (body is NOT in the state file — this is an allowed escape hatch):
# gh issue view "$NUMBER" --repo shantamg/meet-without-fear --json body
```

## Check if Issue is Untouched

An issue is **untouched** if it has zero comments AND no linked pull requests.

### Allowed `gh` calls (escape hatches)

Comment count and timeline data are NOT in the state file. These are the only `gh` read calls allowed:

```bash
# Check comment count (not in state file)
COMMENT_COUNT=$(gh api "repos/shantamg/meet-without-fear/issues/$NUMBER/comments" --jq 'length')

# Check linked PRs via timeline (not in state file)
LINKED_PRS=$(gh api graphql -f query='
  query {
    repository(owner: "shantamg", name: "meet-without-fear") {
      issue(number: '"$NUMBER"') {
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 10) {
          nodes {
            ... on CrossReferencedEvent {
              source { ... on PullRequest { number state } }
            }
          }
        }
      }
    }
  }' --jq '.data.repository.issue.timelineItems.nodes | [.[] | select(.source.number != null)] | length')

# Keep only if COMMENT_COUNT == 0 AND LINKED_PRS == 0
```

Any other `gh` read call (e.g., `gh issue list`, `gh issue view --json labels`) indicates a bug — use the state file instead.
