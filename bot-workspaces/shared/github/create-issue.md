# Create Issue Utility

Create a GitHub issue with duplicate checking, provenance tracking, and cross-referencing.

## Workflow

1. **Gather context** — title (<80 chars), description, evidence, impact, root cause, suggested fix
2. **Check for duplicates** — per `shared/references/github-ops.md` duplicate check pattern
3. **Attach images** — if screenshot files exist, use `shared/github/attach-image.md`
4. **Add provenance** — every issue MUST include:
   ```markdown
   ## Provenance
   - **Channel:** (from [PROVENANCE] block or #channel-name)
   - **Requested by:** (from [PROVENANCE] block or @username)
   - **Original message:** (EXACT value from [PROVENANCE] block)
   - **Prompt(s) used:** brief description of approach
   ```
5. **Create the issue** — `gh issue create` with appropriate label and assignees per `shared/references/github-ops.md`
6. **Cross-reference** — comment on related issues linking back
7. **Notify if critical** — ping @shantamg on the issue

## Output

Return the created issue URL and number.
