# Stage 4 Backend Foundation Audit (#363–#366)

Date: 2026-05-05
Auditor: subagent (gold-transcript-aligned)
Scope: data model, state API, capture service, needs coverage audit
Reference: docs/product/stage-4-tending-technical-spec.md, docs/product/source-material/golden-transcripts/{adam-eve,james-catherine,core-protocol-update}.md

Note on missing inputs: the audit prompt referenced `docs/product/stage-4-gold-question-analysis.md` and `docs/product/stage-4-tending-build-progress.md`. The first does not exist in this repo on any branch I could reach; the second exists only on `origin/codex/stage4-tending-focus` and was read from there. The PR 373 work being audited is on `origin/codex/stage4-tending-focus`, not yet merged to main. All code citations below are against that branch.

## Per-issue verdicts

### #363 — Data model

- Verdict: ALIGNED
- What's right:
  - `StrategyProposal.kind` (`SHARED_PROPOSAL` | `INDIVIDUAL_COMMITMENT`) makes individual commitments first-class with the same shape as shared proposals (`backend/prisma/schema.prisma:922`, enum at `:952`). The james-catherine inventory section labels "INDIVIDUAL COMMITMENTS (Catherine): therapy, journaling" as separate from shared experiments — this representation supports that without making them a sub-state of shared proposals.
  - `Stage4ProposalSelection` models per-proposal willingness as `WILLING | NOT_WILLING | NEEDS_DISCUSSION` (`schema.prisma:996`), distinct from `Agreement.agreedByA/B`. Mutual `WILLING` on a shared proposal is a separate signal from agreement creation. A single user's `WILLING` does not produce an `Agreement` row.
  - `Stage4Closure` (`schema.prisma:1046`) is a session-level record carrying `kind`, `reason`, `sharedAgreementIds[]`, `individualProposalIds[]`, `openNeedIds[]`. `NO_SHARED_AGREEMENT` closure is representable with zero `Agreement` rows — directly addresses Catherine's "no shared experiments selected → mediation closes without one" path.
  - `Stage4ProposalRevision` records `CREATED|REVISED|REMOVED|RESTORED|CONVERTED|CAPTURE_SKIPPED` history with `before/after` JSON snapshots and `messageId` linkage (`schema.prisma:1013`). Removal does not destroy history.
  - `Stage4NeedCoverage.openNeedIds` are kept on the session, surviving no-shared-agreement closure, which lines up with the gold "named, real, not forgotten" framing for Catherine's "to be seen / to be met."
- What concerns me:
  - `Stage4NeedCoverage.coverageStatus` is a free `String` (`schema.prisma:1037`); referenced as the literal `'COVERED' | 'PARTIAL' | 'OPEN'` in services. Recorded in build progress as a deliberate v1 deferral. Minor; does not affect gold effect.
  - `Agreement.duration` / `measureOfSuccess` denormalization called out in the spec is not visible in the schema diff I reviewed; the state service still returns whatever the existing `Agreement` columns hold. Cosmetic for the audit, but flagged because the spec lists it as part of #363.
- Suggested follow-ups: tighten `coverageStatus` to a Prisma enum once #366 settles; confirm Agreement denormalized timing fields land before mobile reads them.

### #364 — State API

- Verdict: ALIGNED
- What's right:
  - `getStage4State` returns `inventory.sharedProposals`, `inventory.individualCommitments`, and `inventory.unaddressedNeeds` as separate arrays (`backend/src/services/stage4-state.ts:380–397`). A client can render the gold "INDIVIDUAL COMMITMENTS (Catherine)" sub-section and the "NEEDS ACKNOWLEDGED AS UNADDRESSED" block straight from this shape.
  - `ownerLabel` on `ProposalCardDTO` is set to `'You' | 'Partner'` only for individual commitments (`stage4-state.ts:158–165`), so the partner can be shown the labeled track per gold convention.
  - Partner privacy: `revealPartnerSelections = mySelections.length > 0 && partnerSelections.length > 0` (`stage4-state.ts:357–360`); `partnerDecisionVisible` and `partnerSelectionStatus` are gated by this. This matches the gold "We'll hold those until Catherine's selections are in. Then you'll see where you overlap" beat.
  - Phase derivation (`derivePhase`, `:236`) handles `CLOSED_NO_SHARED_AGREEMENT` and `CLOSED_SHARED_AGREEMENT` separately. `outcome` block returns agreements, individual commitments, and open needs even on no-shared-agreement closure (`:402–414`), preserving the work.
- What concerns me:
  - The legacy `controllers/stage4.ts` still exists and continues to expose ranking/overlap; `getStrategies` will compute `phase` purely from ready-to-rank/ranking gates. As long as mobile reads `/stage4`, fine — but there is no kill switch in the diff I saw. This is an interim state by design; flag it for explicit deprecation.
  - `partnerSelectionStatus` is a session-wide flag, not per-proposal. The gold flow's "she selected none" beat is conveyed via `outcome` once closure happens, so this is sufficient — but a partner who has submitted *some* selections will appear `SUBMITTED` even if not done. No gold-effect break, just worth noting.
- Suggested follow-ups: explicit deprecation timer on `/strategies` ranking endpoints; consider a `partnerSelectionsComplete` boolean for the OUTCOME_REVIEW gate.

### #365 — Capture service

