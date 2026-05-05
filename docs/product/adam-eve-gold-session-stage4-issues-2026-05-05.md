# Adam/Eve Gold Session Stage 4 Issues - 2026-05-05

Scenario: Adam/Eve successful-resolution benchmark
Session ID: `cmoru5afm000bpxj2e3coa3ij`
App: local E2E/no-Clerk web bundle on `http://localhost:8082`

This report captures issues found during a two-Codex local E2E gold-session playthrough. This file starts with the Adam-side report. The Eve-side Codex session should append its section below.

## Adam Side: Invitor

Role: Adam, session creator/invitor
Browser URL: `http://localhost:8082/session/cmoru5afm000bpxj2e3coa3ij?e2e-user-id=cmorpyyqi0002pxnt18abhy7t&e2e-user-email=adam@e2e.test`
Partner: Eve, invitation acceptor

### Summary

This Adam/Eve run got farther than the previous Adam/Eve report in `docs/product/adam-eve-gold-session-issues.md`. Stage 3 completed for both users: needs were captured, confirmed, shared, validated, and both users reached Stage 4. That is a meaningful improvement over the earlier Adam-side blocker where `Review needs together` rendered but could not complete the Stage 3 validation gate.

The run stopped in Stage 4. The UI showed `What Comes Next` and an `Ideas So Far` card, but Adam could not mark himself ready to rank. The visible card said strategies were still being gathered and rendered `Ready to Rank`, but the button behaved as inert/disabled. DB state contradicted the UI: six `StrategyProposal` rows existed, Eve already had `readyToRank: true`, and Adam's Stage 4 progress remained `IN_PROGRESS` with `gates: null`. Because Stage 4 ranking requires both users' `readyToRank` gates, Eve could not rank either.

### Comparison Against Previous Gold-Run Notes

Previous notes reviewed:
- `docs/product/adam-eve-gold-session-issues.md`
- `docs/product/james-catherine-gold-session-issues.md`
- `docs/product/james-catherine-gold-session-bug-handoff-2026-05-04.md`
- `docs/product/gold-flow-next-session-plan.md`
- `docs/product/stage-4-tending-technical-spec.md`

Fixed or improved in this Adam-side run:
- Stage 3 completed through the intended gates for both users.
- Adam's Stage 3 gates ended with `needsCaptured`, `needsConfirmed`, `needsShared`, and `needsValidated`.
- Eve's Stage 3 gates also ended with `needsCaptured`, `needsConfirmed`, `needsShared`, and `needsValidated`.
- Both users advanced to Stage 4 / `What Comes Next`.
- The side-by-side needs reveal used needs language, not AI-authored common-ground truth.
- No cross-user private prompt leak was observed on Adam's side.

Still open from previous runs:
- Current gate clarity remains weak. Old prompts and old stage separators remain near the bottom of the chat history, while the actual current action is presented as a small card near the input.
- Chat input can remain visible in states where the app is not asking for chat input.
- Realtime/cache state remains suspect: browser state can lag behind DB progress or show stale strategy counts.

New issue from this Adam-side run:
- Stage 4 strategy readiness is blocked because Adam's UI does not submit `POST /sessions/:id/strategies/ready` even though strategies exist and the card says `Ready to Rank`.

### Current DB State At Stop

Checked from local Prisma against `SESSION_ID=cmoru5afm000bpxj2e3coa3ij`.

Session:
- `status: ACTIVE`

Adam:
- Stage 0: `COMPLETED`
- Stage 1: `COMPLETED`
- Stage 2: `COMPLETED`, `empathyValidated: true`
- Stage 3: `COMPLETED`, gates include:
  - `needsCaptured: true`
  - `needsConfirmed: true`
  - `needsShared: true`
  - `needsValidated: true`
- Stage 4: `IN_PROGRESS`, `gates: null`

Eve:
- Stage 0: `COMPLETED`
- Stage 1: `COMPLETED`
- Stage 2: `COMPLETED`, `empathyValidated: true`
- Stage 3: `COMPLETED`, gates include:
  - `needsCaptured: true`
  - `needsConfirmed: true`
  - `needsShared: true`
  - `needsValidated: true`
