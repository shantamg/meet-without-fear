# Stage: Full Audit

## Input

- None (audits ALL living docs)

## Process

1. **Identify all living docs**: glob `docs/**/*.md` excluding `docs/archive/`. Filter to `status: living` or no frontmatter.
2. **Fan out audit agents** (one per section): architecture, science, mobile, workbench, infrastructure, guides, processes. Each agent reads docs and compares against relevant code.
3. **Check undocumented code**: scan for new apps, screens, scripts, packages without docs.
4. **Archive completed plans**: scan `.planning/` for complete work with existing living docs. Scan `docs/` for plan/design docs masquerading as living docs (indicators: "plan", "proposal", "checklist" in title, TODO lists, phase breakdowns).
5. **Doc hygiene scan**:
   - Frontmatter validation (required fields: `created`, `updated`, `status`)
   - Section placement check (content matches its `docs/` section)
   - Orphan detection (doc not referenced from any index or CLAUDE.md)
   - Duplicate/overlap detection (similar filenames, same H1, >50% content overlap)
6. **Fix all issues**: update drifted docs, create missing docs, archive plans, fix hygiene. Commit.
7. **Create PR** (via `shared/skills/pr.md`)
8. **Post summary** to #agentic-devs

## Output

- All doc issues fixed, committed, PR created
- Summary posted to Slack

## Completion

Single-stage. Complete after PR created.

On completion, no label swap needed (cron-triggered).
