# James/Catherine Gold Session Bug Handoff - 2026-05-04

## James-Side Report

### Session Context

- Scenario: James/Catherine no-shared-agreement benchmark.
- Codex role: James only.
- App: local E2E/no-Clerk web bundle on `http://localhost:8082`.
- James URL:
  `http://localhost:8082/session/cmoqxuweg00bxpx2vti5d7jvg?e2e-user-id=cmoqxuw0b00brpx2vsake9pb9&e2e-user-email=james-gold-1777883375@e2e.test`
- Catherine direct E2E URL:
  `http://localhost:8082/session/cmoqxuweg00bxpx2vti5d7jvg?e2e-user-id=cmoqxuw1w00bspx2vws01qi88&e2e-user-email=catherine-gold-1777883375@e2e.test`
- Session id: `cmoqxuweg00bxpx2vti5d7jvg`.

### 1. E2E Auth Identity Cache Drift

Status: patched locally during this session.

What happened:
- Opening an E2E URL on the normal `8081` bundle showed generic `Partner` instead of Catherine.
- The same session on `8082` E2E mode showed `Catherine` correctly.
- Root cause found in `mobile/src/providers/E2EAuthProvider.tsx`: `getE2EUserFromURL()` returned `cachedE2EUserInfo` before reading explicit URL params, so the first E2E identity could bleed into later navigations.

Patch applied:
- Explicit `e2e-user-id` / `e2e-user-email` URL params now override the cached identity.
- Cache is still used as fallback when client-side navigation drops query params.

Verification:
- `npm --workspace mobile run check` passed.
- Repo-wide lint with `--max-warnings=0` still fails on existing warnings unrelated to this patch.

Likely follow-up:
- Add a focused test for switching E2E identities by URL param in the same web runtime.

### 2. Skill/Run Setup Footgun: `8081` Normal Bundle Does Not Honor E2E Mode Reliably

What happened:
- Initial local app on `8081` accepted E2E query params syntactically but behaved like the normal bundle.
- Correct behavior required starting `8082` with:
  `EXPO_PUBLIC_E2E_MODE=true EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web --port 8082 --no-dev`

Expected:
- Gold-session tester runs should prefer `8082` E2E mode even if `8081` is already running.

Suggested skill/doc note:
- If the in-app browser is blank and a no-Clerk session is requested, start/use `8082`; do not trust E2E query params on a normal `8081` web bundle.

### 3. Stage 2 -> Stage 3 Realtime/Stale UI

What happened:
- After both empathy attempts were validated, backend had advanced both users to Stage 3:
  - `myProgress.stage: 3`
  - `partnerProgress.stage: 3`
  - session status `ACTIVE`
- James UI remained on Stage 2 / `Walking in Their Shoes` until browser reload.
- After reload, James correctly saw Stage 3 / `What Matters Most`.

Expected:
- James UI should transition live to Stage 3 when backend progress advances.

Evidence:
- Before reload, UI still showed Stage 2 while `/api/sessions/:id/progress` returned Stage 3 for both users.
- Reload fixed the displayed stage.

Likely fix areas:
- Realtime stage-progress invalidation/subscription.
- Mobile session query invalidation after empathy validation/reveal completion.
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- backend realtime publish path for Stage 2 completion/Stage 3 creation.

### 4. Stage 3 Premature “Both Lists Are Ready” Prompt

What happened:
- James completed his Stage 3 needs exploration.
- MWF said: “Catherine has been doing the same work on her side. You’re both ready to see what each of you needs. When you’re ready, I’ll show you both lists side by side.”
- Backend contradicted this:
  - James progress: Stage 3 `IN_PROGRESS`
  - Catherine progress: Stage 3 `IN_PROGRESS`
  - `/needs`: `needs: []`, `extracting: false`, `synthesizedAt: null`
  - `/needs/comparison`: `myNeeds: []`, `partnerNeeds: []`, `analysisComplete: false`

Expected:
- MWF should not promise side-by-side needs until both users have completed the documented Stage 3 gates.
- If only James is ready, UI should clearly say he is waiting for Catherine or show the correct one-sided review/confirm gate.

