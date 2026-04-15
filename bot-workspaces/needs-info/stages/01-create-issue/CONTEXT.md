# Stage: Create Issue

## Input

- GitHub issue with `bot:needs-info` label (from dispatcher or slack-triage)
- Issue body containing the original vague request and any provenance metadata
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (labels, title, state). You **MUST NOT** call `gh issue list` or `gh issue view --json labels` to check labels — that data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Confirm label
github_state_issue_has_label "$ISSUE_NUMBER" "bot:needs-info" || exit 0
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue view <number> --repo shantamg/meet-without-fear` — to read the issue **body** and **comments** (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Confirm the label** via the state file helper `github_state_issue_has_label`. Then **read the issue body** via `gh issue view <number>`.
2. **Check for existing bot comments** on the issue. If the bot has already posted an initial comment, skip to stage 02 (this is a re-entry).
3. **Classify the request category**:
   - `bug` — user describes something broken but lacks specifics
   - `feature` — user wants something new but scope is unclear
   - `question` — user is confused about existing behavior
4. **Post an initial comment** explaining the interview process:
   - Greet the user
   - Explain that the bot will ask a few clarifying questions
   - Ask the first round of questions (2-3) based on the category — use `shared/question-templates.md`
5. **Embed state metadata** as an HTML comment at the end of the bot comment:
   ```
   <!-- bot:needs-info-meta: {"questions_asked": 1, "category": "<category>", "created": "<ISO>"} -->
   ```

## Output

- Initial interview comment posted on the GitHub issue
- Category classification stored in metadata

## Completion

Proceed to `stages/02-interview/` on the next dispatcher tick.
