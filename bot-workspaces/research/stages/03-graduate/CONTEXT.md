# Stage 03: Graduate

## Input

- GitHub issue with `bot:research` label
- Research report comment posted in Stage 02
- Meta tag with `complexity` and `recommendation` fields

## Process

### 1. Read the meta tag

Extract the `complexity` and `recommendation` from the latest meta tag.

### 2. Determine the downstream label

| Complexity | Recommendation | Downstream Label |
|---|---|---|
| Simple | `pr` | `bot:pr` -- straightforward enough to implement directly |
| Moderate | `spec-builder` | `bot:spec-builder` -- needs a spec before building |
| Complex | `spec-builder` | `bot:spec-builder` -- definitely needs a spec |
| Any | `needs-decision` | No `bot:*` label -- leave for human triage |

Override rules:
- If the research found **unresolved open questions** that require human input, always use `needs-decision` regardless of complexity.
- If the issue body explicitly requests a specific downstream workspace (e.g., "this should go to spec-builder"), honor that request.

### 3. Swap labels

```bash
# Remove the research label
gh issue edit <number> --remove-label "bot:research"

# Add downstream label (if applicable)
gh issue edit <number> --add-label "bot:<downstream>"
```

If `needs-decision`, only remove `bot:research` -- do not add a new `bot:*` label.

### 4. Post graduation comment

Post a brief comment explaining the handoff:

For `bot:spec-builder`:
```
Research complete. This is a [moderate/complex] change -- routing to spec-builder for detailed specification before implementation.
```

For `bot:pr`:
```
Research complete. This is a simple change with a clear implementation path -- routing directly to implementation.
```

For no label (needs decision):
```
Research complete. There are open questions that need human input before this can proceed -- see the research report above. Add `bot:spec-builder` or `bot:pr` when ready.
```

### 5. Update meta tag

```
<!-- bot:research-meta: {"stage": "graduate", "graduated_to": "<bot:spec-builder|bot:pr|none>", "completed_at": "<ISO timestamp>"} -->
```

## Output

- `bot:research` label removed
- Downstream label added (or none, if needs human decision)
- Graduation comment posted
- Final meta tag with completion record

## Completion

Final stage. The dispatcher picks up the issue via the new `bot:*` label, or a human reviews and decides the next step.