Impact:
- Serious Stage 3 process/gating bug.
- Especially risky for James/Catherine benchmark because it creates false readiness and can imply mutual progress/agreement before Catherine has completed her side.

Likely fix areas:
- Stage 3 prompt contract in `backend/src/services/stage-prompts.ts`.
- Message controller/orchestrator stage routing in `backend/src/controllers/messages.ts` and/or `backend/src/services/ai-orchestrator.ts`.
- Stage 3 gate/status helpers in `backend/src/controllers/stage3.ts`.
- Mobile waiting state helpers:
  - `mobile/src/utils/getWaitingStatus.ts`
  - `mobile/src/config/waitingStatusConfig.ts`
  - `mobile/src/utils/chatUIState.ts`

### 5. “I’m Ready” Routed As Normal Chat Instead Of Reveal/Extraction Gate

What happened:
- After the premature prompt, James sent: “I’m ready to see the lists.”
- Backend saved the user message as Stage 3 chat.
- AI replied with generic fallback: “I’m here with you. Could you tell me more about what you’re experiencing?”
- Needs extraction/reveal did not run.

Expected:
- There should be an explicit CTA/gate for needs review/confirmation/reveal.
- If conversational “ready” is supported, it should map to the same backend action as the CTA.
- If the reveal is not actually available, the prompt should not ask for readiness.

Evidence:
- Latest messages showed the “I’m ready” user message followed by the fallback AI response.
- `/needs` and `/needs/comparison` remained empty after waiting.

Likely fix areas:
- Stage 3 transition/gate handling in `backend/src/controllers/messages.ts`.
- Explicit CTA rendering in `mobile/src/screens/UnifiedSessionScreen.tsx`.
- Stage 3 needs extraction endpoint invocation and UI state.

### 6. Ghost Typing / Pending Dots Can Stick After Invalid Stage 3 Ready Path

What happened:
- User observed ghost typing dots after the invalid “I’m ready” path.
- No meaningful response or reveal came back.
- Backend state showed no extraction in progress: `extracting: false`.

Expected:
- Typing/pending UI should resolve when the request completes, errors, or falls through.
- If no backend operation is running, UI should not show a persistent typing indicator.

Likely fix areas:
- Streaming/pending state cleanup in:
  - `mobile/src/hooks/useStreamingMessage.ts`
  - `mobile/src/hooks/useUnifiedSession.ts`
  - `mobile/src/components/ChatInterface.tsx`
- Error/fallback path in message send mutation.

### 7. Internal Implementation Language Leaks To User

What happened:
- User-facing copy displayed “internal reconciler” in multiple places, including:
  - Share suggestion modal: “Our internal reconciler has reviewed...”
  - After resubmitting empathy draft: “The internal reconciler will review your updated statement...”

Expected:
- User-facing copy should not expose implementation names.
- Suggested replacement language: “I’ll review this” / “I’ll check whether this gets closer to what Catherine shared” / “I’ll help compare the two perspectives.”

Impact:
- UI polish/product trust issue.
- Also violates explicit gold-session watch item: no internal implementation language in user-facing copy.

Likely fix areas:
- Reconciler/share offer copy in backend and mobile:
  - `backend/src/services/reconciler/*`
  - `backend/src/services/stage-prompts.ts`
  - `mobile/src/screens/UnifiedSessionScreen.tsx`
  - sharing/reconciler UI components.

### 8. Share Suggestion Draft Could Excuse Escalation

What happened:
- James was offered a draft:
  “...that erasure makes me feel cornered and furious in ways I can’t always control.”
- This phrasing risks excusing volatility or asking Catherine to accept lack of control.
- We refined it to:
  “When conflicts happen, I feel like our entire six years together gets erased and I’m reduced to just ‘the guy with the temper.’ That’s when I get most defensive and angry—but I know my anger is still mine to handle.”

Expected:
- James drafts should preserve his experience while maintaining accountability for escalation.
- For this benchmark, drafts should not minimize volatility or blur safety boundaries.

