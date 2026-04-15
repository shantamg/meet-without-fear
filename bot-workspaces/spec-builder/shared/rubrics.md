# Stage Rubrics

Checklist rubrics that drive adaptive depth in each interview stage. The bot evaluates each item against the current draft and human responses. Items score `met`, `partial`, or `missing`. A stage graduates when all items are `met`.

## Scope Rubric

| Item | Key | Met when |
|---|---|---|
| Problem statement | `problem_statement` | Draft contains a clear, specific problem description — not just "we need X" but why the current state is insufficient |
| Success criteria | `success_criteria` | At least 2 measurable success criteria listed (observable outcomes, not vague goals) |
| Out-of-scope | `out_of_scope` | Explicit boundaries stated — what this feature will NOT do |

## Deepen Rubric

| Item | Key | Met when |
|---|---|---|
| User stories | `user_stories` | At least 2 user stories in "As a [role], I want [action], so that [benefit]" format |
| Acceptance criteria | `acceptance_criteria` | Every user story has >=1 acceptance criterion with observable behavior ("user sees X", "system records Y") |
| Edge cases | `edge_cases` | At least 2 edge cases with explicit expected behavior (error state, fallback, or rejection — not "handle gracefully") |
| Failure mode | `failure_mode` | At least 1 story addresses what happens when the feature fails or degrades |

## Technical Rubric

| Item | Key | Met when |
|---|---|---|
| Technical approach | `technical_approach` | High-level approach described: which services, patterns, data flow |
| Codebase touchpoints | `codebase_touchpoints` | Affected services, files, or modules identified |
| Data model | `data_model` | New or modified data models/schemas described (or explicitly stated "no data model changes") |
| Verification approach | `verification_approach` | How to verify: test strategy, manual QA steps, or metrics to watch |

## Evaluation Rules

- Evaluate against the **rendered draft** (issue body), not raw conversation — anchor to artifacts, not memory
- For ambiguous items, ask a lightweight confirmation question rather than silently marking `met`
- `partial` means the topic was addressed but lacks specificity or completeness
- Questions generated should target `missing` items first, then `partial` items