- Stage 4: `IN_PROGRESS`, gates include:
  - `readyToRank: true`
  - `readyAt: 2026-05-05T00:02:34.533Z`

Strategy state:
- Six `StrategyProposal` rows existed.
- No `StrategyRanking` rows existed.

Strategy proposal descriptions in DB:
- Monthly low-stakes exploration plan where we pick one new experience together (day trip, class, neighborhood visit, or weekend away)
- Before deciding anything bigger, Adam shares what feels exciting and what feels scary
- Use pause phrase "I am scared but I am still here" when fear comes up during conversations about wanting or change
- Monthly low-stakes exploration plan where we pick one new experience together (day trip, class, neighborhood visit, or weekend away) and Adam can say what feels exciting and what feels scary before deciding anything bigger
- Use pause phrase "I am scared but I am still here" so fear doesn't become shutdown and wanting doesn't become threat
- Check in after one month, after trying one small exploration and using the pause phrase at least once

### Issue 1: Adam Cannot Mark Ready To Rank Despite Existing Strategies

Type: Stage 4 UI/backend state sync
Severity: High

What happened:
Adam reached Stage 4 and the UI showed:
- `What Comes Next`
- `Ideas So Far`
- `Strategies are being gathered from your conversation...`
- `Ready to Rank`

The `Ready to Rank` affordance did not submit Adam's readiness. After activation attempts and reloads, Adam's Stage 4 DB row still had `gates: null`.

Evidence:
- Browser showed Stage 4 / `What Comes Next`.
- Browser showed `Ready to Rank`, but the surrounding copy still said strategies were being gathered.
- DB had six `StrategyProposal` rows for the session.
- DB had Eve Stage 4 `gates.readyToRank: true`.
- DB had Adam Stage 4 `gates: null`.
- DB had no `StrategyRanking` rows.

Expected:
Once strategies exist, Adam should be able to mark ready to rank through a clear enabled CTA. That should call `POST /sessions/:id/strategies/ready`, set Adam's Stage 4 `readyToRank: true`, and move both users into the ranking phase when Eve is already ready.

Impact:
Hard blocker. Eve cannot rank because Stage 4 ranking requires both users to be ready. The session is stuck after a successful Stage 3.

Likely fix locations:
- `mobile/src/hooks/useUnifiedSession.ts`
  - strategy card creation uses `strategies.length` from client strategy query state.
- `mobile/src/screens/UnifiedSessionScreen.tsx`
  - `strategy-pool-preview` card disables the button when `strategyCount === 0`.
  - `handleMarkReadyToRank` path and error handling.
- `mobile/src/hooks/useStages.ts`
  - `useMarkReadyToRank` mutation invalidates strategies/progress but cannot help if the button never fires.
- `backend/src/controllers/stage4.ts`
  - `GET /sessions/:id/strategies` computes phase from DB strategies and both users' `readyToRank` gates.
  - `POST /sessions/:id/strategies/ready` sets `gatesSatisfied.readyToRank`.

### Issue 2: Strategy Query/UI Count Contradicts DB Strategy Rows

Type: Realtime/cache/query invalidation
Severity: High

What happened:
Adam's UI behaved as if there were zero strategies (`Strategies are being gathered from your conversation...`), while DB already had six strategies. Because the client strategy count appeared to be zero, the `Ready to Rank` button looked present but was effectively disabled.

Evidence:
- UI copy: `Strategies are being gathered from your conversation...`
- DOM snapshot still contained `Ready to Rank`.
- `StrategyProposal` table had six rows for this session.
- Stage 4 controller logic would return `COLLECTING` until both users are ready, but it should still return the existing strategies so the UI can show a nonzero count and enable the readiness CTA.

Expected:
The Stage 4 strategy query should reflect the DB proposal rows after AI strategy capture. If proposals are generated asynchronously, the UI should poll, subscribe, or invalidate when generation finishes. If strategy generation is incomplete, the UI should not show an actionable `Ready to Rank` label without explaining why it is disabled.

