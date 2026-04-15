# GitHub Operations Patterns

Standard patterns for GitHub issue and PR operations. Referenced by workspaces that create issues, respond to PRs, or cross-reference work.

## Configuration

- **Repo**: `shantamg/meet-without-fear`
- **Default assignees**: `shantamg`
- See `.claude/config/services.json` for additional constants.

## Duplicate Check (always run before creating issues)

```bash
gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
```

**When a match is found:**
- **Open issue with same topic** → do NOT create a new issue. Instead, comment on the existing issue with the new finding details if they add information.
- **Closed issue with same topic** → do NOT create a new issue unless it's a clear regression (same vulnerability resurfaced). For regressions, reopen the existing issue with a comment.
- **No match** → proceed with creation.

Use semantic matching — titles don't need to be identical. "COPPA consent controls" matches "COPPA compliance for voice data". Search with 2-3 key terms, not full titles.

## Issue Labels

| Issue type | Label |
|---|---|
| Bug | `bug` |
| Feature request | `enhancement` |
| Ops / infrastructure | `infrastructure` |
| User feedback | `feedback` |
| Security | `security` |
| Brainstorm | `brainstorm` |
| Duplicate | `duplicate` |

## Duplicate Detection

The dispatcher runs `check-duplicates.sh` before dispatching any label-triggered issue. It compares the issue title against all open issues using word-overlap scoring.

| Score | Action |
|---|---|
| < 50% | No match — proceed with dispatch |
| 50–79% | Possible duplicate — comment on issue, pause dispatch, wait for human confirmation |
| >= 80% | High-confidence duplicate — label `duplicate`, comment with analysis, auto-close, skip dispatch |

**Pipeline guard:** Issues labeled `duplicate` are skipped by the dispatcher and will not trigger any bot workspace.

**To override:** Remove the `duplicate` label and re-add the `bot:*` trigger label. The dispatcher will pick it up on the next cycle.

## Bot Pipeline Labels

When a bot workspace creates an issue, it MUST also add a `bot:*` label so the
dispatcher picks it up and keeps it moving through the pipeline. Without a bot
label, the issue sits idle until a human notices or the hourly bug-fix sweep
happens to find it.

| Situation | Bot label to add |
|---|---|
| Bug or error that needs investigation first | `bot:investigate` |
| Straightforward code fix (clear root cause) | `bot:pr` |
| Security finding that needs a fix | `bot:pr` |
| Workspace convention violation | `bot:workspace-builder` |
| Issue needs more info from a human before proceeding | `bot:needs-info` |

**Default**: When in doubt, use `bot:investigate`. It's better to investigate
and discover it's simple than to jump straight to a fix and get it wrong.

## PR Comment Replies

- **Issue comments**: `gh api repos/shantamg/meet-without-fear/issues/<number>/comments -f body="..."`
- **Review comments**: `gh api repos/shantamg/meet-without-fear/pulls/<number>/comments/<comment_id>/replies -f body="..."`

## Auto-Creation Thresholds

| Condition | Create issue? |
|---|---|
| Sentry error with >5 events or >1 user | Yes |
| Error correlating with user activity drops | Yes |
| Log noise repeating >50 times in 24h | Yes |
| Pipeline failure (started but not completed) | Yes |
| Performance degradation (>5s, throttling) | Yes |
| Single-occurrence transient error | No |
| Known/already-tracked issue | No |

## Clickable Links in Slack

- PRs: `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>`
- Issues: `<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>`
