# Audit Docs — Git-History-Aware Documentation Drift Check

Targeted docs audit that uses git history to identify which code changed recently, then only audits the docs covering those areas. Much faster than the full audit (`/audit-docs-full`) and ideal for nightly runs.

**Argument**: lookback period (e.g. `48 hours ago`, `3 days ago`, `7 days ago`). Defaults to `48 hours ago` if not specified.

> **Note**: Use git-compatible relative date formats (`N hours ago`, `N days ago`). Short forms like `24h` are NOT reliably parsed by `git log --since`.

## Step 1: Identify what changed

Run `git log` and `git diff` to find all files that changed in the lookback period:

```bash
git log --since="$LOOKBACK" --name-only --pretty=format: | sort -u | grep -v '^$'
```

Also grab commit messages for context on what changed and why:

```bash
git log --since="$LOOKBACK" --oneline
```

Build a list of changed files grouped by area (backend/, mobile/, shared/, docs/, scripts/, etc.).

## Step 2: Map changed code to docs

Using the doc routing table below, determine which docs are potentially affected by the code changes. Only these docs will be audited.

| Code area | Docs to check |
|---|---|
| `backend/src/` | `docs/architecture/backend-overview.md`, `docs/backend/overview/architecture.md`, `docs/backend/api/` |
| `backend/prisma/` | `docs/backend/data-model/prisma-schema.md` |
| Reconciler / empathy logic (`backend/src/services/reconciler*`, etc.) | `docs/backend/reconciler-flow.md`, `docs/diagrams/reconciler-paths.md` |
| State machine / stage progression | `docs/backend/state-machine/index.md`, `docs/backend/state-machine/retrieval-contracts.md` |
| Prompt / LLM code (`backend/src/prompts/`, etc.) | `docs/backend/prompting-architecture.md`, `docs/backend/prompts/index.md`, `docs/backend/prompt-caching.md` |
| `mobile/` | `docs/architecture/structure.md`, `docs/mobile/wireframes/` |
| `render.yaml`, `vercel.json`, `.github/workflows/`, `scripts/ec2-bot/` | `docs/deployment/`, `docs/infrastructure/` |
| `shared/` | Any doc referencing shared types |
| `.claude/commands/`, `CLAUDE.md` | `docs/processes/`, `docs/architecture/conventions.md` |
| `docs/` files themselves | Check the changed doc against its corresponding code |

If no code files changed (only docs, configs, etc.), still audit the changed docs against the code they reference.

If NO files changed at all in the lookback period, skip to Step 6 and report "no changes."

## Step 3: Fan out targeted audit agents (parallel)

Launch one sub-agent per affected docs section (NOT per doc — group by section). Each agent:

1. Reads the git log entries and diffs for the changed files in its area
2. Reads the affected docs
3. Compares the docs against the current code, using commit messages as context clues for what changed and why
4. Returns a structured report

### Each agent must return:

```
## [Section Name] Audit

### Changes detected
- `[changed file]` — [commit message summary]

### Issues found
1. **[doc path]: [issue title]** — [description of drift]
   - Expected (from doc): ...
   - Actual (from code): ...

### OK
- [docs that are still accurate after these changes]
```

## Step 4: Check for new undocumented code

From the changed files list, check if any NEW files or modules were added that should have documentation but don't:
- New service/module in `backend/`
- New screen in `mobile/`
- New infrastructure script
- New shared package

## Step 5: Doc hygiene for changed docs

If any docs themselves were modified in the lookback period, run a quick hygiene check on just those docs:
- Frontmatter is valid (`created`, `updated`, `status` fields present)
- `updated` date was bumped
- Doc is in the correct section
- Doc is referenced from its section index

## Step 6: Compile findings and fix

Merge all agent reports. Organize by severity:

1. **Critical drift** — Doc says X, code does Y
2. **Missing coverage** — New code with no documentation
3. **Stale content** — References to removed/renamed things
4. **Hygiene issues** — Frontmatter, placement, orphans

For each issue found:
1. **Critical drift & stale content** — Update the doc to match the code. Set `updated` frontmatter to today's date.
2. **Missing coverage** — Create a new doc in the appropriate section with proper frontmatter. Add it to the section's index.
3. **Hygiene issues** — Fix frontmatter, update references.

If no issues found, skip to Step 7.

After all fixes, commit changes with a descriptive message.

## Step 7: Create PR (if changes were made)

If any docs were updated or created, run `/pr` to create a pull request.

## Step 8: Post summary to Slack

Post a summary to `#agentic-devs` using `/slack-post`:
- **channel**: `C0AM2J47R4L`
- **text**: `$SUMMARY`

**Format:**
- **No changes**: `✅ Docs audit [date]: No code changes in the last [lookback]. Nothing to audit.`
- **No issues**: `✅ Docs audit [date]: Audited [N] docs affected by [M] code changes in the last [lookback]. All docs are up to date.`
- **Issues fixed**: `📝 Docs audit [date]: [M] code changes in the last [lookback] → fixed [N] doc issues. PR: [link].`
- **Could not auto-fix**: `⚠️ Docs audit [date]: [M] code changes in the last [lookback] → found [N] issues, fixed [X]. Some need manual review: [brief description]. PR: [link]`