Likely fix areas:
- Reconciler/share suggestion prompt instructions.
- Safety/accountability wording constraints for James/Catherine-like scenarios.

### 9. Stage 3 Prompt Is Mildly Resolution-Biased For No-Agreement Benchmark

What happened:
- Stage 3 opened with:
  “What do you need most from this situation to feel resolved and move forward together?”
- In James/Catherine, Catherine may not want repair/reconciliation. The benchmark expects no forced shared agreement and dignified individual outcomes.

Expected:
- Stage 3 should support “move forward” without assuming “together.”
- Better wording: “What do you need most from this situation to feel clear, grounded, or able to move forward - whether together or separately?”

Likely fix areas:
- Stage 3 opening prompt in `backend/src/services/stage-prompts.ts`.
- Any Stage 3 UI copy that assumes repair or shared agreement.

### 10. Activity/Drawer UX Confusion

What happened:
- “Open exchange history” drawer remained open while chat input and modals were also active, making current state hard to inspect.
- Text click on “Close exchange history” did not dismiss at first; role-based button click did.
- It was easy to confuse the history drawer with current gate modals.

Expected:
- Drawer close behavior should be reliable.
- Current action gate should not be visually obscured by exchange history.

Likely fix areas:
- Activity drawer/modal layering and close hit target.
- `mobile/src/components/ActivityDrawer.tsx`
- `mobile/src/components/ActivityMenuModal.tsx`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

### Gold-Alignment Notes

Worked well:
- Stage 1 James track listened without flattening his defensiveness.
- Stage 2 helped James move from “she thinks I’m the problem” toward understanding Catherine’s exhausted/sad clarity and safety needs.
- Catherine’s empathy statement for James was strong: it named his fear of not being enough while preserving Catherine’s boundary that understanding volatility does not make escalation safe.
- Stage 3 James needs exploration handled non-guaranteed outcome well once in the conversation.

Main failing area:
- Product/state gating around Stage 3 is not trustworthy. The AI can say both users are ready even when backend needs are empty and Catherine has not completed her side.

### Suggested First Fix Order

1. Remove all user-facing “internal reconciler” copy.
2. Fix Stage 3 prompt/gate contract so side-by-side reveal is never promised until backend gates are satisfied.
3. Ensure Stage 3 readiness has an explicit CTA and backend action, not free-text “I’m ready” chat.
4. Fix realtime invalidation for Stage 2 -> Stage 3 transition.
5. Add regression coverage for James/Catherine no-shared-agreement path:
   - no forced “move forward together” copy,
   - no needs reveal before both users complete/confirm/share,
   - no AI-authored common-ground truth before consented reveal,
   - no internal implementation terms in UI.

## Catherine-Side Report

### Session Context

- Scenario: James/Catherine golden no-shared-agreement path.
- Codex role: Catherine only.
- Session ID: `cmoqxuweg00bxpx2vti5d7jvg`.
- Catherine URL: `http://localhost:8082/session/cmoqxuweg00bxpx2vti5d7jvg?e2e-user-id=cmoqxnltn008mpx2vwfmaewai&e2e-user-email=catherine@e2e.test`
- Backend: local E2E auth bypass, API on `localhost:3000`, mobile web on `localhost:8082`.
- Main benchmark: support a dignified no-agreement path without forcing repair, leaking private/internal state, or advancing Stage 3 without confirmed, user-controlled needs.

### Summary

The Catherine-side run mostly preserved the no-forced-agreement posture in prompt behavior, especially once Stage 3 reached the needs comparison. The run still exposed product/state and prompt-output bugs that should be fixed before trusting the flow:

- Internal implementation language is shown to users.
- A Stage 3 prompt leaked model/planner text directly into chat.
- Reconciler refinement instructions are persisted/displayed as normal user chat.
- Catherine briefly saw a partner-addressed Stage 3 prompt on her authenticated URL.
- Stage 2/3 waiting states and CTAs can become stale until reload.
- Stage 3 presented side-by-side needs without persisting `IdentifiedNeed` records or clear Stage 3 gates.

