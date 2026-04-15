# Stage: Report

## Input

- Raw findings from all Stage 1 agents
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file to pre-filter issues by label before searching. You **MUST NOT** call `gh issue list --label` for simple label filtering — that data is in the state file. However, keyword **search** across issue titles/bodies is NOT in the state file, so `gh issue list --search` remains an allowed escape hatch.

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make:
- `gh issue list --repo shantamg/meet-without-fear --label security --search "KEY_TERMS"` — keyword search to deduplicate findings (search is not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Classify findings** by severity:
   - CRITICAL: data exposed to model training, unencrypted PII, auth bypass, breach risk
   - HIGH: missing DPA with PII vendor, no deletion capability, secrets in code, missing auth
   - MEDIUM: missing rate limiting, incomplete audit trails, outdated deps with CVEs
   - LOW: log verbosity, missing security headers, documentation gaps
   - INFO: best practice recommendations
2. **Deduplicate before creating issues** (MANDATORY):
   - First, get all security-labeled issues from the state file to check for obvious title matches:
     ```bash
     SECURITY_ISSUES=$(github_state_issues_with_label "security")
     ```
   - For findings not matched by title, search with keywords (escape hatch):
     ```bash
     gh issue list --repo shantamg/meet-without-fear --label security --search "KEY_TERMS" --limit 20 --json number,title,state,labels,url
     ```
   - Use 2-3 key terms from the finding (e.g., "COPPA consent", "webhook auth bypass", "dependency vulnerabilities")
   - If a **matching open issue** exists → skip creation, note "already tracked in #N" in the Slack report
   - If a **matching closed issue** exists → skip creation unless the finding represents a **regression** (same vulnerability resurfaced). For regressions, reopen the existing issue with a comment instead of creating a new one
   - Only create a new issue when no semantic match is found (title/topic overlap counts as a match even if wording differs)
3. **Create GitHub issues** (only for net-new findings after dedup):
   - CRITICAL/HIGH: one issue each via `shared/github/create-issue.md`, label `security` + `bot:investigate`, assign `shantamg`
   - MEDIUM: single consolidated issue, label `security` + `bot:investigate`
   - LOW/INFO: Slack report only
   - Always add `bot:investigate` so findings enter the bot pipeline for automated investigation (see `shared/references/github-ops.md` Bot Pipeline Labels)
4. **Post to #security-audit** (channel `C0AMBNDFL9X`):
   - Summary: total findings by severity
   - Critical & High findings with impact and remediation
   - Third-party data handling matrix (service, data sent, training opt-out, DPA status)
   - If CRITICAL: tag @shantamg

## Output

- GitHub issues for CRITICAL/HIGH/MEDIUM findings
- Slack report posted to #security-audit
- Summary: total findings, issue links, top 3 priorities

## Completion

Final stage. Workspace run complete after report posted.

On completion, no label swap needed (cron-triggered).
