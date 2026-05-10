# Latest Artifact Index

Date: 2026-05-10
Branch: `codex/inner-thoughts-self-improvement`

## Scenario Set

- `journal-organize-ambition`: real-LLM pass exists at `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`.
- `person-to-partner-session`: live enabled. No run artifact yet.
- `ambiguous-person-boundary`: live enabled. No run artifact yet.

## Product Surfaces

- Home composer: `mobile/app/(auth)/(tabs)/index.tsx`
- Inner Thoughts route wrapper: `mobile/app/(auth)/inner-work/self-reflection/[id].tsx`
- Inner Thoughts screen and suggested actions: `mobile/src/screens/InnerThoughtsScreen.tsx`, `mobile/src/components/SuggestedActionButtons.tsx`
- New-session handoff: `mobile/app/(auth)/session/new.tsx`
- Inner Thoughts backend: `backend/src/controllers/inner-work.ts`, `backend/src/routes/inner-thoughts.ts`
- Inner Thoughts memory detection: `backend/src/services/memory-detector.ts`
- Partner session creation/linking: `backend/src/controllers/invitations.ts`
- Stage 0 context prompt: `backend/src/controllers/messages.ts`, `backend/src/services/stage-prompts.ts`

## Current Run Evidence

- Screenshot: `/tmp/mwf-inner-real-journal.png` (local only, not committed)
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`
- Focused tests:
  - Mobile HomeScreen route test passed.
  - Backend stage prompt tests passed.
  - Backend invitations tests passed.
  - Backend memory detector test passed.

## Missing Evidence

- Live evidence for `person-to-partner-session`.
- Live evidence for `ambiguous-person-boundary`.
- Live Stage 0 context-use evidence after partner-session creation.
