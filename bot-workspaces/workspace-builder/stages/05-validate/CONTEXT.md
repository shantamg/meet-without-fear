# Stage: Validate

## Input

- Registered workspace from Stage 04
- `shared/conventions.md` — convention checklist
- `label-registry.json` — verify entry exists
- Root `CLAUDE.md` — verify routing entry exists

## Process

### Single Workspace Validation (after create/modify)

1. **Convention compliance check**:
   - [ ] Workspace has CLAUDE.md with Load + Exclude tables
   - [ ] Workspace has CONTEXT.md with Purpose, Stage Pointers, Shared Resources
   - [ ] Every stage has CONTEXT.md with Input/Process/Output/Completion
   - [ ] All stage CONTEXT.md files are under 80 lines
   - [ ] All reference files are under 200 lines
   - [ ] Workspace name is lowercase, hyphenated

2. **Registration check**:
   - [ ] Label exists in `label-registry.json`
   - [ ] Entry stage in registry matches first stage directory name
   - [ ] Row exists in root `CLAUDE.md` routing table
   - [ ] GitHub label `bot:<name>` exists (verify via `gh label list`)

3. **Routing dry-run**:
   - Simulate: given label `bot:<name>`, does the dispatcher find the workspace?
   - Check: does the entry stage CONTEXT.md exist at the resolved path?
   - Verify: are all shared resources referenced in Load table accessible?

### Full Audit Mode (all workspaces)

1. Scan all directories in `bot-workspaces/` (excluding `shared/`, `_active/`)
2. For each workspace, run the convention compliance check above
3. Cross-reference `label-registry.json`:
   - Every registry entry has a corresponding workspace directory
   - Every workspace directory has a corresponding registry entry
4. Cross-reference root `CLAUDE.md` routing table:
   - Every routing entry points to an existing workspace
   - Every workspace has a routing entry
5. Report findings as a checklist with pass/fail per workspace

## Output

Validation report containing:
- Convention compliance: pass/fail per check
- Registration: pass/fail per check
- Routing: pass/fail
- Any issues found with remediation suggestions

## Completion

This is the final stage.

**For create/modify**: report workspace name, label, and validation results.
On success, swap label: remove `bot:workspace-builder`, add `ws-built`.

**For audit mode**: report full compliance matrix across all workspaces.
No label changes.
