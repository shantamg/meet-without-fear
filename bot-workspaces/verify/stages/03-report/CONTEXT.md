# Stage 03: Report

## Input

- Issue number (from Stage 01)
- PR number (from Stage 01)
- Verification results (from Stage 02)
- Manual review items (from Stage 01)

## Process

### 1. Determine overall result

| Condition | Result |
|---|---|
| All automated checks PASS and no manual items | `PASS` |
| All automated checks PASS but manual items exist | `NEEDS_MANUAL_REVIEW` |
| Any automated check FAIL | `FAIL` |

### 2. Build the report

Construct a markdown comment using this template:

```markdown
## Verification Report

**PR:** #<pr-number>
**Result:** PASS / NEEDS_MANUAL_REVIEW / FAIL

### Automated Checks
- [x/  ] Tests pass (N tests, N suites)
- [x/  ] Types check clean
- [x/  ] Build succeeds
- [x/  ] No new Sentry errors (or SKIPPED)

### Failures
<!-- Only include this section if there are failures -->
<details>
<summary>Test failures</summary>

```
<failure output>
```

</details>

### Manual Testing Required
<!-- Only include this section if there are manual items -->
- [ ] <specific thing that needs human eyes>
- [ ] <another manual check>

### Summary
<1-2 sentence summary of what was verified and what needs attention>

---
*Automated verification by bot:verify workspace*
```

### 3. Post the report

```bash
gh issue comment <issue-number> --repo shantamg/meet-without-fear --body "<report>"
```

Use a HEREDOC for the body to preserve formatting:

```bash
gh issue comment <issue-number> --repo shantamg/meet-without-fear --body "$(cat <<'EOF'
<full report markdown>
EOF
)"
```

## Output

- Verification report posted as a comment on the issue
- Overall result determined: `PASS`, `NEEDS_MANUAL_REVIEW`, or `FAIL`

## Exit Criteria

- Report comment posted successfully on the issue
- Result value determined for Stage 04

## Completion

Proceed to `stages/04-close/` with the result value.
