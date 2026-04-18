# Audit Docs Full — Complete Brute-Force Documentation Audit

Full audit of ALL living docs against the current codebase. Checks every doc regardless of what changed — catches drift, missing coverage, stale content, completed plans that should be archived, and doc hygiene issues. Use this for a thorough from-scratch audit. For a faster nightly check that only audits docs affected by recent changes, use `/audit-docs` instead.

Fan out a team of agents to check each section in parallel.

## Step 1: Identify all living docs

Glob for all markdown files in `docs/` (excluding `docs/archive/`). For each file, read the frontmatter and filter to those with `status: living` (or no frontmatter, which implies living). Build a list of doc paths grouped by section.

## Step 2: Fan out audit agents (parallel)

Launch one sub-agent per docs section. Each agent audits all living docs in its section against the relevant code. The sections and what to check:

### Architecture (`docs/architecture/`)
- **Agent prompt**: For each doc, identify the services/files/modules it describes. Read the actual code and compare. Flag: outdated API routes, missing endpoints, changed data flows, renamed modules, new modules not documented.
- **Code to check**: `backend/src/`, `mobile/`, `shared/`, route files, service files.

### Backend (`docs/backend/`)
- **Agent prompt**: Check that documented API routes, data models, prompting architecture, reconciler flow, and state machine match the current implementation.
- **Code to check**: `backend/src/`, `backend/prisma/schema.prisma`, prompt files, reconciler services, state machine code.

### Mobile (`docs/mobile/`)
- **Agent prompt**: Check that documented screens, navigation flows, and component patterns match the actual mobile app code.
- **Code to check**: `mobile/`, screen components, navigation config.

### Deployment (`docs/deployment/`)
- **Agent prompt**: Check that documented deployment configs, service URLs, environment variables, and CI/CD pipelines match actual configs.
- **Code to check**: `render.yaml`, `vercel.json`, `scripts/ec2-bot/`, `package.json` scripts, `.github/workflows/`.

### Infrastructure (`docs/infrastructure/`)
- **Agent prompt**: Check that documented infrastructure (slam-bot, EC2, Vercel, etc.) matches actual configs and scripts.
- **Code to check**: `scripts/`, EC2 bot configs, infrastructure-related workflow files.

### E2E Testing (`docs/e2e-testing/`)
- **Agent prompt**: Check that documented E2E test architecture, setup, and flows match actual test code.
- **Code to check**: E2E test files, test fixtures, CI workflow files.

### Product (`docs/product/`)
- **Agent prompt**: Check that documented product concepts, stages, mechanisms, inner-work features, and privacy model are consistent with the implementation where they connect to code.
- **Code to check**: Stage-related backend services, inner-work modules, vessel/consent code.

### Processes (`docs/processes/`)
- **Agent prompt**: Check that documented processes (doc maintenance, planning) are consistent with CLAUDE.md and actual workflow files.
- **Code to check**: `CLAUDE.md`, `.claude/commands/`, `scripts/`.

### Each agent must return a structured report:

```
## [Section Name] Audit

### Docs checked
- `docs/path/file.md` — status

### Issues found
1. **[doc path]: [issue title]** — [description of drift/gap]
   - Expected (from doc): ...
   - Actual (from code): ...

### Missing coverage
- [code area with no doc coverage]

### Stale content
- [doc sections that reference removed/renamed things]

### OK
- [docs that are accurate and up-to-date]
```

## Step 3: Check for undocumented code areas

Launch one more agent to scan the codebase for significant code areas that have NO corresponding documentation:
- New backend services/modules without a doc in `docs/architecture/` or `docs/backend/`
- New mobile screens without mention in `docs/mobile/`
- New infrastructure scripts without mention in `docs/infrastructure/`
- New shared packages without mention anywhere in docs

## Step 4: Archive completed plans

Launch an agent to scan for completed plans and design docs that should be archived. This keeps `docs/` clean and ensures only living reference material is published to the docs site and AI knowledge base.

### 4a: Scan `.planning/` for completed work

Read all files in `.planning/` (including subdirectories). For each file or directory, determine if the work described is complete by checking:
- Are all tasks/TODOs marked done?
- Does the corresponding feature exist in the codebase?
- Is there already a living doc in `docs/` covering this feature?

If the plan is complete and a living doc already covers it, the plan file is a candidate for archival.

### 4b: Scan `docs/` for plan/design docs masquerading as living docs

Read all docs in `docs/` (excluding `docs/archive/`). Flag any doc that is actually a plan, design proposal, implementation checklist, or audit report rather than a living reference doc. Indicators:
- Title or content contains "plan", "proposal", "implementation plan", "checklist", "audit report", "gap analysis", "completion report"
- Contains TODO lists, phase breakdowns, or milestone tracking
- Has `status: living` but reads like a one-time deliverable rather than maintained reference
- Describes work to be done rather than how things currently work

### 4c: Archive the candidates

