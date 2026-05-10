# Rerun Results

Date: 2026-05-10

## `journal-organize-ambition`

- Run id: `real-local`
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`
- App URL: `http://localhost:8082/?e2e-user-id=inner-real-journal-user&e2e-user-email=inner-real-journal-user%40e2e.test`
- Backend: worktree backend on `localhost:3000` with `MOCK_LLM=false`
- Status: `pass`

### What Passed

- Home composer accepted the exact starting message.
- The app navigated into Inner Thoughts.
- The visible chat contained the exact user message and no coming-soon copy.
- No inappropriate partner-session CTA appeared during the solo reflection.
- The AI stayed reflective and asked focused follow-up questions.
- When asked to organize the material, the AI identified three coherent buckets: practical risk, fear of disappointing others, and fear of not being good enough.
- The AI did not turn the user's request into a productivity checklist.

### Defect Found

- Real-LLM inner-thoughts memory detection initially logged BrainActivity with `sessionId: <innerWorkSessionId>`, causing Prisma `P2025` errors because the id was not a partner `Session`.
- The chat recovered through fallback, but real-LLM telemetry was broken.
- Fixed in `backend/src/services/memory-detector.ts` by logging inner-thoughts detection with `innerWorkSessionId`.
- Verified after backend restart with another real turn: BrainActivity inserted with `innerWorkSessionId`, memory detection completed, and no Prisma relation error appeared.

### Still Not Covered

None for this cycle's three required scenarios.

## `person-to-partner-session`

- Run id: `real-local`
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-person-to-partner-session.md`
- App URL: `http://localhost:8082/?e2e-user-id=inner-real-maya-user&e2e-user-email=inner-real-maya-user%40e2e.test`
- Backend: worktree backend on `localhost:3000` with `MOCK_LLM=false`
- Status: `pass`

### What Passed

- The AI did not suggest a partner session merely because Maya was named.
- The CTA appeared after the user said they might need to talk with Maya and wanted to understand what to say.
- Clicking `Start a session with Maya` opened `/session/new?partnerName=Maya&innerThoughtsId=cmozer39v000apx253x4y5efe`.
- The new-session screen showed `From Inner Thoughts`, rendered the generated summary, and prefilled `Maya`.
- Creating the session opened `/session/cmozeud490014px25t5xy0h50`.
- Database evidence showed `InnerWorkSession.linkedPartnerSessionId = cmozeud490014px25t5xy0h50` and `linkedTrigger = suggestion_start`.
- The first Stage 0 screen referenced talking with Maya.

## `ambiguous-person-boundary`

- Run id: `real-local`
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-ambiguous-person-boundary.md`
- App URL: `http://localhost:8082/?e2e-user-id=inner-real-boundary-user&e2e-user-email=inner-real-boundary-user%40e2e.test`
- Backend: worktree backend on `localhost:3000` with `MOCK_LLM=false`
- Status: `pass`

### What Passed

- The user named Jordan but explicitly said they did not want a conversation yet.
- The AI stayed with private reflection on freezing, workplace power dynamics, uncertainty, and boundaries.
- No `Suggested next steps` partner-session CTA appeared.
- Database evidence showed no linked partner session for `InnerWorkSession.cmozex6nz001lpx25h3oik55d`.
