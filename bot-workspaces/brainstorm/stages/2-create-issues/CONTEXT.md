# Stage: Create Issues

## Input

- Structured digest from Stage 1

## Process

1. **Create parent issue** (sub-agent via `shared/github/create-issue.md`):
   - Title: `Brainstorm: <topic>`
   - Label: `brainstorm`
   - Body: date, participants, key themes with details, decisions table, open questions
   - Wait for completion — capture parent issue number
2. **Plan sub-issues**: review "Decisions & Next Steps" table. Only create sub-issues for items requiring future work (skip pure decisions/observations).
   - Title: clear, actionable (expanded from table text)
   - Labels: `enhancement`, `bug`, `design`, `research` as appropriate
   - Body: context from relevant Key Theme + `Parent brainstorm: #<parent>`
3. **Classify each sub-issue** before creation. For each sub-issue, evaluate its complexity and clarity to determine the downstream pipeline label:

   | Classification | Criteria | Label Applied |
   |---|---|---|
   | Needs investigation | Unclear approach, multiple possible solutions, needs codebase/external research | `bot:research` |
   | Well-defined, needs spec | Clear goal but complex enough to need detailed specification (>2 tasks, cross-cutting) | `bot:spec-builder` |
   | Simple, ready to build | Single-file or small change, clear implementation path, <2 tasks | `bot:pr` |
   | Bug report | Describes broken behavior with reproduction steps | `bot:bug-fix` |

   Default to `bot:research` when uncertain — it's safer to research first than to start building with incomplete understanding.

4. **Create sub-issues** (parallel sub-agents, one per issue):
   - Apply the classified `bot:*` label along with any descriptive labels (`enhancement`, `bug`, etc.)
   - Include a `<!-- pipeline-source: brainstorm -->` HTML comment in the issue body so downstream workspaces know the origin

5. **Update parent issue**: replace decisions table with task list linking sub-issues:
   ```
   - [ ] #<sub-issue-1> — short description (bot:research)
   - [ ] #<sub-issue-2> — short description (bot:pr)
   ```

## Output

- Parent issue URL
- All sub-issue URLs with their classified pipeline labels
- Brief summary of themes captured

## Completion

Final stage. Workspace run complete after all issues created and labeled for pipeline dispatch.

On completion, swap label: remove `bot:brainstorm`, add `brainstorm-complete`.
