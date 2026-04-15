# PR Reviewer (L1)

Proactively scan all open bot PRs, classify state, rebase conflicts, review quality, fix issues, and merge or tag humans. Closes the autonomous bot loop.

## Modes

| Mode | Trigger | Entry Stage |
|---|---|---|
| Sweep all bot PRs | Cron (scheduled) | `01-scan` |
| Single PR | Issue labeled `bot:pr-reviewer` | `01-scan` |
| Plan-alignment review | PR labeled `bot:review-impl` | `review-impl` |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `references/review-checklist.md` | Stage 03 | Quality criteria for reviews |
| `references/rebase-guide.md` | Stage 02 | Conflict resolution patterns |
| `shared/references/github-ops.md` | Stages 02, 04, 05 | PR/branch operations |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Only read via `gh pr diff` per-PR, not bulk-loaded |
| `docs/` | Not needed for PR lifecycle management |
| `shared/diagnostics/` | No production diagnostic work |
| `shared/slack/` | Output goes to GitHub comments, not Slack |
| Other workspaces | Each workspace is self-contained |

## Session Initialization — Run this FIRST, before any stage

Set a run_id for this session. Run this **exactly once** at the top of every pr-reviewer session:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
pr_reviewer_state_init
export PR_REVIEWER_RUN_ID="pr-reviewer-$(date -u +%Y%m%dT%H%M%SZ)-$$"
echo "pr-reviewer session started: run_id=$PR_REVIEWER_RUN_ID"
```

The run_id is logged in every stage for correlation. `pr_reviewer_state_init` is a no-op (retained for compatibility) — state now comes from the global file.

## State File — the single source of truth for PR metadata

**All PR metadata read by stages 02–05 MUST come from the global `github-state.json`, maintained by the `github-state-scanner.sh` daemon (updated every ~60s).** Stage 01 no longer makes a `gh pr list` call — it reads directly from the global state file. This is the primary mechanism to keep GitHub API consumption from exhausting the rate-limit bucket (see #1649, #1652, #1741). Calling `gh pr view` for fields already in the state file is **forbidden** — each stage's CONTEXT.md repeats this rule with the specific escape hatches allowed.

Helpers for reading the state file are in `/opt/slam-bot/scripts/lib/pr-reviewer-state.sh` (thin wrappers over `github-state.sh`):

- `pr_reviewer_state_assert_fresh` — delegates to `github_state_assert_fresh` (120s freshness window)
- `pr_reviewer_state_pr_numbers` — list all PR numbers in the state file
- `pr_reviewer_state_pr <N>` — get a PR's full state entry as JSON
- `pr_reviewer_state_field <N> <field>` — get a single field
- `pr_reviewer_state_has_label <N> <label>` — exit 0 if the PR has the label

Every stage 02–05 CONTEXT.md starts with a mandatory source + freshness check before doing any work.

## Stage Progression

1. `01-scan` — Read all open PRs from the global state file, classify each into next stage
2. `02-rebase` — Rebase conflicting PRs onto target branch (reads branches from state file)
3. `03-review` — Quality-check diff against linked issue, post review comment (reads labels/state from state file)
4. `04-fix` — Address review feedback or failing checks (reads head branch and check state from state file)
5. `05-merge-or-tag` — Squash-merge to non-main branches, tag humans for main (reads base branch and labels from state file)
6. `review-impl` — Plan-alignment review: check implementation against issue requirements, research findings, and spec (standalone entry point, not part of scan loop)

### Self-Correction Loop (Stages 03 → 04 → 03)

When Stage 03 finds issues, it adds `bot:review-changes-needed`. This triggers
a self-correction loop:

```
03-review (changes needed) → add bot:review-changes-needed
      ↓
04-fix → push fixes → remove bot:review-changes-needed
      ↓
03-review (re-review) → LGTM? → 05-merge-or-tag
                       → still issues? → add bot:review-changes-needed → loop
```

`bot:needs-human-review` is ONLY applied by:
- Stage 05 when the bot is satisfied (LGTM) and the PR targets `main`
- Stage 04 when 3 fix cycles are exhausted (human escalation)

## Orchestrator Rules

- Process PRs sequentially (one at a time through stages 02-05)
- Rebase operations run in worktree isolation
- Max 3 fix cycles per PR before flagging for human intervention
- Skip PRs already being processed by `ci-monitor`
- Skip PRs with `bot:in-progress` label — another agent is already working on it
- **Respect human conversation**: if a human was the last to comment or review a PR (and no new commits since), do NOT act — wait for an explicit trigger label or new commits. Exception: merge conflicts are always auto-rebased.
- Never merge PRs targeting `main` — tag humans instead
- Never route a PR with `bot:review-changes-needed` to Stage 05

## Label Lifecycle

Each PR stage claims the PR with `bot:in-progress` at start and releases it at end.
This prevents concurrent agents from working on the same PR.

| Label | Meaning | Set by | Cleared by |
|-------|---------|--------|------------|
| `bot:needs-review` | PR needs bot review — the trigger | PR creation (shared/skills/pr.md), or human applying label | Stage 03 (consumed after review) |
| `bot:in-progress` | Agent is actively working on this PR | Stage start (02-05) | Stage end (02-05) |
| `bot:reviewed` | Bot has completed review | Stage 03 | — (stays until superseded) |
| `bot:review-changes-needed` | Bot found issues, self-correction needed | Stage 03 | Stage 04 (after fix) |
| `bot:needs-human-review` | Ready for human eyes | Stage 05 (LGTM) or Stage 04 (exhausted) | Manual |

The full lifecycle: `bot:needs-review` → `bot:in-progress` → `bot:reviewed` → `bot:needs-human-review`