For each doc identified in 4a or 4b:
1. Move the file to `docs/archive/` (use `git mv` for tracked files, plain `mv` for untracked)
2. Update the frontmatter: set `status: archived` and `updated` to today's date. If no frontmatter exists, add it:
   ```yaml
   ---
   created: [original date or today]
   updated: [today]
   status: archived
   ---
   ```
3. Remove any references to the archived doc from index files or CLAUDE.md routing tables

### Agent report format:

```
## Archive Completed Plans

### Archived
- `[original path]` -> `docs/archive/[filename]` — [reason for archival]

### Skipped (incomplete or still relevant)
- `[path]` — [reason for keeping]

### No living doc exists yet
- `[plan path]` — Plan is complete but no living doc covers this area. Flagged for Step 7 (missing coverage).
```

## Step 5: Doc hygiene scan

Launch an agent to check overall documentation health. This catches structural and organizational issues that per-section audits miss.

### 5a: Frontmatter validation

Check every markdown file in `docs/` (excluding `docs/archive/`) for frontmatter issues:
- **Missing frontmatter**: No YAML frontmatter block at all
- **Missing required fields**: Must have `created`, `updated`, and `status` fields
- **Invalid status**: `status` must be one of `living`, `reference`, or `archived`
- **Stale dates**: `updated` date is more than 6 months old (flag for review, may be fine if doc is stable)
- **Malformed YAML**: Frontmatter exists but has syntax errors

### 5b: Section placement check

Verify each doc belongs in its current section based on content:
- `docs/architecture/` — System design, service descriptions, data flows, integrations, conventions
- `docs/backend/` — Backend API, data model, prompting, reconciler, state machine, security
- `docs/mobile/` — Mobile app screens, navigation, components, wireframes
- `docs/product/` — Product concept, stages, mechanisms, inner-work, privacy/vessel model
- `docs/deployment/` — Render config, env vars, deployment process
- `docs/infrastructure/` — Slam-bot, EC2, Vercel, supporting infra
- `docs/e2e-testing/` — End-to-end test architecture
- `docs/processes/` — Team processes, communication, maintenance routines

Flag any doc whose content doesn't match its section.

### 5c: Orphan doc detection

Check that every doc in `docs/` is referenced from at least one of:
- Its section's `index.md`
- `CLAUDE.md` routing table
- Another doc in the same section (cross-reference)

Docs not linked from anywhere are "orphans" — they exist but are effectively invisible. Flag them.

### 5d: Duplicate/overlap detection

Scan for docs that cover the same topic. Indicators:
- Very similar filenames
- Same H1 heading or significant heading overlap
- More than 50% of content covers the same concepts

For each duplicate pair, recommend which to keep, merge, or archive.

### Agent report format:

```
## Doc Hygiene Scan

### Frontmatter issues
- `[path]` — [issue: missing frontmatter / missing field X / invalid status / stale date]

### Misplaced docs
- `[path]` — Currently in [section], should be in [section]. Reason: [explanation]

### Orphan docs (not linked from any index)
- `[path]` — Not referenced from [section index / CLAUDE.md / any other doc]

### Duplicate/overlapping docs
- `[path1]` and `[path2]` — Both cover [topic]. Recommendation: [keep/merge/archive which one]

### Clean
- [N] docs passed all hygiene checks
```

## Step 6: Compile findings

Merge all agent reports (Steps 2-5) into a single consolidated report. Organize by severity:

1. **Critical drift** — Doc says X, code does Y (misleading)
2. **Missing coverage** — Significant code with no documentation
3. **Stale content** — References to removed/renamed things
4. **Archived plans** — Completed plans moved to `docs/archive/`
5. **Hygiene issues** — Misplaced docs, missing frontmatter, orphans, duplicates
6. **Minor issues** — Formatting, broken links, outdated dates

## Step 7: Fix issues

For each issue found:
1. **Critical drift & stale content** — Update the doc to match the code. Set `updated` frontmatter to today's date.
2. **Missing coverage** — Create a new doc in the appropriate section with proper frontmatter. Add it to the section's index.
3. **Archived plans** — Already moved in Step 4. Verify the moves are clean.
4. **Hygiene issues**:
   - Missing/malformed frontmatter — Add or fix the frontmatter block.
   - Misplaced docs — Move to the correct section with `git mv`. Update any references.
   - Orphan docs — Add to the appropriate section index.
   - Duplicates — Merge content into the better doc, archive the other.
5. **Minor issues** — Fix inline.

After all fixes, run `npm run docs:check` to validate internal links.

Commit all changes with a descriptive message summarizing what was updated.

## Step 8: Create PR

Run `/pr` to create a pull request.

## Step 9: Post summary to Slack

Post a summary to `#agentic-devs` using `/slack-post`:
- **channel**: `C0AM2J47R4L`
- **text**: `$SUMMARY`

**Format:**
- **No issues**: `✅ Docs audit [date]: All docs are up to date. No changes needed.`
- **Issues fixed**: `📝 Docs audit [date]: Fixed N issues across M docs (including K plans archived, J hygiene fixes). PR: [link].`
- **Could not auto-fix**: `⚠️ Docs audit [date]: Found N issues, fixed M. Some need manual review: [brief description]. PR: [link]`
