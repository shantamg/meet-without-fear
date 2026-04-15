# Review Conventions

What to check when quality-reviewing PRs on a milestone branch.

## Quality Check Criteria

Milestone branch PRs get a quality check (not a formal review). The bar is: "does this do what the issue says, without breaking anything?"

### 1. Correctness

- Does the code implement what the linked issue describes?
- Are all deliverables from the issue present?
- Do file paths, names, and structure match what was specified?

### 2. ICM Conventions (for workspace PRs)

- Routing tables present and correctly formatted (L0, L1)
- Exclusion tables present ("What NOT to Load")
- Stage contracts have all 4 sections: Input, Process, Output, Completion
- CONTEXT.md files reference correct shared resources
- No hardcoded paths that should be relative

### 3. Completeness

- All files mentioned in the issue are created/modified
- No placeholder content or TODO comments left behind
- Tests exist if the issue mentions testing
- Documentation updated if behavior changes

### 4. Integration

- Changes are compatible with previously merged PRs on the milestone branch
- No conflicting file modifications
- Imports and references resolve correctly
- Label registry and routing tables updated if a new workspace is added

### 5. No Regressions

- Existing workspace files not accidentally modified
- Shared resources not broken
- No files deleted that other workspaces depend on

## Decision Flow

```
PR opened on milestone branch
  |
  v
Read diff + linked issue
  |
  v
All 5 checks pass?
  |--- YES --> Comment summary, merge (squash)
  |--- NO  --> Comment with specific, actionable feedback
                |
                v
              Spawn fix agent (isolation: "worktree")
                |
                v
              Fix pushed, re-review on next tick
                |
                v
              Still failing after 3 cycles?
                |--- YES --> Flag for human attention
                |--- NO  --> Merge
```

## Comment Format

### Approval (before merge)

```
Quality check passed:
- Correctness: [what was verified]
- Conventions: [compliance notes]
- Completeness: [all deliverables present]

Merging to milestone branch.
```

### Changes Requested

```
Quality check — changes needed:

1. [Specific issue with file/line reference]
2. [Specific issue with file/line reference]

Please address and push. Will re-check on next tick.
```

## Merge Strategy

- Always **squash merge** to milestone branch
- Post a verification comment on the linked issue (do NOT close it):
  ```bash
  gh issue comment {N} --repo shantamg/meet-without-fear --body "$(cat <<'EOF'
  ## Fix merged

  **PR**: #{PR_NUMBER}
  **What changed**: <summary>
  **How to verify**: <steps or what to look for>

  This issue will stay open until a human verifies the fix and adds the \`user-verified\` label.
  EOF
  )"
  ```
- Comment on downstream issues that depended on the merged issue
