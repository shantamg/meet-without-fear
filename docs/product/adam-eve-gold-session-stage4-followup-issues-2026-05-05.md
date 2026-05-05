# Adam/Eve Gold Session Stage 4 Follow-Up Issues - 2026-05-05

Scenario: Adam/Eve successful-resolution benchmark  
Session ID: `cmos1tow4000epxzhjg829ef0`  
App: local E2E/no-Clerk web bundle on `http://localhost:8082`

This report captures a second Adam/Eve Stage 4 local E2E gold-session playthrough after the earlier `cmoru5afm000bpxj2e3coa3ij` Stage 4 report. Evidence came from both side scratch logs, Eve-side browser inspection, and local Prisma DB checks.

## Adam Side: Invitor

Role: Adam, session creator/invitor  
Browser URL: `http://localhost:8082/session/cmos1tow4000epxzhjg829ef0?e2e-user-id=cmorpyyqi0002pxnt18abhy7t&e2e-user-email=adam@e2e.test`  
Partner: Eve, invitation acceptor

### Summary

Adam's side completed Stages 0 through 3 without the previous Stage 3 reveal blocker. Adam reviewed the side-by-side needs, validated them, entered Stage 4, and proposed a concrete reversible experiment: Eve names a small new thing she wants to try, Adam asks curious questions for ten minutes before reacting, they choose a low-cost reversible version, and they check in Sunday at 7pm.

Adam then reached the strategy pool, marked readiness, ranked three choices, saw overlap on the shared pause-phrase strategy, and clicked `Create Agreement`. The backend created the proposed agreement and marked Adam's side agreed, but Adam's UI stayed on the overlap card with `Create Agreement` still visible. At handoff, Adam had no legitimate further action unless the stale UI was bypassed or Eve confirmed the agreement.

### Adam-Side Findings From Scratch Log

#### Stage 4 Strategy Gathering Status May Not Expose The Next Action

Type: UI / state-machine  
Severity: Medium

What happened:
Adam saw `Ideas So Far`, `Strategies are being gathered from your conversation...`, and `Ready to Rank` before a clear actionable ranking control was available. Typing a readiness-style message moved the flow into strategy drafting.

Evidence:
- Adam DOM showed `Ready to Rank` as visible text but no accessible ranking drawer opened at that point.
- After Adam typed that he was ready to look at strategies, the AI prompted him for a concrete low-risk experiment.
- Eve later reproduced the same ambiguous `Strategies are being gathered...` state from the other side.

Expected:
Stage 4 should clearly distinguish waiting for strategy generation, asking the user to add strategy ideas, and offering an enabled ranking/review action.

Likely fix locations:
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/components/StrategyPool.tsx`

#### Strategy Pool Contains Near-Duplicate Ideas

Type: UI / eval coverage  
Severity: Medium

What happened:
Adam's strategy pool contained multiple near-duplicate variants of the same experiment, including overlapping versions of the curious-questions evening, low-cost reversible activity, and follow-up check-in.

Expected:
Ranking should present meaningfully distinct strategies or consolidate related variants into one coherent proposal with steps.

Likely fix locations:
- Stage 4 strategy extraction/deduplication
- `backend/src/controllers/stage4.ts`
- `mobile/src/components/StrategyPool.tsx`

#### Agreement Creation Persists But UI Stays On Create Button

Type: UI / state-machine  
Severity: High

What happened:
Adam clicked `Create Agreement` from the overlap reveal. DB created agreement `cmos3af3000h0pxzhu0n8r90f`, but Adam's UI still showed `Create Agreement` after reload.

Evidence:
- Agreement description: `Create a pause phrase both can use when either starts shutting down, so the conversation can resume later`.
- DB state: `status: PROPOSED`, `agreedByA: true`, `agreedByB: false`.
- Adam UI remained on the overlap card rather than showing a proposed-agreement or waiting state.

Expected:
After agreement creation, Adam should see that the agreement was proposed and is awaiting Eve, and the create CTA should be replaced or disabled.

Likely fix locations:
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/components/OverlapReveal.tsx`
- `backend/src/controllers/stage4.ts`

## Eve Side: Invitation Acceptor

Role: Eve, invitation acceptor  
Browser URL: `http://localhost:8082/session/cmos1tow4000epxzhjg829ef0?e2e-user-id=cmorpyysd0003pxntibmkhf9p&e2e-user-email=eve@e2e.test`  
Partner: Adam, session creator/invitor

### Summary

