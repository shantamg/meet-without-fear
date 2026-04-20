# Stage: Report

## Input

- Raw findings from all Stage 01 agents

## Process

1. **Classify findings** by severity:
   - CRITICAL: unauthorized new service pattern, cross-service direct imports, auth bypass pattern
   - HIGH: business logic in route handlers, duplicated types bypassing shared package, undocumented infrastructure
   - MEDIUM: StyleSheet.create usage, missing event-driven communication, convention drift in recent commits
   - LOW: minor naming inconsistencies, documentation gaps for existing patterns
   - INFO: architecture recommendations and improvement opportunities

2. **Create GitHub issues**:
   - CRITICAL/HIGH: one issue each via `shared/github/create-issue.md`, label `architecture` + `bot:investigate`
   - MEDIUM: single consolidated issue, label `architecture`
   - LOW/INFO: Slack report only

3. **Post to #agentic-devs** (channel ID from `.claude/config/services.json` key `agentic-devs`):
   - Summary: total findings by severity, domains scanned
   - Critical & High findings with file locations and remediation
   - Drift summary: patterns introduced in recent commits that diverge from formalized architecture
   - Architecture health score: percentage of domains passing

## Output

- GitHub issues for CRITICAL/HIGH/MEDIUM findings
- Slack report posted
- Summary: total findings, issue links, top priorities

## Completion

Final stage. Workspace run complete after report posted.

On completion, no label swap needed (cron-triggered).
