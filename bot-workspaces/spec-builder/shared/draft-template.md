# Spec Draft Template

The running spec draft uses this structure. Empty sections show "*(pending — covered in [Stage Name])*". The issue body is regenerated from the latest draft-snapshot comment.

## Template

```markdown
## Spec: [Title]

### Problem
[Filled after Scope — what problem does this solve and why is the current state insufficient]

### Success Criteria
[Filled after Scope — measurable outcomes that define "done"]

### Out of Scope
[Filled after Scope — explicit boundaries of what this will NOT do]

### User Stories
[Filled after Deepen — "As a [role], I want [action], so that [benefit]" with acceptance criteria]

### Edge Cases
[Filled after Deepen — scenarios with explicit expected behavior]

### Technical Approach
[Filled after Technical — services, patterns, data flow]

### Codebase Touchpoints
[Filled after Technical — affected services, files, modules]

### Data Model
[Filled after Technical — new/modified schemas, or "no changes"]

### Verification
[Filled after Technical — test strategy, QA steps, metrics]

### Open Questions
[Persists until Publish — unresolved items flagged during interview]
```

## Draft Snapshot Comments

Every 2-3 question rounds, post a draft snapshot comment containing:
1. The full rendered draft (using the template above)
2. A one-line diff summary: "v3: Added user stories for caregiver flow. Edge cases still pending."
3. The meta tag at the bottom

## Issue Body Updates

- Regenerate the issue body from the latest draft-snapshot comment
- Gate updates on `draft_hash` — only write if content actually changed
- `draft_hash` = first 8 chars of SHA-256 of the draft body text

## Summary Template

Posted as a separate comment during the Publish stage (05). Downstream consumers (milestone-planner, milestone-builder) parse this instead of the full spec.

```markdown
<!-- spec-summary -->
## Spec Summary

### Issues by priority
1. #NNN — Short description (key technical detail)
2. #NNN — Short description (key technical detail)

### Per-issue briefs

#### #NNN
- **User story**: "As a [role], I want [action], so that [benefit]"
- **Acceptance**: [Key acceptance criteria, comma-separated]
- **Files**: [service/file.ts, mobile/components/path/]

#### #NNN
- **User story**: "As a [role], I want [action], so that [benefit]"
- **Acceptance**: [Key acceptance criteria, comma-separated]
- **Files**: [service/file.ts, mobile/components/path/]
```

Each issue referenced in the spec gets its own `#### #N` section with exactly three fields: user story, acceptance, and files. Keep descriptions terse — this is a machine-readable index, not prose.