Eve completed the full flow through Stage 4 agreement proposal. Qualitatively, the run was strong: Stage 2 helped Eve move from reading Adam's silence as rejection toward understanding it as panic/fear, without erasing the cost to her. Stage 3 captured Eve's core needs around aliveness, becoming, autonomy from managing Adam's fear, emotional presence, open future, and loving without containment. Stage 4 produced gold-aligned strategies: a reversible day trip/class, Adam naming excitement and fear, a pause phrase for shutdown, and a follow-up check-in.

The main failures were not prompt quality; they were realtime/cache and action-state failures. Eve repeatedly saw stale UI after the DB had advanced: Stage 3 wait copy after both users reached Stage 4, a grey strategy-gathering panel while strategies already existed, a ranking screen after her ranking had been submitted, and `Create Agreement` after the agreement had already been created.

### Comparison Against Previous Gold-Run Notes

Previous notes reviewed:
- `docs/product/adam-eve-gold-session-issues.md`
- `docs/product/adam-eve-gold-session-stage4-issues-2026-05-05.md`
- `docs/product/james-catherine-gold-session-bug-handoff-2026-05-04.md`
- `docs/product/gold-flow-next-session-plan.md`
- `docs/product/stage-4-tending-technical-spec.md`

Fixed or improved:
- Stage 3 reveal/validation worked through UI for both sides in this run.
- Both users reached Stage 4 and submitted rankings.
- The side-by-side needs reveal stayed needs-oriented and did not present AI-authored common ground as product truth.
- Stage 4 found a plausible shared strategy overlap instead of blocking before ranking.
- No cross-user private prompt leak was observed from Eve's side.

Still open or newly reproduced:
- Stage 2 can still show completion/validation copy before the partner has actually finished refining.
- Current action state remains stale after backend transitions.
- Stage 4 strategy inventory can show zero/gathering while DB rows already exist.
- Stage 4 proposal pool includes near-duplicates.
- Stage 4 lacks the needs-coverage inventory called for in `stage-4-tending-technical-spec.md`.
- Agreement creation does not update the proposing user's UI.

### Current DB State At Stop

Checked from local Prisma against `SESSION_ID=cmos1tow4000epxzhjg829ef0`.

Session:
- `status: ACTIVE`
- Members:
  - Adam: `cmorpyyqi0002pxnt18abhy7t`, `adam@e2e.test`
  - Eve: `cmorpyysd0003pxntibmkhf9p`, `eve@e2e.test`

Stage progress:
- Adam Stage 0-3: `COMPLETED`
- Adam Stage 4: `IN_PROGRESS`, gates include `readyToRank: true`, `rankingSubmitted: true`
- Eve Stage 0-3: `COMPLETED`
- Eve Stage 4: `IN_PROGRESS`, gates include `readyToRank: true`, `rankingSubmitted: true`

Needs:
- Adam confirmed needs around stability not making him small/wrong, reassurance that Eve values what they built, steadiness for emotional risk, and change inside commitment.
- Eve confirmed needs around aliveness/becoming, wanting without managing Adam's fear, Adam staying engaged during growth/change conversations, an open future, and loving without becoming smaller.

Strategy state:
- 9 `StrategyProposal` rows existed.
- Both users submitted `StrategyRanking` rows.
- Shared overlap selected the pause-phrase strategy.

Agreement state:
- Agreement `cmos3af3000h0pxzhu0n8r90f`
- Description: `Create a pause phrase both can use when either starts shutting down, so the conversation can resume later`
- Type: `MICRO_EXPERIMENT`
- Status: `PROPOSED`
- `agreedByA: true`
- `agreedByB: false`

### Issue 1: Previously Visible AI Messages Reanimated After Eve Shared Empathy

Type: UI animation / chat rendering  
Severity: Medium  
Status: fixed locally during run

What happened:
After Eve shared empathy, multiple previously visible AI messages replayed their typewriter animation one at a time.

Evidence:
- User observed the behavior live immediately after Eve shared empathy.
- Code inspection showed already-rendered AI items could later be promoted into the animation queue after button-only actions because only typed `USER` messages were treated as a response boundary.

Expected:
Once a chat item has rendered visibly, it should never typewrite again for that session, even after refetches, status changes, or share/reconciler updates.

Likely fix locations:
- Patched `mobile/src/components/ChatInterface.tsx`
- Added regression coverage in `mobile/src/components/__tests__/ChatInterface.test.tsx`

### Issue 2: Missing Typing Indicator After Button-Only Empathy Actions

Type: UI loading state  
Severity: Medium  
Status: fixed locally during run

What happened:
After Eve shared empathy, there was a pause before the AI follow-up arrived and no three-dot typing indicator appeared.

Evidence:
- User observed missing dots live.
- Code inspection showed `ChatInterface` derives dots from the last `USER` message, but empathy share/resubmit are button-only actions.
- First share also waits on `saveDraftAsync` before the consent mutation starts, and resubmit had no pending flag wired into chat loading.

