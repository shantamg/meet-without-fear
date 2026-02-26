# Dual Browser Session Setup

Launch two side-by-side mobile-sized browser windows for testing the app with two different users. Uses `agent-browser` CLI with named sessions for isolated browser contexts.

## Architecture

```
You (single agent)
  ├── agent-browser --session user-a → Browser A (User A, left window)
  ├── agent-browser --session user-b → Browser B (User B, right window)
  └── Bash → 3 background servers (backend, mobile web, website)
```

- Use `agent-browser --session user-a ...` for **User A's browser** (left window)
- Use `agent-browser --session user-b ...` for **User B's browser** (right window)
- Both sessions are fully isolated (separate cookies, localStorage, auth state).

## Instructions

You MUST use the `agent-browser` CLI to perform the following steps. Do NOT skip any step.

### Phase 1: Launch two browser windows

Do the following for both browsers (can be done in parallel):

**Browser A (left window):**

```bash
agent-browser --session user-a --headed open http://localhost:8081/
agent-browser --session user-a set viewport 390 812
agent-browser --session user-a snapshot -i
```

**Browser B (right window):**

```bash
agent-browser --session user-b --headed open http://localhost:8081/
agent-browser --session user-b set viewport 390 812
agent-browser --session user-b snapshot -i
```

Tell the user:
- **Left window** = Browser A — interact with `agent-browser --session user-a`
- **Right window** = Browser B — interact with `agent-browser --session user-b`
- "Two browser windows are ready. Please log in to each one — one as each user. Tell me when you're done."

### Phase 2: Wait for user login

Wait for the user to confirm they have logged in to both windows. Take snapshots of both to confirm:
- `agent-browser --session user-a snapshot -i` — identify User A's name
- `agent-browser --session user-b snapshot -i` — identify User B's name

Store the name mapping for subsequent steps.

### Phase 3: Cleanup

When done, close both sessions:
```bash
agent-browser --session user-a close
agent-browser --session user-b close
```

### Quick Reference: Commands

| Action | Browser A (left) | Browser B (right) |
|--------|-------------------|---------------------|
| Snapshot | `agent-browser --session user-a snapshot -i` | `agent-browser --session user-b snapshot -i` |
| Click | `agent-browser --session user-a click @e1` | `agent-browser --session user-b click @e1` |
| Type | `agent-browser --session user-a fill @e1 "text"` | `agent-browser --session user-b fill @e1 "text"` |
| Navigate | `agent-browser --session user-a open <url>` | `agent-browser --session user-b open <url>` |
| Screenshot | `agent-browser --session user-a screenshot path.png` | `agent-browser --session user-b screenshot path.png` |
| Console | `agent-browser --session user-a console` | `agent-browser --session user-b console` |
| Errors | `agent-browser --session user-a errors` | `agent-browser --session user-b errors` |
| Eval | `agent-browser --session user-a eval 'expr'` | `agent-browser --session user-b eval 'expr'` |
