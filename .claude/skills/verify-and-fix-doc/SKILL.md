---
name: verify-and-fix-doc
description: Run NotebookLM alignment verification on a living doc, apply fixes to resolve each finding (doc edits or code edits as appropriate), commit, and re-verify until clean. Use when asked to "verify a doc", "fix drift in X.md", "align docs with code", or "run doc verification" for any doc under `docs/` that has a mapping in `docs/code-to-docs-mapping.json`.
---

# verify-and-fix-doc

## When to use

- User asks to verify a living doc against code
- User asks to fix drift in a doc
- User asks to run the doc-verification loop
- User references `scripts/verify-docs.sh` or `docs/processes/docs-verification.md`

Accept a single doc path (e.g. `docs/architecture/backend-overview.md`) or `--all` to iterate over every doc listed in `docs/code-to-docs-mapping.json`.

## Prerequisites (verify once at start)

- `scripts/verify-docs.sh` exists and is executable
- `docs/code-to-docs-mapping.json` lists the target doc
- `notebooklm` CLI is authenticated: `cd ~ && notebooklm status` should return a context. If not, tell the user to run `cd ~ && notebooklm login` and stop.

## Workflow (per doc)

**Goal**: reach a state where NotebookLM's answer explicitly says the doc and code are aligned (no findings), or declare the cap reached with remaining findings surfaced.

### Iteration cap

Max 5 iterations per doc. If still findings after 5, stop and report — likely indicates a real disagreement that needs human judgment.

### Single iteration

1. **Run verification**
   ```bash
   bash scripts/verify-docs.sh <doc>
   ```
   Capture the full output. The answer section starts after `=== NotebookLM findings ===`.

2. **Classify the answer**
   - If the answer contains phrases like "the doc and code are aligned", "no inaccuracies found", "aligned" → **done**, report success for this doc.
   - Otherwise, findings are present. Parse them.

3. **Parse findings**
   Each finding typically has a structured shape:
   - **Doc Claim** / **Code Reality** → clear drift
   - **Omission** → doc misses something in code
   - **Value mismatch** → specific path / number / name differs

   Extract each finding into `{claim, evidence_doc, evidence_code, type}`.

4. **Decide per finding: edit doc or edit code**

   Default **edit the doc** in these cases (majority):
   - Doc describes behavior that no longer matches code (doc is stale)
   - Doc lists a value/name/path that differs from code
   - Doc omits something the code does — add the missing detail to the doc
   - Doc describes an interface that was renamed / refactored

   Edit **the code** only if:
   - The code has a bug that clearly contradicts clearly-correct intended behavior documented elsewhere
   - Rare. Default to doc edits unless the evidence strongly points to a code bug.

   **Ask the user** and stop the skill if:
   - The right answer is genuinely ambiguous (e.g., doc says X, code does Y, no obvious "correct" version)
   - A fix would require refactoring multiple files or touching public API
   - The finding describes a missing feature that needs a design decision

5. **Apply fixes**

   For doc edits: use `Read` on the doc, then `Edit` with the old_string pulled directly from NotebookLM's quoted excerpt. Keep fixes targeted — don't rewrite wholesale paragraphs; patch the specific sentence or list item that was wrong.

   For code edits: same pattern but on the code file.

6. **Commit**

   ```bash
   git add <changed files>
   git commit -m "docs: fix drift in <doc-path> (N findings resolved: <one-line summary>)"
   ```

   One commit per iteration, not per finding. Makes history readable.

7. **Re-verify**

   Go back to step 1. Exit on the clean answer or cap.

### Reporting

At the end of a single-doc run, write a short summary to the user:

- Doc verified: `docs/X.md`
- Iterations: N
- Total findings resolved: M
- Fixes applied: [list of specific changes]
- Remaining findings (if cap reached): [list]

### `--all` mode

When invoked with `--all`:

1. Get the unique list of docs from the mapping: `bash scripts/verify-docs.sh --list`.
2. For each doc in the list, run the single-doc workflow above.
3. After each doc completes (clean or cap hit), continue to the next — do NOT stop on cap failures.
4. Produce a final summary table: doc | iterations | findings resolved | remaining findings.

## Decision heuristics

- **Trust NotebookLM's evidence**. It quotes sources verbatim — treat quoted text as ground truth.
- **Prefer narrower edits**. Don't rewrite a section when one line is wrong.
- **When NotebookLM says "the doc is correct" about something, leave it alone**, even if you suspect otherwise. The whole point is to use NotebookLM as the arbiter.
- **Re-verification often surfaces new findings** the first pass missed. That's expected. The cap prevents runaway loops.

## Common pitfalls

- NotebookLM may return findings about the *reorg itself* (broken internal links, etc.) — those aren't drift, they're move artifacts. Don't rewrite content for those; fix the link or leave them as followup.
- If the same finding persists across iterations, your fix didn't land — check that `git status` shows the edit and that the commit went through before re-verifying.
- NotebookLM caches indexing briefly. If re-verification returns "I don't see the code sources", wait ~10 seconds and retry.

## Exit conditions

Stop the skill and return to the user when any of:

- All requested docs are clean ✓
- Iteration cap hit on a doc (report remaining, proceed to next doc in `--all`)
- A finding requires user input (per decision rules above)
- An error occurs that isn't self-resolvable (auth expired, API outage, etc.)
