# Stage: Synthesize

## Input

- Issue number from arguments (the **original** issue number)
- State file at `/tmp/slam-bot/expert-review-state-<original_issue>.json`
- All comments on the **review issue** (all expert reviews, pushbacks, and responses)
- Latest meta tag with `"phase":"all_reviews_complete"`

## State File (MANDATORY)

Read the state file at `/tmp/slam-bot/expert-review-state-<original_issue>.json` to get the `review_issue` number and `experts` list.

You **MUST NOT** run `gh issue view <original_issue>` or re-fetch the original issue body/title/comments. This data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy and is the primary cause of the rate-limit exhaustion incidents tracked in #1649. Do not do it.

The ONLY `gh` call you need is to read the **review issue** comments:
```bash
gh issue view <review_issue> --repo shantamg/meet-without-fear --comments
```
Any `gh issue view` call targeting the **original** issue is a bug.

## Process

1. **Gather all expert perspectives**: read every review, pushback, and response comment on the review issue (using the `review_issue` number from the state file)
2. **Write synthesis comment** (600-1000 words) on the **review issue** containing:
   - **Convergence**: points where multiple experts agree
   - **Divergence**: points of disagreement and why they differ
   - **Consolidated recommendations**: actionable next steps ranked by priority
   - **Risk summary**: key risks identified across all reviews
3. **Post comment on the review issue** with meta tag: `<!-- bot-expert-review-meta: {"phase":"synthesis_complete","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O} -->`

## Output

One synthesis comment posted to the **review issue** with updated meta tag.

## Completion

Stage complete. On next invocation, stage 04 (`04-complete`) handles label swap and final link.
