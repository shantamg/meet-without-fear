# Stage: Complete

## Input

- Issue number from arguments (the **original** issue number)
- State file at `/tmp/slam-bot/expert-review-state-<original_issue>.json`
- Latest meta tag with `"phase":"synthesis_complete"`

## State File (MANDATORY)

Read the state file at `/tmp/slam-bot/expert-review-state-<original_issue>.json` to get the `review_issue` number.

You **MUST NOT** run `gh issue view <original_issue>` or `gh issue view <review_issue> --comments` to look up the review issue number. The state file already has it. Re-fetching via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649). Do not do it.

The only `gh` calls this stage makes are the write operations listed below (comment, label edit, close). No read calls.

## Process

1. **Batch label swap on the original issue** — use a SINGLE `gh issue edit` call:
   ```bash
   gh issue edit <original_issue> --repo shantamg/meet-without-fear \
     --remove-label "bot:expert-review" --add-label "expert-review-complete"
   ```
   Do NOT make separate calls for remove and add — one call handles both.
2. **Post summary comment on the original issue** linking to the completed review:
   ```
   Expert review complete — see #<review_issue_number> for the full review and synthesis.
   ```
3. **Close the review issue** with a final meta tag comment:
   ```
   Review complete. Results linked on the original issue #<original_number>.

   <!-- bot-expert-review-meta: {"phase":"complete","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O} -->
   ```
4. **Clean up the state file**: remove `/tmp/slam-bot/expert-review-state-<original_issue>.json`

## Output

- Labels swapped on the original issue (single API call)
- Summary comment posted on the original issue with link to review
- Review issue closed with final meta tag
- State file cleaned up

## Completion

This is the final stage. The expert review process is complete.
