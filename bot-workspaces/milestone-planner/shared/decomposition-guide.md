# Decomposition Guide

Rules for breaking milestone scope into right-sized sub-issues.

## Right Size Criteria

A well-sized sub-issue:
- **One PR**: the work results in a single pull request
- **One workspace**: can be handled by a single `bot:*` workspace (bug-fix, workspace-builder, etc.)
- **One agent session**: completable in a single agent invocation (no multi-day work)
- **Clear success criteria**: "done" is unambiguous
- **Independent**: can be built and merged without waiting for uncommitted work from a sibling issue

## Too Small

Signs an issue is too granular:
- "Add a single field to a type" — combine with the feature that uses it
- "Write tests for X" — tests should be part of the implementation issue
- "Update imports" — part of the refactor, not a standalone issue

## Too Large

Signs an issue needs further decomposition:
- Touches more than 3 files in different areas of the codebase
- Requires both backend and frontend changes (split into API + UI issues)
- Has multiple independent deliverables bundled together
- Would produce a PR with 500+ lines of diff
- Contains "and" in the title connecting unrelated work

## Workspace Label Assignment

Match each sub-issue to the workspace that will execute it:

| Work Type | Label |
|---|---|
| Fix a bug or implement a code change | `bot:bug-fix` |
| Build a new workspace | `bot:workspace-builder` |
| Create/update documentation | `bot:docs-audit` |
| Infrastructure/deployment change | `bot:deploy` |
| Needs human review/decision | *(no bot label — assign to human)* |

## Writing Good Sub-Issue Bodies

Each sub-issue body should include:
1. **Context**: why this work is needed (link to parent milestone)
2. **Requirements**: what specifically needs to be built/changed
3. **Acceptance criteria**: bullet list of what must be true when done
4. **References**: links to relevant code, docs, or related issues
