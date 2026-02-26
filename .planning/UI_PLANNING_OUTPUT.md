# UI Planning Output — Fixes 7 & 8

## Fix 7: Strategy Button Investigation (UX Expert)

### Finding
The `index === 0` guard in `OverlapReveal.tsx:68` artificially limits the "Create Agreement" button to only the first matched strategy. This is a **bug**, not intentional.

### Evidence
- Backend fully supports multiple agreements (`agreements: AgreementDTO[]`)
- `handleCreateAgreementFromOverlap` accepts any strategy
- `useCreateAgreement` has no limit check
- However, the frontend has a systemic singleton pattern: `agreements[0]` is hardcoded in 3 locations

### Proposed Fix (4 locations)
1. **OverlapReveal.tsx:68** — Remove `index === 0` guard
2. **UnifiedSessionScreen.tsx agreement-confirmation overlay (~line 1670)** — Render all agreements, not just `agreements[0]`
3. **UnifiedSessionScreen.tsx inline agreement-preview card (~line 1437)** — Show count when multiple
4. **useUnifiedSession.ts inline cards (~line 846)** — Include full agreements data

### Resolution Trigger
Only fire `handleResolveSession` after ALL agreements confirmed (use backend's `sessionCanResolve` field).

---

## Fix 8: Session Completion Screen (UX Expert + Great Thinker)

### Design Philosophy (Great Thinker)
- **Acknowledge, don't celebrate** — quiet respect, not fanfare
- **Center the users, not the app** — they did this work
- **Honor the dyad** — it was a shared act
- **Protect fragile hope** — don't inflate or deflate
- **Design for the memory** — peak-end rule means this shapes how they remember the entire experience
- **Be humble** — the app facilitated; only humans resolve conflicts
- Tone: "warm gravity" — a gentle pull into settledness
- No ratings, no social sharing, no upselling at this moment

### UX Spec (UX Expert)

**Pattern**: Full-screen early-return overlay (like mood check / strategy ranking)

**Layout**:
1. SessionChatHeader with "resolved" badge
2. Handshake icon
3. Headline: "You Did Something Brave" / "A Step Forward Together"
4. Subheading: "You and [partner] worked through this together"
5. Agreement Summary section with read-only AgreementSummaryCards
6. Session metadata (stages completed, date range)
7. "View Conversation History" (text link) + "Return to Sessions List" (primary button)

**New Components**:
- `SessionCompletionScreen` — main completion view
- `AgreementSummaryCard` — read-only agreement display

**Interaction**:
- Appears when `session?.status === SessionStatus.RESOLVED && !viewingResolvedHistory`
- "View Conversation History" sets local `viewingResolvedHistory` state → falls through to read-only chat
- Re-entering session shows completion screen again (not chat)

**Stale Panel Suppression**:
- Already partially handled by Fix 6 (agreement-preview hidden when resolved)
- Additional RESOLVED checks needed in `chatUIState.ts` for: needs review, common ground, empathy, share suggestion panels

### Open Questions
1. Should completion screen include "Schedule Follow-up" / "Set Reminder"?
2. Should it include "Archive Session" action?
3. Should there be a gentle reflection prompt 24h later?
