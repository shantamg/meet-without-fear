# Stage 4 Closure + Tending Backend Audit (#367, #368)

Date: 2026-05-02
Auditor: subagent (gold-transcript-aligned)
Reference: docs/product/stage-4-tending-technical-spec.md, docs/product/stage-4-tending-build-progress.md (lines 139–207 on branch `codex/stage4-tending-focus`)

Note: `docs/product/stage-4-gold-question-analysis.md` was specified as the canonical reference but does not exist in any branch in this repo (verified via `git log --all -- <path>` and `git rev-list --all | xargs git ls-tree`). I audited against the gold transcripts directly and the technical spec's resolution rules, both of which are explicit on the principles in question.

Code reviewed on branch `codex/stage4-tending-focus`:
- `backend/src/controllers/stage4.ts` (closure handler L494–741)
- `backend/src/services/tending.service.ts` (scheduling, response, re-entry)
- `backend/src/controllers/tending.ts`, `backend/src/routes/tending.ts`
- `backend/src/services/realtime.ts` (publish semantics)

## #367 — Selection, outcome, no-shared-agreement closure

- Verdict: ALIGNED (with one minor concern)
- Mutual-WILLING = agreement: PASS. `closeStage4` (stage4.ts:576–582, 637–679) filters proposals where `kind === SHARED_PROPOSAL` AND `bothPartnersWilling(...)`, then creates `Agreement` rows directly in `status: 'AGREED'` with `agreedByA: true, agreedByB: true, agreedAt: now`. No second confirmation step is required for closure-formed agreements. This matches the V1 decision recorded at build-progress L166 ("mutual `WILLING` selections … treated as agreement consent for closure"). Adam-eve gold (lines ~1208, 1452) shows agreement-from-mutual-selection with no separate confirm step.
- No-shared-agreement closure preserves dignity: PASS. stage4.ts:684–696 writes a `Stage4Closure(kind = NO_SHARED_AGREEMENT)` with `sharedAgreementIds: []`, carries `individualProposalIds` (only WILLING individual commitments — see `getWillingIndividualCommitmentIds`, used at L580), and persists `openNeedIds` from PARTIAL/OPEN coverage rows (L581–583). No empty Agreement is invented. Session resolves to `RESOLVED` (L698–701). This matches the james-catherine path (lines 1249, 1297, 1343): individual commitments stand; open needs (to-be-seen, to-be-met) named without failure language. Closure summary text quality depends on `buildClosureSummary` and the prompt layer (out of #367 scope) — gold dignity requires the conversational summary to avoid "failed/no solution"; the data shape supports it.
- Partner-inactivity safety rail: PASS. stage4.ts:571–574 computes `bothPartnersSubmitted` over relationship members; L592–596 rejects SHARED_AGREEMENT closure with VALIDATION_ERROR when not both submitted. Inactivity branch can still close as NO_SHARED_AGREEMENT with `reason = USER_STOPPED` (L617–620), which matches the spec timeout rule (technical-spec L351–354) — no shared obligation can be created for the absent partner.
- Concerns:
  - L603–611 allows a caller to override mutual-willing into NO_SHARED_AGREEMENT only if reason is BOUNDARY_HONORED or USER_STOPPED. Good guard, but caller-supplied `requestedKind` (L585) lets a SHARED_AGREEMENT request proceed whenever both submitted and ≥1 mutual-willing exists — there is no UI guard preventing one user from triggering closure unilaterally as long as both have selected. Per gold this is acceptable (Adam-eve lines 1452, 1471 — either user closes), but worth a sanity test that the closing user's selections are also WILLING on the chosen proposals (currently `bothPartnersWilling` already enforces this since the closer is one of the two partners).
  - `MAX_AGREEMENTS` slice (L579) silently drops mutually-willing shared proposals beyond the cap. Closure summary should surface this; not verified in code path.

## #368 — Tending backend

- Verdict: DRIFT (one gold-posture violation on passive re-entry notification)
- Scheduling only for shared agreements: PASS. `scheduleSharedAgreementTendingEntries` is only invoked inside the `if (closureKind === SHARED_AGREEMENT)` branch (stage4.ts:637, 681). Within scheduling itself (tending.service.ts:124–153), entries are created only when `agreement.followUpDate` is set — agreements without timing produce no scheduled entry. NO_SHARED_AGREEMENT path never enters this branch, matching james-catherine (no scheduled cross-partner check-in; transcript ends at 1343 without one).
- Response aggregation does not invent feedback: PASS. tending.service.ts:209–247: counts actual `TendingResponse` rows; sets `PARTIAL` until `responseCount >= memberCount`, only then `COMPLETED` with `completedAt` set. One user's submission never auto-fills the absent partner. Matches Adam-eve gold (lines 1324, 1440: "We'll hold your choices until [partner]'s check-in is complete").
- Passive re-entry one-sided: FAIL. `createPassiveReentry` (tending.service.ts:306–336) calls `publishSessionEvent(sessionId, 'notification.pending_action', { kind: 'tending_reentry_created', ... }, args.userId)`. Per `realtime.ts:175–217, 271–322`, `publishSessionEvent` invokes `notifySessionMembers` with `excludeUserId = actor`, which broadcasts a session/user-channel update to *all other members* (i.e., the partner) — that is exactly the leak the gold posture forbids. Per the technical-spec L713–714 ("Does not notify partner by default until the user chooses a path that requires partner participation") and the gold posture summarized in the user's audit prompt, the partner must not learn of a re-entry until the re-entering user picks a partner-involving path. The current implementation pings the partner the moment the entry is created.
- Concerns:
  - The same pattern in `submitTendingResponse` (tending.service.ts:250–254) is appropriate (this IS a partner-involving path: scheduled shared check-ins).
  - `openDueTendingEntries` (L338–368) publishes without `excludeUserId`, broadcasting to both members — correct for SCHEDULED shared check-ins.
  - Re-entry summary (L260–304) reads `Stage4Closure`, agreements, individual commitments, open needs, and session summary — content shape is fine; the notification itself is the issue.

## Cross-issue observations

- Single-transaction coupling: agreement creation, proposal conversion, revision history, `Stage4Closure`, session resolve, stage progress completion, and Tending scheduling are all inside one `prisma.$transaction` (stage4.ts:629–709). Strong consistency guarantee. If `scheduleSharedAgreementTendingEntries` throws (e.g., a missing followUpDate is fine — short-circuit; but DB error), the entire closure rolls back. This is the right trade-off, but means Tending scheduling failures abort closure — worth a follow-up to schedule asynchronously after commit if Tending writes ever become more expensive.
- Closure summary text: `buildClosureSummary` was not opened in this audit; gold dignity (no-shared-agreement transcripts lines 1249/1343) depends on its phrasing. Recommend a unit test asserting absence of words like "failed", "could not agree".
- `Agreement` `followUpDate` parsing (stage4.ts:639–640) accepts `parseResult.data.followUpDatesByProposalId?.[proposal.id]`. If timing is captured by the AI and routed via `Stage4TendingTimingDTO`, the close handler must receive it in this map for Tending to schedule. Mobile/AI plumbing was out of scope here — flag for #369/#370 verification.
- Partner-inactivity timeout (technical-spec L351–354) is honored at the rejection point, but there is no sweeper that auto-closes inactive sessions as NO_SHARED_AGREEMENT — closure is still user-driven. Acceptable for V1.
- Cannot verify without running: actual broadcast payload reception by the non-actor client during passive re-entry. Recommend an integration test that asserts no realtime message is delivered to the partner channel for `tending_reentry_created`.

### Required fix before merge (gold-blocking)

Passive re-entry must not notify the partner. Either (a) skip the `publishSessionEvent` call inside `createPassiveReentry` entirely, or (b) introduce an `excludePartner: true` mode (publish only on the actor's user channel). Then add a regression test mirroring the gold posture: re-entry creates the entry, but `notifySessionMembers` is not invoked for the partner.
