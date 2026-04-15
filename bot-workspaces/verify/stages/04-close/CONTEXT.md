# Stage 04: Close

## Input

- Issue number (from Stage 01)
- PR number (from Stage 01)
- Overall result: `PASS`, `NEEDS_MANUAL_REVIEW`, or `FAIL` (from Stage 03)

## Process

### Route by result

#### PASS

Verification succeeded. Route to human review for final approval.

1. Add `bot:needs-human-review` label:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --add-label "bot:needs-human-review"
   ```

2. Remove `bot:verify` label:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --remove-label "bot:verify"
   ```

#### NEEDS_MANUAL_REVIEW

Automated checks passed but manual testing is required.

1. Add `bot:needs-human-review` label:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --add-label "bot:needs-human-review"
   ```

2. Remove `bot:verify` label:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --remove-label "bot:verify"
   ```

The verification report (Stage 03) already contains the manual testing checklist for the reviewer.

#### FAIL

Automated checks failed. Route back to implementation for fixes.

1. Post a comment with fix instructions:
   ```bash
   gh issue comment <issue-number> --repo shantamg/meet-without-fear --body "$(cat <<'EOF'
   ## Fix Required

   Automated verification failed. See the verification report above for details.

   **Action needed:** Fix the failures listed above and push to the PR branch. Once fixed, re-apply `bot:verify` to re-run verification.

   **Failures to address:**
   - <list specific failures from the report>
   EOF
   )"
   ```

2. Add `bot:pr` label to trigger fix implementation:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --add-label "bot:pr"
   ```

3. Remove `bot:verify` label:
   ```bash
   gh issue edit <issue-number> --repo shantamg/meet-without-fear --remove-label "bot:verify"
   ```

## Output

| Result | Labels added | Labels removed | Next action |
|---|---|---|---|
| `PASS` | `bot:needs-human-review` | `bot:verify` | Human reviews and merges |
| `NEEDS_MANUAL_REVIEW` | `bot:needs-human-review` | `bot:verify` | Human reviews manual items and merges |
| `FAIL` | `bot:pr` | `bot:verify` | Bot fixes failures, then re-verifies |

## Exit Criteria

- Labels updated per the routing table above
- Fix instructions posted (FAIL case only)
- `bot:verify` label removed

## Completion

This is the final stage. The workspace run is complete.