- Verdict: DRIFT
- What's right:
  - Add/Revise/Remove/Restore are first-class operations and write `Stage4ProposalRevision` history on every applied operation (`stage4-capture.service.ts:380–500`). Catherine's "That comes off the list" pattern produces a `REMOVE_PROPOSAL` operation with `removedAt`, `removedByUserId`, `removalReason`, and an audit row.
  - Two-tier confidence threshold: `CAPTURE_CONFIDENCE_THRESHOLD = 0.7` for adds, `DESTRUCTIVE_CONFIDENCE_THRESHOLD = 0.85` for remove/restore (`:114`). Low-confidence destructive intent is not applied and writes a `CAPTURE_SKIPPED` revision (`:336–360`). This protects against mass-deletion on ambiguous phrasing.
  - Coverage is refreshed only after at least one applied operation (`:540`), so phantom inventory does not bleed into the coverage audit.
  - Inventory is sourced from `prisma.strategyProposal.findMany` including removed rows for matching, but `applyOperation` filters by ID, so phantom data does not leak.
- What concerns me:
  - The remove regex requires both a verb (`remove|delete|drop|take`) AND a noun (`proposal|idea|strategy|that|it|off|out`) in `extractDestructiveOrRevisionOperation` (`:232`). Catherine's literal gold line is "That comes off the list." That phrasing matches `take ... off`-style patterns only weakly: "comes off" is not in the pattern alternation. The current regex would likely *miss* this exact gold utterance and not even produce a low-confidence skip audit. This is a gold-effect drift: the capture service in v1 may not catch the canonical removal phrasing.
  - The "I can/I will" individual-commitment detector (`inferProposalKind`, `:174`) does not inspect whether the action requires the partner. Per spec: "Treat 'I can do X' as an individual commitment unless it requires partner action." A user saying "I can listen better when you raise the kids issue" would be classed individual when it depends on partner trigger. Minor; the gold transcripts don't show this exact ambiguity, but worth a follow-up.
  - The selection regex (`extractSelection`, `:282`) requires a referenceable proposal at confidence ≥ 0.7. That seems healthy.
  - Closure signal regex matches "stop|done|close this|no agreement|no shared agreement". Catherine's gold close line is "I've been sure for a long time" / "That I'm done" — `\bdone\b` does match. OK.
- Suggested follow-ups: extend remove pattern to cover "comes off", "take it off the list", "scratch that", "drop that one"; add a unit test against the literal Catherine line; revisit kind inference for partner-dependent "I can" phrases.

### #366 — Needs coverage

- Verdict: ALIGNED (with one quality flag)
- What's right:
  - `classifyCoverage` returns COVERED / PARTIAL / OPEN with linked proposal IDs and a non-failure note: open rows say "Still open for Stage 4 discussion", partial says "Partly addressed; may need more detail or adjustment" (`backend/src/services/stage4-coverage.service.ts:81–101`). No "failure" / "missed" / "uncovered" framing — supports the gold "named, real, and not forgotten" effect.
  - Coverage refresh deletes-then-recreates inside a transaction (`:135–140`) keyed by sessionId; revisions to the inventory will not leave stale rows.
  - `Stage4NeedCoverage` rows persist `sourceUserId`, which the state service translates to `'YOU' | 'PARTNER' | 'BOTH' | 'UNKNOWN'`, allowing the partner-side render (gold: "Catherine's: To be seen — to have her experience acknowledged as real" appears under Catherine's heading on James's track).
  - Open needs are preserved through closure: `Stage4Closure.openNeedIds[]` references coverage rows, and `getStage4State.outcome.openNeeds` filters by `closure.openNeedIds`. No-shared-agreement closure does not lose them.
- What concerns me:
  - Coverage classification is purely lexical word-overlap on `IdentifiedNeed.need` text (`overlapScore`, `:42`). For the gold need "to be seen" against a proposal "Pause agreement: when a conversation starts heading somewhere dangerous...", overlap will be ~0 and the need will correctly be marked OPEN. Good. But for compound needs like "dignity, heard" mapped against "morning after practice", short stop-words (`length > 2`) will produce noisy partial matches. Could classify as PARTIAL when the gold MWF would not. Quality issue, not effect drift.
  - `proposal.needsAddressed` is currently empty for AI-captured proposals (capture service writes `needsAddressed: []` at `stage4-capture.service.ts:198`), so coverage relies entirely on description-text overlap until the capture is enriched. Means early-state coverage may underreport COVERED in practice.
- Suggested follow-ups: enrich captured proposals with `needsAddressed` from the conversation context; add a small fixture-driven test using gold lines (e.g. "to be seen" should remain OPEN against the four shared experiments).

## Cross-issue observations

- **Effect-level gold alignment is genuinely supported by the data shape.** The James/Catherine no-shared-agreement close (`james-catherine.md:1229`, `:1297`, `:1343`) maps cleanly onto `Stage4Closure(kind=NO_SHARED_AGREEMENT) + individualProposalIds + openNeedIds`, and the per-track inventory render is reachable from the `/stage4` response shape.
- **Capture-service phrase coverage is the weakest link.** The data model and state API can express the gold inventory faithfully, but the deterministic v1 capture has gaps that would prevent the gold dialogue from actually mutating state correctly without help from prompt-tagged fallbacks. The compatibility path through `compatibilityProposedStrategies` covers adds, but there is no equivalent compatibility channel for removals — meaning Catherine's "comes off the list" must be matched by regex or it goes unrecorded. This is the highest-leverage follow-up.
- **Privacy posture is correct but session-scoped, not proposal-scoped.** Selections reveal as a single boolean per session. The gold protocol describes "we'll hold these until Catherine's selections are in" as a session-level mutual reveal, so this is aligned, but worth confirming that mid-flight partial selection reveals don't leak partner intent through the `partnerSelectionStatus` field's transition timing.
- **Legacy `/strategies` controller is intentionally retained.** The new state is additive. Confirm an explicit deprecation milestone before mobile reads begin to depend on `/stage4` exclusively, so rankings cannot accidentally re-engage.
