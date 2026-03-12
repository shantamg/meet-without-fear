# Requirements: Meet Without Fear — Inner Thoughts Journal

**Defined:** 2026-03-11
**Core Value:** Two people can reliably complete a full partner session together — every stage transition, partner interaction, and reconciliation step works predictably every time.

## v1.2 Requirements

Requirements for the Inner Thoughts Journal milestone. Each maps to roadmap phases.

### Cleanup

- [x] **CLEAN-01**: User no longer sees needs assessment, gratitude, or meditation pathways in the Inner Work hub
- [x] **CLEAN-02**: Documentation marks unbuilt pathways as deferred/archived

### Sessions

- [x] **SESS-01**: User sees inner thoughts sessions in a dated list (most recent first)
- [x] **SESS-02**: Each session displays AI-generated topic tags

### Distillation

- [x] **DIST-01**: User can trigger distillation after finishing a session (AI extracts concise takeaways in user's own language)
- [ ] **DIST-02**: User can trigger distillation mid-session via an on-demand button
- [ ] **DIST-03**: User can re-distill a session as the conversation grows (incremental update)
- [ ] **DIST-04**: User can review distilled takeaways after extraction
- [ ] **DIST-05**: User can edit, correct, or refine distilled takeaways that were extracted incorrectly
- [ ] **DIST-06**: User can delete individual takeaways

### Knowledge Base

- [ ] **KNOW-01**: User can browse sessions and takeaways grouped by topic/tag
- [ ] **KNOW-02**: User can browse by person mentioned across sessions
- [ ] **KNOW-03**: User can view entries on a topic arranged chronologically (timeline)
- [ ] **KNOW-04**: User can reach any content within 2 taps from the knowledge base entry point

### Cross-Session Intelligence

- [ ] **INTEL-01**: System organically recognizes recurring themes across sessions
- [ ] **INTEL-02**: System builds a running understanding of relationships and issues over time
- [ ] **INTEL-03**: User can see and browse recognized themes and patterns

### Voice Input

- [ ] **VOICE-01**: User can tap a microphone button on the chat input to start voice recording
- [ ] **VOICE-02**: Tapping the mic opens a transcription drawer that slides up, showing real-time transcription in a large readable area
- [ ] **VOICE-03**: User sees their speech transcribed in real-time as they speak (via AssemblyAI streaming)
- [ ] **VOICE-04**: User can stop recording and send the transcribed text as a chat message
- [x] **VOICE-05**: Backend streams audio to AssemblyAI for real-time transcription via WebSocket

### Export & Sharing

- [ ] **SHARE-01**: User can export a selection of takeaways or session summaries (e.g., for therapy prep)
- [ ] **SHARE-02**: User can share exported content via standard OS share sheet

## Future Requirements

Deferred to v1.3+. Tracked but not in current roadmap.

### Advanced Knowledge Base

- **KNOW-05**: User can search knowledge base by keyword
- **KNOW-06**: User can drag-to-reorder takeaways within a topic
- **KNOW-07**: Person profile page with mention timeline and co-occurring themes

### Advanced Intelligence

- **INTEL-04**: Semantic embedding-based theme clustering (beyond string matching)
- **INTEL-05**: AI suggests connections between topics the user hasn't linked

### Architecture Simplification (from v1.1)

- **ARCH-01**: Centralized stage transition hook that enforces cache update pattern
- **ARCH-02**: Type-safe query key factory to prevent cache key mismatches
- **ARCH-03**: Reconciler state machine formalized with explicit state library (e.g., XState)

### Test Coverage (from v1.1)

- **TCOV-01**: Unit tests for ai-orchestrator, context-assembler, reconciler
- **TCOV-02**: Integration tests for critical backend service chains

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mood tracking / mood scores | Anti-pattern in therapeutic context (research: gamification harms) |
| Streaks / badges / gamification | Diverts attention from content to mechanics in mental wellness apps |
| Real-time theme detection during chat | Research: decouple journaling from AI analysis; no interrupting the vent |
| Automatic therapist sharing | Privacy boundary; user must explicitly choose to export/share |
| Multiple tags per session | Single primary tag sufficient to validate browse patterns; upgrade path later |
| Needs assessment, gratitude, meditation pathways | Archived for this milestone; may return in future |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLEAN-01 | Phase 14 | Complete |
| CLEAN-02 | Phase 14 | Complete |
| SESS-01 | Phase 14 | Complete |
| SESS-02 | Phase 14 | Complete |
| VOICE-05 | Phase 14 | Complete |
| DIST-01 | Phase 15 | Complete |
| DIST-02 | Phase 15 | Pending |
| DIST-03 | Phase 15 | Pending |
| KNOW-01 | Phase 16 | Pending |
| KNOW-02 | Phase 16 | Pending |
| KNOW-03 | Phase 16 | Pending |
| KNOW-04 | Phase 16 | Pending |
| INTEL-01 | Phase 16 | Pending |
| INTEL-02 | Phase 16 | Pending |
| INTEL-03 | Phase 16 | Pending |
| DIST-04 | Phase 17 | Pending |
| DIST-05 | Phase 17 | Pending |
| DIST-06 | Phase 17 | Pending |
| VOICE-01 | Phase 17 | Pending |
| VOICE-02 | Phase 17 | Pending |
| VOICE-03 | Phase 17 | Pending |
| VOICE-04 | Phase 17 | Pending |
| SHARE-01 | Phase 18 | Pending |
| SHARE-02 | Phase 18 | Pending |

**Coverage:**
- v1.2 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap revision (VOICE-01 through VOICE-05 added, traceability complete)*
