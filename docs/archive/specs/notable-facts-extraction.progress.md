# Notable Facts Extraction - Progress Tracking

**Spec:** [notable-facts-extraction.md](./notable-facts-extraction.md)
**Started:**
**Last Updated:**

## Overall Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Data Model | Not Started | |
| Phase 2: Fact Extraction | Not Started | |
| Phase 3: Context Integration | Not Started | |
| Phase 4: History Reduction | Not Started | |

## Phase 1: Data Model & Storage

- [ ] Add `notableFacts` field to UserVessel model
- [ ] Create migration: `npx prisma migrate dev --name add-notable-facts`
- [ ] Verify Prisma client regenerated
- [ ] `npm run check` passes

**Verification:** `npm run check && npm run test`

**Notes:**

---

## Phase 2: Fact Extraction

- [ ] Update `buildClassifierPrompt()` with fact extraction instructions
- [ ] Update `PartnerSessionClassifierResult` type
- [ ] Update `normalizeResult()` to extract facts
- [ ] Save facts to UserVessel after extraction
- [ ] Add unit tests for classifier

**Verification:** `npm run test` (classifier tests pass)

**Notes:**

---

## Phase 3: Context Integration

- [ ] Add `notableFacts` to `ContextBundle` type
- [ ] Load facts in `assembleContextBundle()`
- [ ] Format facts in `formatContextForPrompt()`
- [ ] Add unit tests for context assembly

**Verification:** `npm run test` (context tests pass)

**Notes:**

---

## Phase 4: History Reduction

- [ ] Update `getTurnBufferSize()` to return 4-5
- [ ] Verify conversation context uses reduced size
- [ ] Add/update tests for buffer size

**Verification:** `npm run check && npm run test`

**Notes:**

---

## Blockers & Issues

*Record any blockers encountered during implementation*

---

## Testing Checklist

- [ ] Unit tests for classifier fact extraction
- [ ] Unit tests for context assembly with facts
- [ ] Unit tests for prompt formatting
- [ ] Integration test: facts flow through full pipeline
- [ ] Manual test: conversation shows improved context awareness

---

## Final Verification

- [ ] All phase verifications pass
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] Manual testing confirms facts appear in prompts
