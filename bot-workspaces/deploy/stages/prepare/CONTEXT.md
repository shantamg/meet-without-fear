# Stage: Prepare Build

## Input

- Platform choice: iOS, Android, or both (ask user)

## Process

1. **Determine platform**: ask user which platform to deploy
2. **Analyze recent changes**:
   - Read `backend/builds.json` for latest build's commit hash
   - `git log <last-commit>..HEAD --oneline` for commits since last build
   - `git diff <last-commit>..HEAD` for actual code changes
3. **Generate changelog** (3-7 entries):
   - Focus on user-facing changes
   - Clear, non-technical language
   - Format: "Fix:", "Add:", "Improve:", "Update:"
4. **Present changelog** for user approval/modification
5. **Create builds.json entry**:
   - Increment appropriate build number (iOS/Android)
   - Current git commit hash via `git rev-parse HEAD`
   - Today's date, platform list, changelog entries
   - `required: false`
   - Preserve JSON formatting (2-space indent + trailing newline)
6. **Verify** the entry with user

## Output

Updated `backend/builds.json` with new build entry.

## Constraints

- Only include changes verifiable from git history
- If uncertain about user impact, ask the user
- Preserve exact builds.json format

## Completion

Single-stage workspace. Complete after builds.json updated and verified.

On completion, no label swap needed (manually triggered).
