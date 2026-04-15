# Stage: Scan

## Input

- Cron trigger (sweep all) or issue body with specific PR number
- Global state file (`github-state.json`) maintained by the scanner daemon

## Process

### 1. Source the state helper and verify session init

The orchestrator (pr-reviewer `CLAUDE.md`) initialized the session with
`pr_reviewer_state_init` + `export PR_REVIEWER_RUN_ID=...`. Confirm this
stage sees the same run_id and source the state helper:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
: "${PR_REVIEWER_RUN_ID:?orchestrator did not set PR_REVIEWER_RUN_ID — run the session init block in CLAUDE.md first}"
echo "Stage 01 running under run_id=$PR_REVIEWER_RUN_ID"
```

### 2. Assert the global state file is fresh

**There is no `gh pr list` call in this stage.** All PR metadata comes from the global state file (`github-state.json`), which the `github-state-scanner.sh` daemon updates every ~60 seconds. The state helpers (`pr_reviewer_state_*`) are thin wrappers over `github_state_*` — see `lib/pr-reviewer-state.sh`.

```bash
pr_reviewer_state_assert_fresh || {
  echo "FATAL: global state file is missing or stale — is github-state-scanner.sh running?"
  exit 1
}

PR_COUNT=$(pr_reviewer_state_pr_numbers | wc -l | tr -d ' ')
echo "Global state file has $PR_COUNT open PR(s) — run_id=$PR_REVIEWER_RUN_ID"
```

From this point forward, every PR metadata lookup in stages 02–05 reads from the global state file via the `pr_reviewer_state_*` helper functions — no `gh pr list` or `gh pr view --json <scan-field>` calls.

### 3. Determine the set of PRs eligible for action

Build the in-memory candidate set by filtering the state file client-side. Both bot identities count as "bot-authored" (legacy `MwfBot` PAT + new GitHub App bot-user `mwf-bot-app[bot]` — historical PRs are still attributed to the legacy login).

```bash
# PRs to consider: bot-authored OR carry a trigger label. Exclude drafts,
# bot:in-progress (another agent is working), and bot:ci-monitor.
CANDIDATES=$(jq -r '
  .prs | to_entries[] | .value |
  select(
    (.author_login == "MwfBot" or .author_login == "mwf-bot-app[bot]"
     or (.labels | any(. == "bot:needs-review"))
     or (.labels | any(. == "bot:review-pr"))
     or (.labels | any(. == "bot:pr-reviewer")))
    and (.labels | any(. == "bot:in-progress") | not)
    and (.labels | any(. == "bot:ci-monitor") | not)
  ) |
  .number
' "$PR_REVIEWER_STATE_FILE")

echo "Candidate PRs: $CANDIDATES"
```

If single-PR mode (from an issue body specifying a PR number), intersect `$CANDIDATES` with that one number.

### 4. For each candidate PR, determine last actor and review staleness

**This is the one place the scan may legitimately make per-PR `gh` calls** — the last-actor check needs the comments/reviews array, and `last_bot_review_sha` needs the commits array. These fields are too expensive to prefetch in the bulk scan.

For each candidate, fetch minimal per-PR state:

```bash
REPO=shantamg/meet-without-fear

for N in $CANDIDATES; do
  PER_PR=$(gh pr view "$N" --repo "$REPO" \
    --json comments,reviews,commits \
    --jq '{
      last_comment:   ([.comments[] | {author: .author.login, date: .createdAt}] | sort_by(.date) | last),
      last_review:    ([.reviews[]  | {author: .author.login, date: .submittedAt, body: .body}] | sort_by(.date) | last),
      last_commit_at: (.commits | last | .committedDate),
      last_bot_review: (
        [.reviews[] |
          select(.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]") |
          {body: .body, date: .submittedAt}
        ] | sort_by(.date) | last
      )
    }')
  # ... use PER_PR to classify (next step)
done
```

Record the outcome of each classification in a shell-local associative array or a streaming JSON structure — you'll use it to drive the work queue in step 5.

### 5. Classify each candidate PR into its next stage

Apply these rules **in priority order** — the first matching rule wins. The state file has everything you need for rules that don't involve comments/reviews; use the fields-from-state-file pattern below, not `gh pr view`.

| Priority | State (check via) | Next Action |
|----------|-------------------|-------------|
| 1 | `mergeable == "CONFLICTING"` *(state file: `pr_reviewer_state_field N mergeable`)* | **Stage 02 (rebase)** — always, regardless of last actor |
| 2 | Any statusCheckRollup entry has state `FAILURE` AND PR is bot-owned or not-yet-touched | **Stage 04 (fix)** |
| 3 | Checks failing AND PR is human-gated | **Skip** — human is aware |
| 4 | Has label `bot:review-changes-needed` AND bot-owned AND no new commits since last bot review | **Stage 04 (fix)** — self-correction loop |
| 5 | Has label `bot:review-changes-needed` AND new commits since last bot review | **Stage 03 (re-review)** |
| 6 | No bot review comment exists yet (last_bot_review is null) | **Stage 03 (initial review)** |
| 7 | Human-gated (last_comment or last_review author is human, no new commits) | **Skip** — wait for label or commits |
| 8 | Bot reviewed + changes needed + new commits since review | **Stage 03 (re-review)** |
| 9 | Bot reviewed + LGTM + mergeable | **Stage 05 (merge or tag)** |
| 10 | Has `bot:in-progress` label *(already filtered out in step 3)* | Skip |
| 11 | Already merged/closed *(won't appear in state file)* | Skip |

**Explicit override**: if a PR has `bot:review-pr` or `bot:pr-reviewer`, treat it as bot-owned regardless of last actor.

**Bot-owned** vs **human-gated** definitions (unchanged from the pre-state-file version):

- **Human-gated**: `last_comment.author` or `last_review.author` is neither `MwfBot` nor `mwf-bot-app[bot]`, AND `last_commit_at` is older than that human activity.
- **Bot-owned**: last activity is a bot, OR new commits after the last human activity.
- **Not yet touched**: no comments or reviews from anyone.

**CRITICAL RULES** (inherited from the pre-state-file behavior):

- Conflict detection (Priority 1) ALWAYS runs, regardless of labels or last actor.
- Human-gated PRs only advance for rebase (conflicts) or explicit-label overrides.
- Never LGTM a PR that previously had "Changes needed" without new commits.
- A PR with `bot:review-changes-needed` in its labels never routes to Stage 05.

### 6. Build the ordered work queue

Prioritize by action first, then within each group by `high-priority` label or ⚡ reaction:

```
rebase (stage 02) → fix (stage 04) → review (stage 03) → merge (stage 05)
```

For each PR in the queue, emit a `{pr_number, next_stage}` tuple that the orchestrator will dispatch sequentially through stages 02–05. The dispatched stages will each read PR metadata from the state file — they do NOT re-fetch.

**To check for `high-priority`**: the state file already contains all labels, so this is a jq expression over `$PR_REVIEWER_STATE_FILE`:

```bash
pr_reviewer_state_has_label "$N" high-priority && echo "$N is high-priority"
```

For ⚡ emoji reactions, you still need a per-PR API call (reactions aren't in `gh pr list --json`), but only for PRs that reach this step AND aren't already marked high-priority via label — use `gh api repos/$REPO/issues/$N/reactions --jq '.[] | select(.content == "eyes" or .content == "rocket") | .id'` sparingly.

## Output

Work queue: ordered list of `{pr_number, next_stage}` tuples. The state file at `$PR_REVIEWER_STATE_FILE` contains the full metadata for every PR in the queue.

## Completion

Process each PR in the work queue by routing to its next stage (02–05). Every downstream stage will `source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh && pr_reviewer_state_assert_fresh` before doing any work, so the global state file MUST be fresh before you dispatch.
