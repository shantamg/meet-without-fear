# Dispatch: QUESTION

**Goal:** Find the answer and reply. Escalate to a GitHub issue if deeper investigation is needed.

## Steps

1. **Search docs first:**
   - Check `docs/` for relevant documentation
   - Use the docs routing table in `CLAUDE.md` to find the right doc
   - Search codebase if docs don't cover it

2. **Reply in thread** with the answer. Keep it non-technical and accessible.
   - If the answer is in a doc, summarize it -- do not link to internal docs (users cannot access them)
   - If you cannot find the answer, say so honestly and suggest who might know

3. **Escalate to REQUEST** if answering the question would require substantive investigation, code changes, or work beyond a doc lookup. In that case, follow `dispatch-request.md` instead — create a GitHub issue with the appropriate `bot:*` label and reply with the issue link.

4. **Do NOT create issues** for simple questions that can be answered from docs or quick code search.
