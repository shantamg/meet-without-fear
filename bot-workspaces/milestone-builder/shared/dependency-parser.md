# Dependency Parser

How to parse dependency metadata from GitHub issues.

## Supported Formats

### 1. Machine-readable comment (preferred)

HTML comment on the issue body or comments:

```
<!-- blocked-by: 585,594 -->
```

**Parse rule:** Extract comma-separated issue numbers after `blocked-by:`.

```bash
gh issue view {N} --repo shantamg/meet-without-fear --json body --jq '.body' \
  | grep -oP '(?<=blocked-by:\s?)[\d,\s]+'
```

### 2. Inline body references

| Pattern | Example |
|---|---|
| `Depends on: #N` | `Depends on: #588` |
| `Blocked by: #N, #M` | `Blocked by: #585, #594` |

**Parse rule:** Extract `#N` references following `Depends on:` or `Blocked by:` (case-insensitive).

### 3. Sub-issue list annotations

```
- [ ] #585 — Workspace folder structure
- [ ] #588 — run-claude.sh support (depends on #585)
```

**Parse rule:** For each `#N`, check if the line contains `(depends on #M)` or `(blocked by #M)`.

## Priority Order

1. Machine-readable `<!-- blocked-by: -->` (most reliable)
2. Inline `Depends on:` / `Blocked by:` in issue body
3. Sub-issue list annotations in parent issue

If multiple sources exist, merge them (union of all dependencies).

## Verification

After parsing, verify each dependency issue exists:
```bash
gh issue view {DEP} --repo shantamg/meet-without-fear --json state --jq '.state'
```

If a dependency does not exist, log a warning and treat as satisfied.

## Output Format

```json
{
  "588": [],
  "596": [588],
  "601": [588, 596]
}
```

Keys are issue numbers. Values are arrays of dependency issue numbers.