Expected:
Button-only actions that trigger AI follow-up should show the same typing indicator until the AI response or transition message is inserted.

Likely fix locations:
- Patched `mobile/src/hooks/useUnifiedSession.ts`
- Patched `mobile/src/screens/UnifiedSessionScreen.tsx`

### Issue 3: Eve Saw Completion Copy Before Adam Was Done Refining

Type: UI / backend state / waiting-state  
Severity: Medium

What happened:
After Eve shared her empathy statement, Eve saw completion-style copy: `Both of you have now put in the vulnerable work of trying to understand each other's perspective. Next, you'll each read what the other person wrote...` The UI later settled into a wait state saying Adam was deciding whether to share more context.

Evidence:
- Eve browser showed the completion/validation copy before later showing the Adam wait copy.
- DB inspection during the run showed Adam's empathy attempt was still `REFINING`.
- Eve Stage 2 was still `IN_PROGRESS`.
- Adam-side recent messages showed Adam was still responding to Eve's shared context.

Expected:
Eve should see wait copy that matches the live gate until both empathy attempts are actually ready for validation. The product should not imply both users have finished the mutual understanding work while one partner is still refining.

Impact:
This can make the Stage 2 validation/reveal sequence feel out of order and undermines trust in whether the current visible instruction is live state or stale history.

Likely fix locations:
- `backend/src/controllers/stage2.ts`
- `backend/src/services/reconciler/sharing.ts`
- `mobile/src/utils/getWaitingStatus.ts`
- `mobile/src/config/waitingStatusConfig.ts`

### Issue 4: Eve Saw Stage 3 Waiting Copy After Both Users Advanced To Stage 4

Type: realtime / cache / waiting-state  
Severity: High

What happened:
Eve's main screen continued to say `Adam is reviewing the needs you both shared.` after DB showed both users had completed Stage 3 and both had Stage 4 `IN_PROGRESS` rows. The header showed `New activity available`; clicking `Open exchange history` refreshed the visible state into Stage 4.

Evidence:
- DB showed Adam and Eve Stage 3 `COMPLETED` with `needsValidated: true`.
- DB showed both users Stage 4 `IN_PROGRESS`.
- Stage 4 transition messages existed at `2026-05-05T03:42:22Z`.
- Eve DOM still showed the stale Stage 3 wait copy until the activity control was opened.

Expected:
The main waiting state should consume the same realtime/session update that raised `New activity available` and automatically replace Stage 3 wait copy with the correct Stage 4 state.

