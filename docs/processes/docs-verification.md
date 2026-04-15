---
title: Living-doc verification with NotebookLM
sidebar_position: 2
description: How to check whether a living doc still matches the code it describes, using the notebooklm CLI.
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

## Fix loop

The intended workflow:

1. Run the script → get a list of specific issues.
2. For each issue, update **either the doc or the code** (whichever is wrong).
3. Rerun the script. The script reuploads fresh sources; NotebookLM re-evaluates.
4. Repeat until NotebookLM reports "the doc and code are aligned".

## Known limitations

- **Upload types**: NotebookLM's file-upload API rejects several code extensions (`.ts`, `.sh`, etc.) with HTTP 400. The script works around this by uploading all code files as `--type text` (inline text).
- **devenv conflict**: The `notebooklm` CLI can't run from inside the MWF repo due to a devenv / nix-store conflict. The script prefixes all `notebooklm` calls with `cd ~ &&` to escape.
- **Source cap**: 25 code files per notebook. If a mapping has more, a warning fires and the first 25 are used. Refine the glob (make it narrower) if you need all of them.
- **Auth expiry**: The Google-auth storage state expires periodically. If the script errors with an auth message, run `cd ~ && notebooklm login` to refresh, then rerun.

## On the bot

Phase 10 of the living-docs reorg plan wires this into the slam-bot so it runs on a schedule and opens issues for drift. That's deferred — operator-driven local runs are the starting point.
