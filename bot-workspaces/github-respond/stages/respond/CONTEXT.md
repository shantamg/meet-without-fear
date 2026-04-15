# Stage: Respond to PR Comment/Mention

## Input

- PR number (required)
- Repo (optional, default: `shantamg/meet-without-fear`)
- Comment ID and author (optional)
- Comment body (from prompt context)

## Process

1. **Acknowledge immediately** — post a quick reply before research:
   - Code change request: "On it — making that change now."
   - Question / investigation: "Looking into this..."
   - Simple question: skip, answer directly
   - Approval / LGTM: skip, no reply needed
2. **Get PR context**: `gh pr view` + `gh pr diff`
3. **Analyze the comment** — understand what is being asked
4. **Determine action**:
   - Code change request: make change, push, reply confirming
   - Question about code: reply with explanation
   - General feedback: acknowledge thoughtfully
   - Request for more info: provide details
5. **Respond** using `shared/references/github-ops.md` reply patterns

If no comment details provided, fetch recent comments and identify the latest non-bot comment.

## Output

Reply posted to the PR. If code changes made, commits pushed to PR branch.

## Safety

- Never force-push to someone else's branch
- If complex or ambiguous, ask for clarification rather than guessing
- If PR is not yours, only make changes when explicitly asked

## Completion

Single-stage. Workspace run is complete after response is posted.