Likely fix locations:
- `mobile/src/hooks/useRealtime.ts`
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/utils/getWaitingStatus.ts`
- `mobile/src/config/waitingStatusConfig.ts`

### Issue 5: Stage 4 Strategy Panel Looked Blocked Until Eve Chatted Again

Type: UI / realtime / cache / backend state  
Severity: High

What happened:
Eve's Stage 4 screen showed a greyed `Ideas So Far` panel with `Strategies are being gathered from your conversation...`, while also showing `Ready to Rank` and an open chat box. It was unclear whether Eve should wait, chat more, or rank. After Eve sent one more strategy message, the panel updated to `9 strategies ready to review` and `View All`.

Evidence:
- Before Eve's extra chat, DB already had 7 `StrategyProposal` rows.
- After Eve chatted about a reversible day trip/class and pause phrase, DB had 9 strategies and the strategy pool rendered.
- This means the prior `Strategies are being gathered...` copy was stale or misleading, not an accurate empty-state.

Expected:
If strategies exist, Stage 4 should show the available count and review CTA immediately. If more chat is required, the copy should explicitly ask for more strategy ideas.

Likely fix locations:
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `backend/src/controllers/stage4.ts`
- strategy proposal realtime/cache invalidation

### Issue 6: Ranking Submit Succeeded In DB But Eve Still Saw Active Submit

Type: UI / realtime / cache / backend state  
Severity: High

What happened:
Eve selected three ranking choices and submitted. DB recorded her `StrategyRanking` row and set Eve Stage 4 gates to `rankingSubmitted: true`, but the browser remained on `Rank Your Top Choices` with `Submit my ranking` still active after multiple checks.

Evidence:
- DB showed Eve ranking with three ranked IDs and `submittedAt: 2026-05-05T03:48:12.282Z`.
- Eve Stage 4 gates included `readyToRank: true`, `rankingSubmitted: true`, and `rankingSubmittedAt`.
- DOM still showed the active submit button.

Expected:
After ranking submit succeeds, Eve should transition to a submitted/waiting state until Adam submits, or to overlap reveal if Adam has already submitted.

Likely fix locations:
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- ranking mutation success handling and `stageKeys.progress(sessionId)` invalidation

### Issue 7: Agreement Creation Succeeded In DB But Eve Still Saw Create Agreement

Type: UI / realtime / cache / backend state  
Severity: High

What happened:
After both users submitted rankings, Eve saw shared overlap on the pause phrase and clicked `Create Agreement`. DB created the agreement and marked Eve's side agreed, but Eve's UI stayed on the same `Create Agreement` button.

Evidence:
- Agreement `cmos3af3000h0pxzhu0n8r90f` exists.
- `status: PROPOSED`
- `agreedByA: true`
- `agreedByB: false`
- Eve DOM still showed active `Create Agreement`.

Expected:
After successful agreement creation, Eve should see that the agreement was proposed and is awaiting Adam, or a clear pending/confirmation state. The create CTA should not remain available for the same strategy.

Likely fix locations:
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `backend/src/controllers/stage4.ts`
- agreement query invalidation and `agreement.proposed` event handling

### Gold Standard Alignment Review

| Stage | Expected gold beat | Live evidence | Rating | Notes / fix |
| --- | --- | --- | --- | --- |
| Stage 1 Eve | Eve is heard as slowly disappearing and grieving aliveness, not simply dissatisfied or leaving. | Eve named feeling trapped/lonely and missing the early version where she felt alive with Adam; the AI reflected sadness and not wanting to leave prematurely. | Pass | Keep. |
| Stage 2 Eve | Eve moves from "he is choosing comfort over me" toward seeing Adam's fear and stability as care/protection, without erasing her cost. | Eve reframed Adam's silence as panic/fear and said she could hold more tenderness while still needing him to stay present. | Pass | Keep. |
| Stage 3 Eve | Eve's needs include room to grow, wanting without apology, Adam staying present, and small real experiments. | Confirmed needs included aliveness/becoming, wanting without managing Adam's fear, emotional presence, open future, and loving without containment. | Pass | Keep. |
| Stage 3 reveal | The flow shows compatibility and tension without flattening the issue into "travel more" or "be content." | Side-by-side reveal showed Adam's steadiness/reassurance needs and Eve's aliveness/open-future needs without AI-authored common ground. | Pass | Keep. |
| Stage 4 | Strategies preserve both stability and aliveness. | Strategy pool included reversible exploration, Adam naming excitement/fear, a pause phrase, and a check-in. | Pass | Qualitative strategy direction was good despite UI state bugs. |
| Stage 4 | The AI checks whether strategies cover Adam's safety/pacing and Eve's growth/aliveness. | Current legacy ranking path found overlap but did not show an explicit needs-coverage audit. | Partial | Align with `stage-4-tending-technical-spec.md` proposal inventory / coverage audit. |
| Closure | The pair can move toward shared experiments without pretending the deeper tension is permanently solved. | A micro-experiment agreement was proposed around the pause phrase, but final mutual confirmation was blocked by stale UI. | Partial | Agreement confirmation UI/state needs fixing. |
| Tending | Follow-up checks whether experiments helped both stability and aliveness, not just whether tasks were done. | Adam proposed a Sunday 7pm check-in and Eve ranked a check-in option; persisted Tending was not reached. | Partial | Tending persistence remains future Stage 4 work. |

### Gold Alignment Notes

Worked well:
- Eve's qualitative arc preserved both her longing and love for Adam.
- Adam's needs were not treated as resistance; Eve could recognize fear and stability as meaningful.
- Stage 3 needs were universal and user-confirmed, not narrow demands.
- Stage 4 strategy content was strongly aligned with the Adam/Eve benchmark.
- The final overlap on a pause phrase is a credible small shared experiment.

Risks:
- Realtime/cache bugs make successful actions look failed.
- The user may repeat actions, type unnecessary extra chat, or distrust the flow.
- Strategy duplicates can turn a relationally good plan into a mechanical ranking exercise.
- Current Stage 4 still lacks the planned coverage inventory and clearer shared/individual closure model.

## Fix Notes / Follow-Up Targets

Most urgent engineering cluster:
- Stage 4 query invalidation and realtime handling for strategy creation, readiness, ranking submission, overlap, and agreement creation.
- Submitted/pending UI states for the current user after mutations succeed.
- Agreement proposal rendering for both proposer and partner.
- Deduplication or lifecycle status for superseded strategy proposals.

Already patched locally during the Eve-side investigation:
- Prevent already-seen AI chat items from replaying typewriter animation.
- Show typing indicator for button-only empathy share/resubmit work.

Suggested next report/check:
- Have the Adam-side Codex verify whether Adam can see Eve's final agreement state after Eve-side confirmation is fixed or manually refreshed.
