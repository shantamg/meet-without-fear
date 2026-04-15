# Stage: Scaffold

## Input

- Design document from Stage 02 (stage list, routing tables, contracts)
- `shared/templates/` — blank file templates
- `shared/conventions.md` — for validation

## Process

1. **Create directory structure**:
   ```
   bot-workspaces/<workspace-name>/
     CLAUDE.md
     CONTEXT.md
     stages/
       <stage-1>/
         CONTEXT.md
       <stage-2>/
         CONTEXT.md
       ...
   ```

2. **Write workspace CLAUDE.md** using `shared/templates/CLAUDE.md.template`:
   - Fill in title, description, Load table, Exclude table, stage progression
   - Add orchestrator rules if applicable (concurrency, isolation, etc.)

3. **Write workspace CONTEXT.md** using `shared/templates/CONTEXT.md.template`:
   - Fill in purpose, stage pointers, shared resources, conventions

4. **Write each stage CONTEXT.md** using `shared/templates/stage-context.md.template`:
   - Fill in Input, Process, Output, Completion sections from design
   - Verify each file is under 80 lines

5. **For "modify existing" mode**: edit existing files rather than overwriting
   - Add new stages to the stages/ directory
   - Update CLAUDE.md routing tables
   - Update CONTEXT.md stage pointers

6. **Validate all files**:
   - Every CLAUDE.md has Load + Exclude tables
   - Every stage CONTEXT.md has Input/Process/Output/Completion
   - No file exceeds line limits (80 for stages, 200 for references)
   - Naming follows conventions (lowercase, hyphenated)

## Output

- Complete workspace directory with all files written to `bot-workspaces/`
- List of files created/modified

## Completion

Proceed to `stages/04-register/` with the list of created files.