Likely fix locations:
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `backend/src/controllers/stage4.ts`
- backend realtime event for strategy proposal creation / generation completion

### Issue 3: Stage 4 Readiness State Is Ambiguous To The User

Type: UI clarity / state gate
Severity: Medium

What happened:
Adam saw `Ready to Rank` and a freeform chat input, but there was no current AI prompt asking for a chat response and no visible explanation that the ranking CTA was disabled because the app believed zero strategies were loaded.

Evidence:
- Browser text showed `Ideas So Far`, `Strategies are being gathered from your conversation...`, `Ready to Rank`, and `Type a message...`.
- Activating `Ready to Rank` did not change DB state.
- The UI did not indicate whether Adam should wait, type another strategy, open a strategy pool, or retry.

Expected:
Stage 4 should make the current user-owned action explicit:
- If strategies are still generating, show a waiting/generation state and hide or disable input with clear copy.
- If strategies exist, show the strategy pool and an enabled `Ready to Rank` CTA.
- If the app needs Adam to propose more strategies, ask for that in chat directly.
- If Eve is already ready, show that Adam's readiness is the remaining gate.

Likely fix locations:
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/utils/chatUIState.ts`
- `mobile/src/utils/getWaitingStatus.ts`
- `mobile/src/config/waitingStatusConfig.ts`
- `mobile/src/components/StrategyPool.tsx`

### Issue 4: Duplicate Or Superseded Strategy Proposals May Be Persisting

Type: Stage 4 strategy capture / proposal lifecycle
Severity: Medium

What happened:
DB contained six proposals that look like two generations of the same strategy set: an initial three, then a refined/composed three. If the UI query starts showing all six, users may rank duplicates or stale drafts.

Evidence:
- Two low-stakes exploration proposals exist, one shorter and one expanded.
- Two pause-phrase proposals exist, one shorter and one expanded.
- A one-month check-in proposal appears only in the later batch.

Expected:
If AI strategy generation revises the pool, superseded proposals should either be replaced, marked inactive, or hidden from ranking. If both batches are intentional, the UI should make the distinction clear.

Likely fix locations:
- `backend/src/controllers/stage4.ts`
- Stage 4 strategy capture service/prompt parser
- `StrategyProposal.status` semantics
- `mobile/src/components/StrategyPool.tsx`

### Issue 5: Stage 4 Still Uses Legacy Ranking Pool Instead Of The Planned Conversation-Led Inventory

Type: Product/design debt
Severity: Medium

What happened:
The flow reached the current legacy Stage 4 strategy-pool/ranking model. That model is expected from current code, but it does not yet match the direction in `docs/product/stage-4-tending-technical-spec.md`, which calls for conversation-led proposal inventory, needs coverage, and shared or individual closure outcomes.

Evidence:
- Stage 4 card was `Ideas So Far` / `Ready to Rank`.
- Backend state used `StrategyProposal`, `StrategyRanking`, and `readyToRank`.
- No needs-coverage audit or proposal inventory review appeared on Adam's side before the blocker.

Expected:
For the Adam/Eve successful-resolution benchmark, Stage 4 should eventually help the couple shape a small shared experiment while checking coverage of both users' needs. The current ranking gate can be a compatibility path, but it remains below the target gold flow.

Likely fix locations:
- `docs/product/stage-4-tending-technical-spec.md`
- `backend/src/controllers/stage4.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/components/StrategyPool.tsx`
- future Stage 4 state service and mobile cards

### Gold Alignment Notes

Worked well:
- Stage 1 and Stage 2 kept the Adam/Eve core tension intact: Adam's stability need was treated as real, and Eve's growth/aliveness need was not treated as abandonment.
- Adam was able to name that his shutdown is panic, not indifference.
- Eve's shared context helped Adam see that his silence makes her feel cruel for wanting things.
- Stage 3 needs were strong and gold-aligned on Adam's side: reassurance that growth does not mean abandonment, directness, permission to name fear, pacing, and enough ground to stay in the room.
- Stage 3 needs were strong and gold-aligned on Eve's side as shown to Adam: autonomy to grow, Adam staying present, and small experiments that do not force Eve to choose between love and honesty.
- The side-by-side needs reveal did not force artificial agreement; it showed distinct but potentially compatible needs.

Risks:
- Stage 4 readiness/ranking is currently a hard blocker after successful Stage 3 completion.
- The UI makes the blocker look like user indecision rather than app state mismatch.
- Strategy proposals may be duplicated or stale by the time ranking becomes available.
- The current ranking model may overfocus on choosing options before a needs-coverage conversation has happened.

## Eve Side: Invitation Acceptor

Role: Eve, invitation acceptor
Browser URL: `http://localhost:8082/session/cmoru5afm000bpxj2e3coa3ij?e2e-user-id=cmorpyysd0003pxntibmkhf9p&e2e-user-email=eve@e2e.test`
Partner: Adam, session creator/invitor

