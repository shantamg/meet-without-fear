# Stage: Review Implementation Against Plan

## Input

- PR number with `bot:review-impl` label
- `references/review-checklist.md` — quality criteria (supplementary)

## Process

### 1. Claim the PR

```bash
gh pr edit {N} --repo shantamg/meet-without-fear --add-label "bot:in-progress"
```

If the PR already has `bot:in-progress`, another agent is working on it — **skip this PR**.

### 2. Read the PR and linked issue

```bash
gh pr view {N} --repo shantamg/meet-without-fear --json body,title,headRefName,files
gh pr diff {N} --repo shantamg/meet-without-fear
```

Extract the linked issue number from the PR body (`Fixes #X` or `Closes #X` or `Related to #X`).

```bash
gh issue view {X} --repo shantamg/meet-without-fear --json body,comments
```

### 3. Gather upstream context from the issue

Read the issue comments to find upstream pipeline artifacts:

| Artifact | Pattern to search for | Source |
|---|---|---|
| Research findings | Comment with `## Research Report` heading | `research/` workspace |
| Spec | Issue body with spec sections, or comment with `## Spec` heading | `spec-builder/` workspace |
| Milestone plan | Comment with `<!-- milestone-plan-ready -->` marker | `milestone-planner/` workspace |
| Acceptance criteria | Issue body under `## Acceptance Criteria` or similar heading | Any upstream workspace |

### 4. Plan-alignment review

Compare the PR diff against the upstream requirements:

1. **Requirements coverage**: Does the implementation address all requirements from the issue/spec?
   - Check each acceptance criterion or user story
   - Verify all specified endpoints, schema changes, or UI components are present
2. **Scope adherence**: Does the implementation stay within scope?
   - No unrelated changes beyond what the issue describes
   - No missing pieces that the spec called for
3. **Approach alignment**: Does the implementation follow the recommended approach?
   - If research suggested a specific approach, verify it was followed
   - If the spec defined a technical approach, verify alignment
4. **Constraint compliance**: Were identified constraints respected?
   - Breaking change warnings from research
   - Performance concerns flagged in spec
   - Security requirements

### 5. Post review comment

**Aligned**: The implementation matches the plan.
```
Plan-alignment review: ALIGNED

Implementation matches requirements from #X:
- [x] Requirement 1 — implemented in <file>
- [x] Requirement 2 — implemented in <file>

No scope deviations detected. Ready for verification.
```

**Misaligned**: The implementation deviates from the plan.
```
Plan-alignment review: CHANGES NEEDED

Deviations from requirements (#X):
- [ ] Requirement N — not implemented / partially implemented
- [ ] Scope deviation — <description of unrelated changes>
- [ ] Approach deviation — <description of how implementation differs from spec>

Please address these items and push to the PR branch.
```

### 6. Apply labels based on review outcome

- **Always** remove `bot:in-progress` (review is done)
- **Always** remove `bot:review-impl` (trigger consumed)
- **Aligned**: add `bot:verify` to trigger automated verification
- **Misaligned**: add `bot:review-changes-needed` to trigger the fix cycle (Stage 04 of pr-reviewer)

## Output

- Plan-alignment review comment posted on PR
- Labels updated per review outcome
- `bot:review-impl` label consumed

## Completion

- **Aligned PRs** route to the `verify/` workspace via `bot:verify`.
- **Misaligned PRs** route to Stage 04 (fix cycle) via `bot:review-changes-needed`.