### C1. Internal Reconciler Language Appears In User-Facing Copy

Type: Prompt / UI copy.

Evidence:

- Stage 2 share suggestion dialog showed: `Our internal reconciler has reviewed...`
- Stage 2 post-resubmit message showed: `The internal reconciler will review your updated statement...`
- Similar James-side copy appeared in DB messages.

Expected:

- User-facing copy should describe the facilitator/process, not implementation internals.
- Example direction: "I've reviewed what each of you shared..." or "I'll check whether this helps them feel understood..."

Likely fix locations:

- `backend/src/services/stage-prompts.ts`
- `backend/src/controllers/stage2.ts`
- Stage 2 reconciler response templates/services.

### C2. Prompt/Planner Text Leaked Into Stage 3 Side-By-Side Reveal

Type: Serious prompt bug.

Evidence from Catherine chat:

```text
— so both lists should be available. I should present both lists side by side and open with a noticing question. Here's what matters to each of you:
```

Expected:

- The message should start directly with user-facing facilitation, e.g. "Here's what matters to each of you..."
- No hidden reasoning, planning, or instruction text should be emitted.

Likely fix locations:

- `backend/src/services/stage-prompts.ts`
- `backend/src/controllers/stage3.ts`
- Model output post-processing / prompt contract for Stage 3 needs reveal.

### C3. Refinement Instructions Are Displayed As Normal Chat Messages

Type: UI / message-model / privacy-boundary bug.

Evidence:

```text
Refine empathy draft: Make this less diagnosing and less absolute...
Refine empathy draft: Remove the phrase about facing something unbearably painful...
```

Expected:

- Draft/refinement control instructions should be private tool/control input, not regular conversation turns.
- They should not appear as user-authored chat content in the main session timeline or exchange history.

Likely fix locations:

- `backend/src/controllers/stage2.ts`
- `backend/src/controllers/messages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- Message role/schema handling if refinement needs a separate non-chat role.

### C4. Catherine Briefly Saw A Stage 3 Prompt Addressed To James

Type: Realtime / cache / isolation bug.

Evidence:

- On Catherine's authenticated URL, immediately after Stage 2 completion, browser displayed:

```text
James, thank you for taking the time to really understand Catherine's experience. Now I'd like to invite you...
```

- Reload corrected it to:

```text
Catherine, thank you for taking the time to truly understand where James is coming from...
```

Expected:

- Catherine should never see a partner-addressed AI message as her active prompt.
- `forUserId` isolation should be respected across realtime transitions without requiring reload.

Likely fix locations:

- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `backend/src/services/realtime.ts`
- `backend/src/controllers/messages.ts`

### C5. Stale/Misleading Stage 2 Wait State Until Reload

Type: UI state / realtime / stage-gate bug.

Evidence:

- After Catherine shared her empathy statement, UI said both users would read and validate statements, but DB showed both attempts still `AWAITING_SHARING`.
- Chat input was still visible during "Checking how well you captured their perspective..."
- Reload changed the UI to the correct next action: `Help James understand you better`.

Expected:

- UI should show the current reconciler state without reload.
- If blocked, input should be hidden/disabled unless a real user action is expected.
- Copy should not claim validation is next when the backend requires context-sharing/refinement first.

Likely fix locations:

- `mobile/src/utils/getWaitingStatus.ts`
- `mobile/src/config/waitingStatusConfig.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/hooks/useUnifiedSession.ts`
- `backend/src/services/realtime.ts`

### C6. Stage 3 Needs Were Shown But Not Persisted As `IdentifiedNeed`

Type: Backend state / Stage 3 gate bug.

Evidence:

- After Catherine completed Stage 3 needs articulation and side-by-side reveal, DB showed Stage 3 still `IN_PROGRESS` with `gates: null`.
- `UserVessel.identifiedNeeds` was empty for both Catherine and James, despite the UI presenting side-by-side needs for both users.

Expected:

- Stage 3 needs should be captured in structured state before side-by-side reveal.
- Gates should distinguish at least:
  - needs captured/confirmed by user
  - consent to reveal
  - side-by-side reveal shown
  - user noticing/validation complete
- The UI should not present AI-synthesized needs as product truth without confirmed/persisted needs records.

Likely fix locations:

- `backend/src/controllers/stage3.ts`
- `backend/src/services/stage-prompts.ts`
- `backend/prisma/schema.prisma` usage around `UserVessel` / `IdentifiedNeed`
- `mobile/src/hooks/useStages.ts`

### C7. Stage 3 Reveal May Be Triggered By Chat Text Instead Of Explicit Consent CTA

Type: UX / consent-gate bug.

Evidence:

- After MWF said it would show side-by-side needs "when you're ready," no dedicated CTA appeared in the DOM.
- Sending `I'm ready to see them side by side.` in chat triggered the reveal.

