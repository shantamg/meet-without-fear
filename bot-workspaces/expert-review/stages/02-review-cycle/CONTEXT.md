# Stage: Review Cycle (Looping)

## Input

- Issue number from arguments (the **original** issue number)
- State file at `/tmp/slam-bot/expert-review-state-<original_issue>.json`
- All comments on the **review issue** (to find latest meta tag and prior reviews)

## State File (MANDATORY)

Read the state file at `/tmp/slam-bot/expert-review-state-<original_issue>.json` to get the `review_issue` number, `original_title`, `original_body`, and `experts` list.

You **MUST NOT** run `gh issue view <original_issue>` or re-fetch the original issue body/title/comments. This data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy and is the primary cause of the rate-limit exhaustion incidents tracked in #1649. Do not do it.

The ONLY `gh` call you need is to read the **review issue** comments to find the latest meta tag and prior reviews:
```bash
gh issue view <review_issue> --repo shantamg/meet-without-fear --comments
```
Any `gh issue view` call targeting the **original** issue is a bug.

## Process

Read the review issue comments (using the `review_issue` number from the state file) and find the latest meta tag. Execute the NEXT action based on current phase:

| Current Phase | Next Action |
|---|---|
| `"roster"` | Write Expert 1's review |
| `"expert_review"` | Write devil's advocate pushback for current expert |
| `"pushback"` | Write expert's response to pushback |
| `"response"` | If more experts remain: advance `current_expert_index`, write next expert review. If all done: exit — stage 03 takes over |

### Review Quality Requirements

- **Expert reviews**: 500-1000 words. Substantive, domain-specific terminology. Later experts MUST reference and build on earlier reviews.
- **Pushback**: 200-400 words. 2-4 specific weaknesses. Constructive, citing concrete risks.
- **Response**: 200-400 words. Concede valid points, double down with evidence on strong points.

### Human Comments

If a non-bot comment appears since the last bot comment (on either the original or review issue), acknowledge and incorporate it into the current action.

### Meta Tag Updates

Every comment must include an updated meta tag (posted on the **review issue**):
- After expert review: `{"phase":"expert_review","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O}`
- After pushback: `{"phase":"pushback","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O}`
- After response: `{"phase":"response","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O}`
- After final expert's response: `{"phase":"all_reviews_complete","experts":[...],"current_expert_index":N,"review_issue":M,"original_issue":O}`

## Output

One comment posted to the **review issue** with the review/pushback/response and updated meta tag.

## Completion

Execute ONE action per invocation. The cron re-invokes for the next step. When `phase` becomes `"all_reviews_complete"`, stage 03 (`03-synthesize`) takes over on next invocation.
