# Rerun Results

Date: 2026-05-10

## `journal-organize-ambition`

- Run id: `local`
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-local-journal-organize-ambition.md`
- App URL: `http://localhost:8082/?e2e-user-id=inner-journal-user&e2e-user-email=inner-journal-user%40e2e.test`
- Backend: existing local backend on `localhost:3000`
- Status: `bug_blocked`

### What Passed

- Home composer accepted the exact starting message.
- The app navigated into Inner Thoughts.
- The visible chat contained the exact user message and no coming-soon copy.
- No inappropriate partner-session CTA appeared during the first two turns.

### What Failed Or Is Not Evaluable

- Reflection quality did not pass. The first two AI responses were generic fallback-style prompts and did not organize the user's themes or tensions.
- The URL remained `.../self-reflection/new?id=new`, which makes actor status less informative even though the route may hold the created id in component state.

### Next Action

Diagnose whether the local backend had model access/configuration for this run. If model access is available, inspect Inner Thoughts response generation and fallback handling. If model access is unavailable, rerun with a properly configured real-LLM backend before judging reflection quality.
