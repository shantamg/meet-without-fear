# Stage: Gather

## Input

- GitHub issue labeled `bot:milestone-planner` (from prompt or `gh issue view`)
- Issue body containing one of: brainstorm digest, list of issue numbers, or feature description
- Issue comments (may contain clarifications)

## Process

1. **Read the tagged issue** body and all comments via `gh issue view <N> --repo shantamg/meet-without-fear --comments`

2. **Identify input type**:
   - **Brainstorm digest**: issue body contains a structured brainstorm output (themes, ideas, priorities)
   - **Issue list**: issue body references existing issue numbers to organize into a plan
   - **Feature description**: issue body describes a feature or initiative to plan out

3. **Resolve references**: if the issue references other issues (e.g., `#584`, `#601`):
   - Read each referenced issue with `gh issue view`
   - Note their current state (open/closed), labels, and content

4. **Identify scope**:
   - What needs to be built or changed?
   - What already exists? (check referenced issues, labels, existing PRs)
   - What are the boundaries? (what is explicitly out of scope)
   - What are the constraints? (dependencies on external systems, sequencing requirements)

5. **Write scope document** to `output/scope.md`:
   - Input type and source issue
   - Full list of referenced issues with summaries
   - Scope boundaries (in/out)
   - Known constraints and dependencies
   - Open questions (if any)

## Output

`output/scope.md` — structured scope document with all gathered context.

## Completion

Proceed to `stages/02-decompose/` with the scope document.