### Summary

This Eve-side run also got farther than the previous Adam/Eve report in `docs/product/adam-eve-gold-session-issues.md`. In the prior run, Eve's qualitative flow was strong but the Stage 3 `Review needs together` CTA did not open the needs drawer, so Eve's side required a local API fallback to validate the reveal. In this run, Eve accepted the invitation, completed Stages 0 through 3 through the UI, opened the side-by-side needs review, validated Adam's needs, reached Stage 4, proposed strategies, added a one-month check-in, and successfully marked herself ready to rank.

The run stopped for Eve in Stage 4 because Adam was not ready to rank. DB state showed Eve's Stage 4 gate had `readyToRank: true`, while Adam's Stage 4 row still had `gates: null`. Eve's browser did not make that state clear: after reload and after the readiness gate had already been recorded, the UI still showed `Ideas So Far`, `6 strategies ready to review`, `Ready to Rank`, and a freeform chat input instead of a clear waiting state that Adam's readiness was the remaining gate.

Qualitatively, Eve stayed aligned with the Adam/Eve successful-resolution benchmark. She named aliveness, movement, and future openness without turning that into rejection of Adam. Stage 2 helped her recognize Adam's stillness as panic and protection. Stage 3 preserved distinct but compatible needs. Stage 4 produced a plausible shared experiment: monthly low-stakes exploration, Adam naming what feels exciting and scary before larger decisions, a pause phrase for fear, and a one-month check-in.

### Comparison Against Previous Gold-Run Notes

Previous notes reviewed:
- `docs/product/adam-eve-gold-session-issues.md`
- `docs/product/james-catherine-gold-session-issues.md`
- `docs/product/james-catherine-gold-session-bug-handoff-2026-05-04.md`
- `docs/product/gold-flow-next-session-plan.md`
- `docs/product/stage-4-tending-technical-spec.md`

Fixed or improved in this Eve-side run:
- Stage 3 reveal/validation worked through the UI for Eve. `Review needs together` opened the side-by-side drawer, Eve could review Adam's needs, and `Validate needs` completed the gate without an API fallback.
- Eve's Stage 3 gates ended with `needsCaptured`, `needsConfirmed`, `needsShared`, and `needsValidated`.
- Both users advanced to Stage 4, which was not reached in the prior Eve-side run.
- The needs reveal was needs-oriented and did not use legacy common-ground framing.
- No cross-user private prompt leak was observed on Eve's side.
- Stage 2 and Stage 3 waiting behavior was improved in several places. Eve saw explicit waiting copy such as Adam reviewing shared context or deciding whether Eve's understanding captured him, rather than only seeing an old prompt near an active input.
- The Stage 2 share suggestion copy was less problematic than in the previous Eve report. The visible offer was framed as context that might help Adam understand more accurately, and the suggested focus stayed closer to the live cycle between Eve's wanting and Adam's fear.

