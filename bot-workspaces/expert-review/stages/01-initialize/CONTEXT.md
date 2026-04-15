# Stage: Initialize

## Input

- Issue number(s) from arguments
- Issue body and any existing comments
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (title, labels, state). You **MUST NOT** call `gh issue list` or `gh issue view --json labels,state` to check these fields — that data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Get issue title from state file
TITLE=$(github_state_issue_field "$ISSUE_NUMBER" title)
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue view <number> --repo shantamg/meet-without-fear` — to read the issue **body** (not in state file)
- `gh issue view <number> --repo shantamg/meet-without-fear --comments` — to read issue **comments** (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Read the original issue** body and all comments via `gh issue view` and `gh issue view --comments`. Use the state file for title and labels.
2. **Check for existing review issue**: search comments on the original issue for a link to an existing review issue (posted by this workflow). If found, read that review issue's comments and find the latest meta tag — skip to the appropriate stage (02, 03, or 04) based on `phase`.
3. **Select 4 expert personas** from the pool:
   - Pool: Parent-child psychologist, Game developer, UI/UX designer, Product engineer, Data scientist, Security engineer, Behavioral economist, Early childhood educator, Clinical researcher, Systems architect, Business strategist, Growth marketer
   - Choose the 4 most relevant to the issue's domain
   - Product engineer (or closest) MUST go **last**
4. **Create a new review issue** with:
   - Title: `Expert Review: [original issue title]`
   - Body: Link to original issue + copy of the original issue body for context
   - Label: `expert-review-thread`
   - Example body:
     ```
     > Expert review for #<original_number>
     >
     > **Original issue**: https://github.com/shantamg/meet-without-fear/issues/<original_number>

     ---

     ## Original Issue Content

     <original issue body>
     ```
5. **Post a brief link comment on the original issue**:
   ```
   Expert review started — all review discussion will happen in #<review_issue_number>.
   ```
6. **Post roster comment on the review issue** with:
   - Numbered list of selected experts with one-line rationale for each
   - Meta tag: `<!-- bot-expert-review-meta: {"phase":"roster","experts":[...],"current_expert_index":0,"review_issue":<review_issue_number>,"original_issue":<original_number>} -->`
7. **Write the state file** to `/tmp/slam-bot/expert-review-state-<original_issue>.json`:
   ```json
   {
     "original_issue": <original_number>,
     "original_title": "<issue title>",
     "original_body": "<full issue body text>",
     "review_issue": <review_issue_number>,
     "experts": ["Expert 1", "Expert 2", "Expert 3", "Expert 4"],
     "fetched_at": "<ISO-8601 timestamp>"
   }
   ```
   This state file is consumed by stages 02–04 so they do NOT need to re-fetch the original issue or search for the review issue link. Create the `/tmp/slam-bot/` directory if it does not exist.

## Output

- One new review issue created with the original issue content
- One brief link comment posted on the original issue
- One roster comment posted on the review issue with meta tag
- One state file written to `/tmp/slam-bot/expert-review-state-<original_issue>.json`

## Completion

Stage complete. On next invocation, stage 02 (`02-review-cycle`) takes over based on the `"roster"` phase in the meta tag.
