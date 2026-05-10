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

- `person-to-partner-session`
- `ambiguous-person-boundary`
- live CTA click-through into generated context and Stage 0