Still open from previous runs:
- Current gate clarity remains weak. Old prompts and stage history stay visually close to the active card and input, making it hard to tell whether the current action is to type, click a CTA, or wait.
- Chat input can still remain visible when the app is not actually asking for freeform chat input. The clearest reproduction in this run is Stage 4 after Eve had already marked ready to rank.
- Realtime/cache state is still suspect. Eve's DB state had `readyToRank: true`, but Eve's UI continued to show the same `Ready to Rank` affordance and chat input.
- Stage 4 still uses the legacy strategy pool/ranking path rather than the conversation-led proposal inventory and needs-coverage flow described in `docs/product/stage-4-tending-technical-spec.md`.
- Local E2E session URLs remain fragile when servers are stopped or restarted. Restarting the backend and `8082` bundle recovered the session, but the browser first showed a mood check and then rehydrated into Stage 4.

New Eve-side issues from this run:
- The invitation acceptor URL did not leave Eve correctly joined at first. The browser showed `Partner`, the Ready action was suspicious/inert, DB state had the session `INVITED`, invitation `PENDING`, and Eve was not a relationship member. A direct invitation-accept API call fixed it and the UI then showed Adam and accepted invitation state.
- Eve's Stage 4 readiness was recorded in DB, but the UI remained actionable and stale instead of showing that Eve was waiting for Adam.
- Duplicate or superseded strategy proposals were persisted. Six proposals existed, including shorter and refined versions of the same monthly exploration and pause-phrase strategies.

### Current DB State At Stop

Checked from local Prisma against `SESSION_ID=cmoru5afm000bpxj2e3coa3ij`.

Session:
- `status: ACTIVE`

Eve:
- Stage 0: `COMPLETED`
- Stage 1: `COMPLETED`
- Stage 2: `COMPLETED`, `empathyValidated: true`
- Stage 3: `COMPLETED`, gates include:
  - `needsCaptured: true`
  - `needsConfirmed: true`
  - `needsShared: true`
  - `needsValidated: true`
- Stage 4: `IN_PROGRESS`, gates include:
  - `readyToRank: true`
  - `readyAt: 2026-05-05T00:02:34.533Z`

Adam:
- Stage 0: `COMPLETED`
- Stage 1: `COMPLETED`
- Stage 2: `COMPLETED`, `empathyValidated: true`
- Stage 3: `COMPLETED`, gates include:
  - `needsCaptured: true`
  - `needsConfirmed: true`
  - `needsShared: true`
  - `needsValidated: true`
- Stage 4: `IN_PROGRESS`, `gates: null`

Strategy state:
- Six `StrategyProposal` rows existed.
- No `StrategyRanking` rows existed.

Strategy proposal descriptions in DB:
- Monthly low-stakes exploration plan where we pick one new experience together (day trip, class, neighborhood visit, or weekend away)
- Before deciding anything bigger, Adam shares what feels exciting and what feels scary
- Use pause phrase "I am scared but I am still here" when fear comes up during conversations about wanting or change
- Monthly low-stakes exploration plan where we pick one new experience together (day trip, class, neighborhood visit, or weekend away) and Adam can say what feels exciting and what feels scary before deciding anything bigger
- Use pause phrase "I am scared but I am still here" so fear doesn't become shutdown and wanting doesn't become threat
- Check in after one month, after trying one small exploration and using the pause phrase at least once

### Issue 6: Eve's E2E Invitation URL Did Not Accept Or Join The Session Reliably

Type: E2E/local web invitation flow
Severity: High

What happened:
Opening Eve's session URL with E2E user parameters did not initially put Eve into a correct accepted-member state. The UI showed `Partner` rather than Adam, and the session state looked suspicious before the manual fix. DB inspection confirmed the session was still `INVITED`, the invitation was `PENDING`, and Eve was not yet a relationship member. A direct `POST /api/invitations/:id/accept` as Eve fixed the state; after reload, the UI showed Adam and the accepted invitation state.

Evidence:
- Browser URL included Eve's E2E identity parameters.
- UI initially showed `Partner`.
- DB showed invitation `PENDING` and session `INVITED`.
- DB showed Eve was not a relationship member.
- After the invitation accept API call, DB showed invitation `ACCEPTED`, session `ACTIVE`, and both Adam and Eve as members.
- Eve could then progress normally through the session.

