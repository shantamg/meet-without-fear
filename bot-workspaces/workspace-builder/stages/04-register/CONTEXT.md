# Stage: Register

## Input

- Scaffolded workspace from Stage 03
- Label registry entry from design (workspace path, entry stage, trigger)
- Root routing table entry from design (job slug, workspace, entry stage)

## Process

1. **Add to label registry** (`bot-workspaces/label-registry.json`):
   ```json
   "bot:<workspace-name>": {
     "workspace": "<workspace-name>/",
     "entry_stage": "<entry-stage>",
     "trigger": "<label|cron|webhook|manual>"
   }
   ```
   Insert alphabetically by label name.

2. **Update root routing table** (`bot-workspaces/CLAUDE.md`):
   Add a row to the routing table:
   ```markdown
   | `<job-slug>` | `<workspace>/` | `<entry-stage>` |
   ```
   Insert in logical position (alphabetical or grouped by trigger type).

3. **Create GitHub label** via `gh`:
   ```bash
   gh label create "bot:<workspace-name>" \
     --repo shantamg/meet-without-fear \
     --description "<one-line workspace description>" \
     --color "0E8A16"
   ```
   Color `0E8A16` (green) is standard for `bot:*` labels.

4. **Update existing-workspaces reference**:
   Add a row to `references/existing-workspaces.md` workspace inventory table.

5. **For "modify existing" mode**: skip label creation, only update registry/routing if entry stage changed.

## Output

- Updated `label-registry.json`
- Updated root `CLAUDE.md` routing table
- GitHub label created (or confirmed existing)
- Updated `references/existing-workspaces.md`

## Completion

Proceed to `stages/05-validate/` for routing verification.
