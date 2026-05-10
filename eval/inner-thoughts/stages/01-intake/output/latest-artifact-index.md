# Latest Artifact Index

Date: 2026-05-10
Branch: `codex/inner-thoughts-self-improvement`

## Scenario Set

- `journal-organize-ambition`: real-LLM pass exists at `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`.
- `person-to-partner-session`: real-LLM pass exists at `docs/product/inner-thoughts-scratch/2026-05-10-real-person-to-partner-session.md`.
- `ambiguous-person-boundary`: real-LLM pass exists at `docs/product/inner-thoughts-scratch/2026-05-10-real-ambiguous-person-boundary.md`.

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
- Screenshot: `/tmp/mwf-inner-real-maya.png` (local only, not committed)
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-person-to-partner-session.md`
- Screenshot: `/tmp/mwf-inner-real-boundary.png` (local only, not committed)
- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-ambiguous-person-boundary.md`
- Focused tests:
  - Mobile HomeScreen route test passed.
  - Backend stage prompt tests passed.
  - Backend invitations tests passed.
  - Backend memory detector test passed.

## Remaining Caveats

- Stage 0 opened from the Maya handoff and referenced Maya, but the initial screen stayed appropriately general rather than exposing the private Inner Thoughts summary verbatim.
