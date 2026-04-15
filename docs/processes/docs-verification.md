---
title: Living-doc verification with NotebookLM
sidebar_position: 2
description: How to check whether a living doc still matches the code it describes, using the notebooklm CLI.
updated: 2026-04-15
---

# Living-doc verification

Living docs drift from code silently. We use NotebookLM (via the `notebooklm` CLI) to catch drift: upload the doc + its mapped code files into a notebook, ask "what's wrong", fix.

## Prerequisites

1. `notebooklm` CLI installed and authenticated (`notebooklm login` — opens a browser once; token lives at `~/.notebooklm/storage_state.json`).
2. `jq` installed (present in devenv).
3. The doc must have at least one entry in `docs/code-to-docs-mapping.json` pointing at its mapped code paths. If not, add one first.

## One-shot verification

```bash
bash scripts/verify-docs.sh docs/architecture/backend-overview.md
```

The script:
1. Reads `docs/code-to-docs-mapping.json` to find all code globs that list the doc as a target.
2. Expands globs into a concrete file list (capped at 25 to stay inside NotebookLM's source limits).
3. Creates (or reuses) a per-doc notebook named `mwf-verify-<doc-slug>`.
4. Deletes existing sources (clean slate), then uploads the doc + code files as text sources.
5. Asks NotebookLM: "List every specific inaccuracy, with citations from both the doc and the code."
6. Prints findings.

Example output (real, from an actual run):

> **Rate Limiting Tiers:**
> - Doc Claim: "streamingRateLimit: 10 req/min, empathyRateLimit: 20 req/min, authRateLimit: 30 req/min"
> - Code Reality: single `rateLimitMiddleware` with 100 requests per window.

## List docs that have mappings

```bash
bash scripts/verify-docs.sh --list
```

## Automated fix loop (via skill)

The `verify-and-fix-doc` skill automates the full iterative workflow. Invoke it in Claude Code:

> "verify docs/architecture/backend-overview.md"
> "fix drift in docs/backend/api/auth.md"

Or to run all mapped docs at once:

> "verify all docs"

The skill:

1. Runs `scripts/verify-docs.sh <doc>` and captures findings.
2. For each finding, decides whether to edit the doc or the code (see decision rules below).
3. Commits: one commit per iteration using `docs: fix drift in <doc-path> (N findings resolved: <summary>)`.
4. Re-verifies. Repeats up to **5 iterations** per doc, then stops and surfaces any remaining findings.
5. In `--all` mode, iterates every doc in `docs/code-to-docs-mapping.json` and produces a final summary table.

### Decision rules: edit doc vs edit code

**Edit the doc** (the default — most findings are stale docs):
- Doc describes behavior that no longer matches code
- Doc lists a wrong value, path, or name
- Doc omits something the code does

**Edit the code** (rare):
- The code has a clear bug contradicting documented intended behavior

**Stop and ask the user** when:
- The right answer is genuinely ambiguous
- A fix requires refactoring multiple files or touching a public API
- The finding describes a missing feature needing a design decision

### Success criterion

The skill considers a doc clean when NotebookLM explicitly says: *"the doc and code are aligned"*, *"no inaccuracies found"*, or *"aligned"*. Any other response means findings are present and must be addressed.

### Manual fix loop (without the skill)

1. Run the script → get a list of specific issues.
2. For each issue, update **either the doc or the code** (whichever is wrong).
3. Rerun the script. The script reuploads fresh sources; NotebookLM re-evaluates.
4. Repeat until NotebookLM reports the doc and code are aligned.

## Common pitfalls

- **Reorg artifacts**: NotebookLM may report broken internal links left from the living-docs reorganization. Those aren't drift — fix the link or leave them as a follow-up. Don't rewrite content for them.
- **Fix didn't land**: If the same finding persists across iterations, check that `git status` shows the edit and the commit went through before re-verifying.
- **Source cache**: NotebookLM caches indexing briefly. If re-verification says "I don't see the code sources", wait ~10 seconds and retry.

## Known limitations

- **Upload types**: NotebookLM's file-upload API rejects several code extensions (`.ts`, `.sh`, etc.) with HTTP 400. The script works around this by uploading all code files as `--type text` (inline text).
- **devenv conflict**: The `notebooklm` CLI can't run from inside the MWF repo due to a devenv / nix-store conflict. The script prefixes all `notebooklm` calls with `cd ~ &&` to escape.
- **Source cap**: 25 code files per notebook. If a mapping has more, a warning fires and the first 25 are used. Refine the glob (make it narrower) if you need all of them.
- **Auth expiry**: The Google-auth storage state expires periodically. If the script errors with an auth message, run `cd ~ && notebooklm login` to refresh, then rerun.

## On the bot

The `verify-and-fix-doc` skill is available to the slam-bot. Nightly `audit-docs` runs (via `workspace-dispatcher.sh`) use the incremental docs-audit workspace to detect and fix drift automatically — see [Infrastructure](../infrastructure/index.md) for the schedule.