Expected:

- Side-by-side needs reveal should use an explicit consent/continue CTA when possible.
- Chat text should not be the only apparent mechanism for a privacy-sensitive reveal step.

Likely fix locations:

- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/hooks/useStages.ts`
- `backend/src/controllers/stage3.ts`

### C8. Stage 2/3 Language Still Sometimes Implies "Moving Forward Together"

Type: Prompt-quality issue.

Evidence:

- Stage 2 intro said users would "eventually work on a way forward together."
- Catherine explicitly had to clarify that "moving forward together" may not mean staying together.

Expected:

- James/Catherine no-agreement path should avoid implying repair, reconciliation, or shared agreement.
- Better language: "move toward clarity about what is possible" or "decide what, if anything, can be done next."

Likely fix locations:

- `backend/src/services/stage-prompts.ts`
- Stage 2 and Stage 3 transition prompts.

### Catherine-Side Gold-Alignment Notes

What worked well:

- Stage 1 listened to Catherine without asking her to soften or reconcile.
- Stage 2 allowed Catherine to recognize James's perspective while preserving that volatility was not safe.
- Stage 3 eventually honored non-agreement: it named that James's needs are about recognition while Catherine's are about safety and whether she can stay.
- The facilitator explicitly accepted that no shared agreement may be the honest outcome.

What still needs protection:

- Do not convert Catherine's safety/accountability needs into a neat shared overlap.
- Do not treat James's need for recognition as requiring Catherine to minimize harm.
- Do not reveal side-by-side needs until both users' needs are user-confirmed and consented.

### Catherine-Side Reproduction Checks

DB query pattern:

```bash
cd /Users/shantam/Software/meet-without-fear/backend
npx tsx -e 'import "dotenv/config"; import { PrismaClient } from "@prisma/client"; (async()=>{ const prisma=new PrismaClient(); const sessionId="cmoqxuweg00bxpx2vti5d7jvg"; const progress=await prisma.stageProgress.findMany({where:{sessionId},include:{user:true},orderBy:[{stage:"asc"},{userId:"asc"}]}); const vessels=await prisma.userVessel.findMany({where:{sessionId},include:{user:true,identifiedNeeds:{orderBy:{createdAt:"asc"}}}}); console.log(JSON.stringify({progress:progress.map(p=>({user:p.user.name,stage:p.stage,status:p.status,gates:p.gatesSatisfied,completedAt:p.completedAt})), vessels:vessels.map(v=>({user:v.user.name,needs:v.identifiedNeeds.map(n=>({need:n.need,category:n.category,confirmed:n.confirmed,createdAt:n.createdAt}))}))},null,2)); await prisma.$disconnect(); })().catch(e=>{console.error(e);process.exit(1);});'
```

Expected future test assertions:

- No user-visible message contains `internal reconciler`, `I should`, or other model/planner language.
- Refinement controls do not produce normal `USER` chat messages.
- Catherine never sees `forUserId=James` AI content as her active prompt after realtime transitions.
- Waiting states hide chat input unless user action is valid.
- Stage 3 side-by-side reveal requires persisted, confirmed, consented needs for both users.
- No-agreement path remains valid through Stage 3/4.
