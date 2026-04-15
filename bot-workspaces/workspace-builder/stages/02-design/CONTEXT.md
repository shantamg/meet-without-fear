# Stage: Design

## Input

- Discovery document from Stage 01 (purpose, stages, triggers, shared resources)
- `shared/conventions.md` — ICM conventions to enforce

## Process

1. **Design the stage breakdown**:
   - Confirm stage names follow `NN-<name>` pattern (zero-padded numbers)
   - Each stage must be a single, clear responsibility
   - Verify no stage CONTEXT.md will exceed 80 lines
   - If a stage is too complex, split it into sub-stages

2. **Draft the routing tables**:
   - **What to Load** table: for each stage, list which resources to load and why
   - **What NOT to Load** table: explicit exclusions to prevent context bloat
   - Cross-reference with `shared/conventions.md` requirements

3. **Draft stage contracts**: for each stage, define:
   - Input: what it receives
   - Process: numbered steps (concrete, actionable)
   - Output: what it produces (format specified)
   - Completion: next stage or final report

4. **Design the exclusion table**: identify resources that could be mistakenly loaded
   - Other workspaces
   - App source code (unless the workspace modifies code)
   - Docs (unless the workspace audits/updates docs)

5. **Define completion labels**:
   - What `bot:*` label gets removed on completion
   - What completion label gets added (e.g., `ws-complete`, `bot:pr-created`)

6. **Validate against conventions**: check all designs against `shared/conventions.md`

## Output

Design document containing:
- Final stage list with names and descriptions
- CLAUDE.md routing tables (Load + Exclude)
- Stage contracts (Input/Process/Output/Completion for each)
- Label registry entry (workspace path, entry stage, trigger type)
- Root routing table entry (job slug, workspace, entry stage)
- Completion label transitions

## Completion

Proceed to `stages/03-scaffold/` with the design document.
