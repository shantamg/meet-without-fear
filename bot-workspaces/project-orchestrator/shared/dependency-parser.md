# Dependency Parser

How to parse dependency metadata from GitHub issues.

## Supported Formats

### 1. Machine-readable comment (preferred)

HTML comment on the issue (in body or comments):

```
<!-- blocked-by: 585,594 -->
```

**Parse rule:** Extract comma-separated issue numbers after `blocked-by:`. Strip whitespace.

```bash
# Comments are not in the state file — this is an allowed escape hatch:
gh api repos/shantamg/meet-without-fear/issues/{N}/comments --jq '.[].body' | grep -oP '(?<=blocked-by:\s?)[\d,\s]+'
```

Also check the issue body itself:
```bash
# Body is not in the state file — this is an allowed escape hatch:
gh issue view {N} --repo shantamg/meet-without-fear --json body --jq '.body' | grep -oP '(?<=blocked-by:\s?)[\d,\s]+'
```

### 2. Inline body references

Look for these patterns in the issue body:

| Pattern | Example |
|---|---|
| `Depends on: #N` | `Depends on: #588` |
| `Blocked by: #N, #M` | `Blocked by: #585, #594` |
| `**Depends on:** #N` | `**Depends on:** #588 (description)` |
| `Depends on: #N (description)` | `Depends on: #588 (run-claude.sh workspace support)` |

**Parse rule:** Extract `#N` references following `Depends on:` or `Blocked by:` (case-insensitive). Strip parenthetical descriptions.

```bash
# Body is not in the state file — this is an allowed escape hatch:
gh issue view {N} --repo shantamg/meet-without-fear --json body --jq '.body' | grep -iP '(depends on|blocked by):' | grep -oP '#\d+' | tr -d '#'
```

### 3. Sub-issue list references

Parent issues often list sub-issues with dependency annotations:

```
- [ ] #585 — Workspace folder structure
- [ ] #588 — run-claude.sh workspace support (depends on #585)
- [ ] #596 — Label-driven dispatcher (depends on #588)
```

**Parse rule:** For each `#N` in the list, check if the line contains `(depends on #M)` or `(blocked by #M)`. Extract both the issue number and its dependency.

## Priority Order

1. Machine-readable `<!-- blocked-by: -->` comment (most reliable)
2. Inline `Depends on:` / `Blocked by:` in issue body
3. Sub-issue list annotations in parent issue

If multiple sources exist, merge them (union of all dependencies).

## Dependency Verification

After parsing, verify each dependency issue exists using the global state file:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1

# Check state from state file — do NOT use gh issue view
STATE=$(github_state_issue_field "$DEP" state)
```

If a dependency issue does not exist in the state file or is not found, log a warning and treat it as satisfied (do not block on phantom dependencies).

**Note:** `gh issue view` for dependency state is a **strict violation** of the bot's GitHub API budget policy (#1649) — this data is already in the state file.

## Output Format

```json
{
  "588": [],
  "596": [588],
  "601": [588, 596]
}
```

Keys are issue numbers. Values are arrays of dependency issue numbers.
