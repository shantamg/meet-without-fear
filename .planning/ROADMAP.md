# Roadmap: Meet Without Fear

## Milestones

- ✅ **v1.0 Session Reliability** — Phases 1-7 (shipped 2026-02-15)
- ✅ **v1.1 Full Session Completion** — Phases 8-13 (completed 2026-02-19)
- 🚧 **v1.2 Inner Thoughts Journal** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 Session Reliability (Phases 1-7) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Audit (4/4 plans) — completed 2026-02-14
- [x] Phase 2: Test Infrastructure (2/2 plans) — completed 2026-02-14
- [x] Phase 3: Stage 0-1 Test Coverage (1/1 plan) — completed 2026-02-14
- [x] Phase 4: Stage 2 Test Coverage (1/1 plan) — completed 2026-02-14
- [x] Phase 5: Stage Transition Fixes (2/2 plans) — completed 2026-02-15
- [x] Phase 6: Reconciler Fixes (2/2 plans) — completed 2026-02-15
- [x] Phase 7: End-to-End Verification (1/1 plan) — completed 2026-02-15

See: `milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 Full Session Completion (Phases 8-13) — COMPLETED 2026-02-19</summary>

- [x] Phase 8: Reconciler Documentation & Edge Cases (4/4 plans) — completed 2026-02-16
- [x] Phase 9: Circuit Breaker Implementation (2/2 plans) — completed 2026-02-17
- [x] Phase 10: Stage 3 (Needs) Verification (2/2 plans) — completed 2026-02-17
- [x] Phase 11: Stage 4 (Strategies) Verification (2/2 plans) — completed 2026-02-17
- [x] Phase 12: Visual Regression Baselines (2/2 plans) — completed 2026-02-18
- [x] Phase 13: Full Session E2E Verification (4/4 plans) — completed 2026-02-19

</details>

### 🚧 v1.2 Inner Thoughts Journal (In Progress)

**Milestone Goal:** Simplify Inner Work to focus solely on Inner Thoughts chat — adding dated sessions with topic tagging, voice input via real-time transcription, AI-guided distillation of venting into organized takeaways, and a browsable knowledge base of accumulated themes, people, and insights.

- [x] **Phase 14: Foundation** - Schema migration, namespace isolation audit, UI cleanup of unbuilt pathways, and AssemblyAI voice backend (completed 2026-03-12)
- [x] **Phase 15: Distillation Backend** - Service that extracts user-language takeaways from sessions via Haiku (completed 2026-03-12)
- [ ] **Phase 16: Knowledge Base Backend** - Browse endpoints and cross-session theme recognition
- [ ] **Phase 17: Session List, Distillation UI, and Voice Input** - Dated session list, takeaway review/edit surface, and voice transcription drawer
- [ ] **Phase 18: Knowledge Base UI and Export** - Browse screen and OS share sheet export

## Phase Details

### Phase 14: Foundation
**Goal**: The codebase is ready for journal knowledge storage — schema deployed, namespace isolation confirmed, Inner Work UI cleaned up so only Inner Thoughts chat is visible, and the AssemblyAI WebSocket backend is available for voice transcription
**Depends on**: Phase 13 (v1.1 complete)
**Requirements**: CLEAN-01, CLEAN-02, SESS-01, SESS-02, VOICE-05
**Success Criteria** (what must be TRUE):
  1. User opens the Inner Work hub and sees only the Inner Thoughts chat — no needs assessment, gratitude, or meditation pathway cards
  2. User sees inner thoughts sessions listed from most recent to oldest, each showing the session date prominently
  3. Each session in the list displays an AI-generated topic tag (set when session closes)
  4. A passing automated test confirms that partner session context retrieval includes no inner thoughts content
  5. A backend token endpoint exists that the mobile app can call to obtain a short-lived AssemblyAI session token for WebSocket streaming
**Plans**: 3 plans
Plans:
- [ ] 14-01-PLAN.md — Hub cleanup and session list UI (CLEAN-01, SESS-01, SESS-02)
- [ ] 14-02-PLAN.md — Namespace isolation fix and documentation updates (CLEAN-02)
- [ ] 14-03-PLAN.md — AssemblyAI voice token endpoint (VOICE-05)

### Phase 15: Distillation Backend
**Goal**: The backend can extract concise, user-language takeaways from a session via a single Haiku call, store them in the new knowledge-base tables, and expose endpoints for triggering and editing takeaways
**Depends on**: Phase 14
**Requirements**: DIST-01, DIST-02, DIST-03
**Success Criteria** (what must be TRUE):
  1. A completed session triggers automatic distillation on close without increasing chat message response time
  2. User can request distillation mid-session via an explicit button, receiving results without waiting for session end
  3. User can re-distill a session after writing more messages and receives updated takeaways that reflect the new content
  4. Distilled takeaways use the user's own words and phrases, not clinical interpretations or psychological labels
**Plans**: 2 plans
Plans:
- [ ] 15-01-PLAN.md — Schema migration, shared DTOs, and type contracts (DIST-01)
- [ ] 15-02-PLAN.md — Distillation service, endpoint, and fire-and-forget hook (DIST-01, DIST-02, DIST-03)

### Phase 16: Knowledge Base Backend
**Goal**: The backend exposes browse endpoints for topics, people, and recurring themes, and the system organically detects cross-session patterns once enough data accumulates
**Depends on**: Phase 15
**Requirements**: KNOW-01, KNOW-02, KNOW-03, KNOW-04, INTEL-01, INTEL-02, INTEL-03
**Success Criteria** (what must be TRUE):
  1. User can browse all their sessions and takeaways grouped by topic tag via a single API endpoint
  2. User can browse all people mentioned across sessions, with each person showing the sessions where they appear
  3. User can view all entries for a given topic arranged in chronological order
  4. After 3 or more sessions share a recurring topic, the system surfaces it as a recognized theme with a cross-session summary
  5. The browse endpoints return results within 500ms for a user with 30 sessions and 150 takeaways
**Plans**: 3 plans
Plans:
- [ ] 16-01-PLAN.md — Schema migration (RecurringTheme), shared DTOs, PersonDetailDTO extension (KNOW-01, KNOW-04, INTEL-01, INTEL-03)
- [ ] 16-02-PLAN.md — Browse endpoints (topics, timeline, themes), people extension, route wiring (KNOW-01, KNOW-02, KNOW-03, KNOW-04, INTEL-02, INTEL-03)
- [ ] 16-03-PLAN.md — Theme detection service and fire-and-forget distillation integration (INTEL-01, INTEL-02)

### Phase 17: Session List, Distillation UI, and Voice Input
**Goal**: The mobile app shows a dated session list, gives users a surface to review, edit, and delete distilled takeaways, and provides a mic button that opens a real-time transcription drawer for hands-free chat input
**Depends on**: Phase 15
**Requirements**: DIST-04, DIST-05, DIST-06, VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. User opens a completed session and sees distilled takeaways displayed in a review sheet
  2. User can tap any takeaway to edit its text inline and see the change saved immediately
  3. User can swipe or tap to delete an individual takeaway and it disappears without a full reload
  4. User taps the mic button on the chat input and a transcription drawer slides up from the bottom showing real-time transcribed text as they speak
  5. User taps "Stop and Send" in the drawer and the transcribed text appears as their chat message
**Plans**: 2 plans
Plans:
- [ ] 17-01-PLAN.md — Distillation review UI: hook, review sheet, inline edit, swipe delete (DIST-04, DIST-05, DIST-06)
- [ ] 17-02-PLAN.md — Voice input: expo-audio, recording hook, transcription drawer, mic button (VOICE-01, VOICE-02, VOICE-03, VOICE-04)

### Phase 18: Knowledge Base UI and Export
**Goal**: The mobile app exposes a browsable knowledge base reachable from the home screen, and users can export or share a curated selection of their takeaways via the OS share sheet
**Depends on**: Phase 16, Phase 17
**Requirements**: SHARE-01, SHARE-02
**Success Criteria** (what must be TRUE):
  1. User can reach any takeaway or theme within 2 taps from the knowledge base entry point
  2. User can select a set of takeaways or session summaries and export them as readable text
  3. User tapping "Share" on an export sees the standard iOS/Android share sheet with the exported content pre-populated
**Plans**: 2 plans
Plans:
- [ ] 18-01-PLAN.md — Infrastructure: query keys, hooks, routes, export utility, entry point (SHARE-01)
- [ ] 18-02-PLAN.md — Browse index screen, topic detail screen with multi-select + Share (SHARE-01, SHARE-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17 → 18
Note: Phase 17 depends on Phase 15 only; Phase 18 depends on both 16 and 17.

| Phase                                        | Milestone | Plans Complete | Status      | Completed  |
|----------------------------------------------|-----------|----------------|-------------|------------|
| 1. Audit                                     | v1.0      | 4/4            | Complete    | 2026-02-14 |
| 2. Test Infra                                | v1.0      | 2/2            | Complete    | 2026-02-14 |
| 3. Stage 0-1                                 | v1.0      | 1/1            | Complete    | 2026-02-14 |
| 4. Stage 2                                   | v1.0      | 1/1            | Complete    | 2026-02-14 |
| 5. Transitions                               | v1.0      | 2/2            | Complete    | 2026-02-15 |
| 6. Reconciler                                | v1.0      | 2/2            | Complete    | 2026-02-15 |
| 7. E2E Verify                                | v1.0      | 1/1            | Complete    | 2026-02-15 |
| 8. Reconciler Patterns                       | v1.1      | 4/4            | Complete    | 2026-02-16 |
| 9. Circuit Breaker                           | v1.1      | 2/2            | Complete    | 2026-02-17 |
| 10. Stage 3 Needs                            | v1.1      | 2/2            | Complete    | 2026-02-17 |
| 11. Stage 4 Strategies                       | v1.1      | 2/2            | Complete    | 2026-02-17 |
| 12. Visual Baselines                         | v1.1      | 2/2            | Complete    | 2026-02-18 |
| 13. Full Session E2E                         | v1.1      | 4/4            | Complete    | 2026-02-19 |
| 14. Foundation                               | 3/3 | Complete    | 2026-03-12 | -          |
| 15. Distillation Backend                     | 2/2 | Complete    | 2026-03-12 | -          |
| 16. Knowledge Base Backend                   | 2/3 | In Progress|  | -          |
| 17. Session List + Distillation UI + Voice   | v1.2      | 0/2            | Planned     | -          |
| 18. Knowledge Base UI + Export               | v1.2      | 0/2            | Planned     | -          |

---
*Roadmap created: 2026-02-14*
*Last updated: 2026-03-12 (Phase 16 planned — 3 plans in 2 waves)*