Expected:
An E2E invitee URL should deterministically accept or route Eve through a visible accept step before showing session actions. The UI should not show Ready/session controls for an unaccepted invitee state, and it should not label the known partner as generic `Partner` once the invite URL includes enough identity to resolve the invitation.

Impact:
This is a setup blocker for repeatable gold-session testing and can mask product bugs as auth/session bugs. It also makes the invitee side appear logged in while not actually joined to the relationship/session.

Likely fix locations:
- E2E invitation/session entry route
- No-Clerk auth bypass user hydration
- Invitation accept hook or screen lifecycle
- `backend/src/controllers/invitations*`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

### Issue 7: Eve Is Ready To Rank In DB But The UI Still Shows Ready Controls

Type: Stage 4 UI/backend state sync
Severity: High

What happened:
Eve clicked or activated `Ready to Rank` successfully enough for DB to record `gatesSatisfied.readyToRank: true`. After server restart and reload, Eve returned to Stage 4, but the UI still showed the strategy pool preview, `Ready to Rank`, and the freeform chat input. It did not clearly state that Eve was already ready and waiting for Adam.

Evidence:
- DB showed Eve Stage 4 `gates.readyToRank: true`.
- DB showed Adam Stage 4 `gates: null`.
- Browser still showed `Ideas So Far`, `6 strategies ready to review`, `View All`, `Ready to Rank`, and `Type a message...`.
- No ranking rows existed, which is correct while Adam is not ready, but Eve's UI did not explain that this was a partner-readiness wait.

Expected:
Once Eve is ready, her UI should stop presenting the readiness CTA as the current action. It should show a waiting state such as Adam is reviewing or getting ready to rank, hide or disable the chat input unless the app explicitly asks for more strategy work, and preserve a non-actionable view of the strategy pool if useful.

Impact:
This makes a successful readiness submission look like it failed and invites duplicate action. It also obscures the real blocker: Adam's Stage 4 readiness gate.

