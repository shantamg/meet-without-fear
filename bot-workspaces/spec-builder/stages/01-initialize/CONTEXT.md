# Stage: Initialize

## Input

- GitHub issue with `bot:spec-builder` label
- Issue body (may contain rough idea, or structured content from `needs-info` graduation)
- Issue comments (may contain a `## Research Report` from the `research/` workspace — read this as upstream context)
- `shared/draft-template.md` — for initial draft structure
- `shared/rubrics.md` — to preview what the Scope stage will evaluate
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (title, labels, state). You **MUST NOT** call `gh issue view --json labels` or `gh issue list` for fields already in the state file. Re-fetching them via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Confirm label from state file
github_state_issue_has_label "$ISSUE_NUMBER" "bot:spec-builder" || exit 0
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make:
- `gh issue view <number> --repo shantamg/meet-without-fear` — to read the issue **body** and **comments** (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Read the issue body** via `gh issue view <number>` (escape hatch — body is not in state file). Confirm the label via the state file.
2. **Check for upstream research findings** in issue comments. Look for comments containing `## Research Report` (posted by the `research/` workspace). If found, extract:
   - Codebase analysis (affected files, current architecture, existing patterns)
   - External research (third-party docs, best practices)
   - Constraints and risks
   - Recommended approach and complexity assessment
   Use these findings to pre-populate the draft's technical sections and inform the interview.
3. **Check for existing meta tag** in comments. If found, this is a resume — skip to the stage indicated in the meta tag.
4. **Post onboarding comment** introducing the interview process:
   - Explain the 3 interview stages (Scope, Deepen, Technical) and what each covers
   - Set expectations: "Each stage takes 2-3 rounds of questions. You can `/pause` anytime."
   - Show the available commands in a subtle footer
5. **Pre-populate the draft** from the issue body content and any upstream research findings. Map any existing content to the draft template sections (Problem, Success Criteria, etc.). If research findings exist, pre-fill the technical approach and constraints sections. Leave unaddressed sections as "*(pending)*".
6. **Post initial draft snapshot** as a comment with the pre-populated template.
7. **Update the issue body** with the rendered draft.
8. **Post meta tag** in the draft snapshot comment:
   ```
   <!-- bot:spec-builder-meta: {"stage": "scope", "round": 0, "rubric": {}, "draft_hash": "<hash>", "draft_version": 1, "last_human_response_at": null, "nudge_sent": false} -->
   ```

## Output

- Onboarding comment posted
- Initial draft snapshot comment posted
- Issue body updated with rendered draft
- Meta tag initialized, pointing to `02-scope` as next stage

## Completion

On next dispatcher tick, proceed to `stages/02-scope/`.
