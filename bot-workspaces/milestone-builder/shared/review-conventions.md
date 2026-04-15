# Review Conventions

Quality check criteria for PRs targeting a milestone branch.

## Quality Check Criteria

The bar: "does this do what the issue says, without breaking anything?"

### 1. Correctness

- Does the code implement what the linked issue describes?
- Are all deliverables from the issue present?
- Do file paths, names, and structure match what was specified?

### 2. Completeness

- All files mentioned in the issue are created/modified
- No placeholder content or TODO comments left behind
- Tests exist if the issue mentions testing

### 3. Integration

- Changes are compatible with previously merged PRs on the milestone branch
- No conflicting file modifications
- Imports and references resolve correctly

### 4. No Regressions

- Existing files not accidentally modified
- Shared resources not broken
- No files deleted that other components depend on

## Decision Flow

```
PR opened on milestone branch
  → Read diff + linked issue
  → All checks pass?
    → YES: Comment summary, squash merge
    → NO:  Comment with specific feedback
      → Fix pushed, re-review next tick
      → Still failing after 3 cycles? Flag for human
```

## Comment Format

### Approval (before merge)

```
Quality check passed:
- Correctness: [what was verified]
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

## After Merge

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
