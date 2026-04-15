# Stage: Publish

## Input

- `output/issues.md` from Stage 02 — sub-issue details
- `output/dependency-graph.md` from Stage 03 — wave assignments and dependencies
- Parent issue number (the one labeled `bot:milestone-planner`)

## Process

1. **Create sub-issues on GitHub** in wave order:
   - Use `gh issue create --repo shantamg/meet-without-fear` for each sub-issue
   - Include full body with context, requirements, and acceptance criteria
   - Add `<!-- blocked-by: X,Y -->` HTML comment for dependency tracking
   - Record the created issue number for cross-referencing

2. **Label sub-issues** — use the **label-registry key** (the `bot:*` label name), NOT the workspace directory name:
   - **Wave 1 issues**: apply their dispatch label. The default for implementation work is `bot:pr` (NOT `bot:general-pr` — that's the workspace directory, not the label). Only use a different label if the issue explicitly needs a different workspace (e.g., `bot:bug-fix`, `bot:investigate`).
   - **Later-wave issues**: apply `blocked` label (builder will unblock them as dependencies resolve)
   - **Reference**: check `bot/label-registry.json` for valid label names if unsure

3. **Update parent issue body** with the plan task list:
   ```
   ## Plan
   - [ ] #101 — Title (bot:workspace-label)
   - [ ] #102 — Title (bot:workspace-label) ← blocked by #101
   - [ ] #103 — Title (bot:workspace-label) ← blocked by #101
   - [ ] #104 — Title (bot:workspace-label) ← blocked by #102, #103
   ```
   Use `gh issue edit <parent> --body "..."` to append the plan.

4. **Label the parent issue**:
   - Remove `bot:milestone-planner` label
   - Add `bot:milestone-builder` label — the builder will pick up automatically on the next tick
   - Sub-issues should inherit appropriate `bot:*` labels based on their nature (implementation work gets `bot:pr`, investigation gets `bot:research`, etc.)

5. **Post summary comment** on the parent issue. **MUST include the marker** so the builder knows planning is complete:
   ```
   <!-- milestone-plan-ready -->
   ## Milestone Plan Ready
   [number of sub-issues, waves, wave 1 issues, critical path]
   Plan complete — routing to milestone-builder for execution.
   ```

## Output

- Sub-issues created on GitHub with labels and dependency metadata
- Parent issue updated with plan task list
- `bot:milestone-planner` label removed
- `bot:milestone-builder` label added
- `<!-- milestone-plan-ready -->` marker posted

## Completion

Final stage. The dispatcher picks up the parent issue via `bot:milestone-builder` and begins executing the plan wave by wave.