Likely fix locations:
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/utils/chatUIState.ts`
- `mobile/src/utils/getWaitingStatus.ts`
- `backend/src/controllers/stage4.ts`

### Issue 8: Stage 4 Allows Duplicate/Superseded Strategy Proposals To Accumulate

Type: Stage 4 strategy capture / proposal lifecycle
Severity: Medium

What happened:
Eve proposed an initial strategy set and then refined it into a clearer combined plan with a check-in. DB retained both the earlier and refined versions. If ranking had unlocked, Eve and Adam may have been asked to rank duplicate or stale options.

Evidence:
- Two monthly exploration proposals existed: one shorter and one expanded to include Adam naming what feels exciting and scary.
- Two pause-phrase proposals existed: one shorter and one refined around fear not becoming shutdown and wanting not becoming threat.
- A check-in proposal existed as a later addition.
- No proposal status distinction was visible in the UI at the stop point.

Expected:
The Stage 4 proposal lifecycle should distinguish active options from superseded drafts. If a strategy set is revised, older proposals should be replaced, marked inactive, or hidden from ranking. If accumulation is intentional, the UI should cluster or explain related proposals before ranking.

Impact:
Duplicate ranking options can create false preference data and make the final way-forward agreement feel mechanical instead of conversationally tended.

Likely fix locations:
- `backend/src/controllers/stage4.ts`
- Stage 4 strategy capture/generation service
- `StrategyProposal.status` handling
- `mobile/src/components/StrategyPool.tsx`

### Issue 9: Stage 4 Input Remains Ambiguous After Strategy Readiness

Type: UI clarity / state gate
Severity: Medium

What happened:
After Eve was already ready to rank, the chat input still appeared with `Type a message...`. The UI also still showed a Stage 4 prompt area and strategy controls. Nothing made clear whether Eve should type another strategy, wait for Adam, retry readiness, or open the strategy pool.

Evidence:
- Eve's Stage 4 DB gate had `readyToRank: true`.
- Adam's Stage 4 DB gate was still missing.
- Browser still showed active chat input and readiness controls.
- No visible waiting banner identified Adam as the blocker.

Expected:
When the current user's only remaining action is waiting for the partner, the input should be hidden or explicitly reframed. If the product wants to allow additional optional strategy ideas after readiness, there should be an explicit "add another idea" affordance and readiness should either be revoked intentionally or remain clearly recorded.

Impact:
The user can accidentally type into a completed gate and contaminate the strategy pool after already signaling readiness. This is the Stage 4 version of the gate/input ambiguity documented in earlier Stage 2 and Stage 3 reports.

Likely fix locations:
- `mobile/src/utils/chatUIState.ts`
- `mobile/src/hooks/useChatUIState.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/config/waitingStatusConfig.ts`

### Gold Alignment Notes

Worked well:
- Eve's Stage 1 held the benchmark tension: she loves Adam and values their stability, but feels herself getting smaller around wanting more life, movement, and future openness.
- Stage 2 helped Eve understand Adam's stillness as fear and protection, not indifference.
- Eve's shared context was accurate to the gold transcript: wanting more does not mean she has decided to leave, but Adam's panic makes wanting feel cruel.
- Eve's Stage 3 needs were strong: room to grow without it meaning rejection, Adam staying present when she wants more, and small experiments that do not force an immediate decision about the future.
- Stage 4's strategy direction was well matched to both people: a low-stakes monthly exploration practice, Adam naming excitement and fear before larger decisions, a pause phrase for fear, and a one-month check-in.

Risks:
- The Stage 4 blocker prevents the pair from testing whether the strategy pool actually becomes a shared way-forward agreement.
- The UI currently makes Eve's completed readiness look incomplete.
- Duplicate proposals may muddy ranking if Adam's readiness blocker is fixed without proposal lifecycle cleanup.
- The current ranking model still lacks the needs-coverage inventory called for in the Stage 4 tending technical spec.

## Fix Notes

- Issue 1: Fixed locally by making `Ready to Rank` update Stage 4 progress/strategy caches optimistically and by hiding the readiness CTA once the current user's `readyToRank` gate is true. PR: local Codex patch, link pending.
- Issue 2: Fixed locally by publishing `session.strategies_updated` after Stage 4 strategy capture and refetching the strategy query on that event, so partner browsers stop holding a zero-count cache after DB rows exist. PR: local Codex patch, link pending.
- Issue 3: Fixed locally by adding a Stage 4 `strategy-readiness-pending` waiting state that hides chat input while the user is ready and the partner is not. PR: local Codex patch, link pending.
- Issue 4: Partially fixed locally by collapsing obvious superseded Stage 4 strategy drafts during micro-tag capture instead of retaining shorter duplicate drafts beside refined proposals. Full lifecycle/status modeling remains future Stage 4 inventory work. PR: local Codex patch, link pending.
- Issue 5: Not fully redesigned in this patch; the compatibility ranking path remains, but readiness and inventory syncing now align with the current Stage 4 gate contract without reintroducing removed Stage 3/common-ground behavior. PR: local Codex patch, link pending.
- Issue 6: Fixed locally for no-Clerk E2E by allowing `/sessions/:id/state` to auto-accept a ready pending invitation only when `E2E_AUTH_BYPASS=true`, making direct invitee session URLs deterministic in local gold runs. PR: local Codex patch, link pending.
- Issue 7: Fixed locally by handling the actual `partner.ready_to_rank` realtime event and deriving Eve's already-ready waiting state from DB/cache gates instead of showing `Ready to Rank` again. PR: local Codex patch, link pending.
- Issue 8: Same fix as Issue 4: obvious superseded proposal rows are removed during Stage 4 capture before inserting refined replacements. PR: local Codex patch, link pending.
- Issue 9: Same fix as Issue 3: the ready-but-waiting state now hides freeform input unless ranking opens or the strategy inventory changes. PR: local Codex patch, link pending.
