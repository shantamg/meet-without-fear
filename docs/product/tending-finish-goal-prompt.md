# /goal Prompt: Finish The Tending / Stage 5 Flow

Use this prompt as the body for a large `/goal` session.

## Objective

Finish the Stage 5 / Tending work that is currently stacked in draft PR #640 (`codex/full-tending-flow` → `codex/stages-3-4-rework`) so it is product-complete, gold-aligned, and ready for real user testing.

The current PR has the structural foundation:

- Structured Tending check-ins.
- Entry outcomes.
- Need outcomes.
- Reminder rows.
- Rich mobile check-in route.
- Basic backend path semantics.
- Deterministic E2E/eval coverage.

Do not treat that as done. The remaining work is to make Tending behave like the gold sessions and source transcript describe:

- Tending is the continuation after Stage 4, not a generic review form.
- Agreement is not resolution.
- Shared check-ins are private, parallel, and coordinated only after both users have completed their side, or after the configured timeout.
- Abandoned or failed commitments are information, not failure.
- Adjustments actually revise the commitment or cadence, not merely reschedule the same entry.
- Reminders are real product behavior, not only stored rows.
- The mobile UX should feel calm, one-thing-at-a-time, inspectable, and trustworthy.
- The resulting Tending record should be useful to future MWF context and eventual professional/therapist review.

## Current Branch And PR Context

Start from the existing full Tending worktree unless it no longer exists:

`/Users/shantam/Software/meet-without-fear-full-tending`

Expected branch:

`codex/full-tending-flow`

Expected PR:

[#640 - Build full Tending check-in flow](https://github.com/shantamg/meet-without-fear/pull/640)

This PR is stacked on:

`codex/stages-3-4-rework`

It is not targeted directly at `main` because the Stage 3/4 work has not merged yet.

## Required Source Material

Read these before coding:

- `docs/product/source-material/stage-4-and-beyond-transcript.md`
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `docs/product/tending-goal-prompt.md`
- `docs/product/tending-implementation-plan.md`
- `docs/product/stage-4-tending-technical-spec.md`
- `docs/product/stage-4-tending-build-progress.md`
- `docs/product/stage-4-gold-question-analysis.md`
- `CLAUDE.md`

Pay special attention to these source requirements:

- `core-protocol-update.md`, The Tending:
  - The between-period is open but app-passive unless a user explicitly requested a reminder.
  - Nothing shared during Tending crosses to the partner without explicit consent.
  - Both users are invited separately and in parallel at the check-in.
  - If one user checks in and the other has not responded within two weeks, MWF proceeds with whoever is present and notes the gap.
  - MWF opens by asking whether between-period material should be factored in.
  - MWF curates any cross-track carryover and asks consent separately.
  - Each user's choice is held privately until both complete their check-in.
  - Where choices overlap or require coordination, MWF presents the combined picture to both users before proceeding.
  - Full closure is honored without qualification.
- `adam-eve.md`, first Tending cycle:
  - Adam extends shared walks/conversations and revises Saturday mornings.
  - Eve partially closes Portugal, continues individual commitments, and extends shared agreements.
  - MWF holds each side's choices until both are complete.
  - Overlap reveals extension of weekly walks and structured conversations.
  - Individual commitments continue independently.
  - Next check-in is scheduled four weeks later.
- `stage-4-and-beyond-transcript.md`:
  - Stage 5 exists because agreement is not resolution.
  - Check what happened, whether commitments were kept, whether the need is resolved, whether the commitment should be adjusted, and whether reminders/check-ins are wanted.
  - If a behavior-change agreement failed, reopen strategy work around other ways to meet the need.
  - Reminders should support real timing/cadence like halfway reminders, monthly nudges, or every-couple-months follow-ups.

## Preflight

1. Confirm the active branch/worktree with `git status --short --branch`.
2. Confirm PR #640 state with `gh pr view 640 --repo shantamg/meet-without-fear`.
3. Inspect current diffs and do not overwrite unrelated local work.
4. Read the current progress doc and append a new "Finish Tending" section before implementation.
5. Run a baseline validation set, or at minimum inspect the most recent passing commands in the progress doc:
   - `npm run check --workspace backend`
   - `npm run check --workspace shared`
   - `npm run check --workspace mobile`
   - `npm run check --workspace e2e`
   - targeted Tending backend/mobile/e2e suites

## Non-Negotiable Product Rules

- Never turn MWF into a three-way conversation.
- Keep Tending private by default.
- Do not notify the partner about private re-entry, private notes, private individual commitments, or private reminders.
- Shared check-ins and shared reminders require shared agreement context and appropriate consent/coordination.
- Agreement does not equal resolution.
- Failed follow-through is information, not blame.
- Full closure is legitimate and should not be second-guessed.
- Partial closure is first-class.
- Individual commitments continue independently unless the owner explicitly opts into sharing.
- If one side misses a shared check-in timeout, continue with the present user's process and record that the partner did not respond.
- Mobile UX should guide one thing at a time while preserving inspectability of the full list.

## Required Work

### Chunk 1: Shared Tending Coordination State

Goal: shared Tending check-ins should not immediately mutate shared outcomes from one user's submission.

Implement a coordination layer for shared Tending cycles:

- Add or extend data structures so the app can represent:
  - a Tending cycle/check-in window for one or more shared entries;
  - each participant's private submitted check-in;
  - partner pending state;
  - response deadline, default two weeks after opening;
  - combined/coordination result after both sides submit or deadline passes.
- Preserve existing `TendingCheckin`, `TendingEntryOutcome`, and `TendingNeedOutcome` rows, but add whatever fields/models are needed to avoid prematurely applying shared state transitions.
- For shared entries:
  - store the user's submission immediately;
  - do not reopen Stage 4, extend shared entries, start a new shared process, or fully close shared entries until coordination is resolved;
  - show "waiting for partner" / "we'll hold this until partner completes their check-in" to the submitter.
- For individual entries:
  - keep one-user behavior; individual commitments can close/extend/adjust independently.
- Add a timeout path:
  - after two weeks, if partner has not submitted, proceed with the present user's side and record the gap.

Validation:

- Backend unit tests:
  - one shared check-in submission records private outcome but does not mutate shared entry final state;
  - second partner submission triggers coordination;
  - timeout proceeds with present user and records partner non-response;
  - individual entry submissions still complete/reschedule independently.
- E2E API tests against deterministic Stage 4 fixture.

### Chunk 2: Overlap And Coordination Resolution

Goal: match the Adam/Eve gold behavior where choices are held privately, then overlap/coordination is revealed.

Implement a resolver for shared Tending coordination:

- Compare each partner's `nextAction`, `continueChoice`, entry outcomes, need outcomes, and partial closure choices.
- Resolve shared outcomes conservatively:
  - both choose extension for same shared entries → extend those entries and schedule next check-in;
  - both choose partial closure and agree an entry is resolved → complete it;
  - one chooses extension and one chooses partial closure → present combined picture and continue unresolved shared entries unless both explicitly close;
  - either side reports failed follow-through plus still-open need → recommend adjust/reopen rather than blind extension;
  - either side chooses new process → create linked session only after partner-involving consent/coordination is satisfied;
  - no overlap or disagreement → keep process private and present a mediated next-step prompt, not a direct partner debate.
- Publish partner-visible notification only after coordination has something legitimate to show.
- Store a durable coordination summary:
  - who submitted;
  - who did not;
  - overlapping choices;
  - shared entries continuing/closing;
  - individual commitments continuing independently;
  - next check-in date or no scheduled check-in.

Validation:

- Backend tests for extension overlap, partial closure overlap, mixed choices, new-process request, no partner response.
- E2E tests mirroring Adam/Eve first Tending cycle:
  - Adam chooses extension/revision;
  - Eve chooses partial closure + extension;
  - overlap reveals shared walks/conversations extend four weeks;
  - individual commitments stay independent.

### Chunk 3: Real Adjustment Flow

Goal: `ADJUST_COMMITMENT` must revise the commitment, cadence, or success criteria rather than behaving like `EXTEND`.

Implement adjustment data and UI:

- Add structured adjustment input:
  - revised commitment text;
  - revised cadence/frequency;
  - revised scope;
  - revised success criteria;
  - reason/blocker addressed;
  - whether adjustment is private or shared.
- For individual commitments:
  - owner can revise privately;
  - partner is not notified unless owner opts in.
- For shared agreements:
  - proposed adjustment is held privately first;
  - partner sees a curated coordination prompt only after consent/coordination rules are satisfied.
- Backend should create a new revision/history record rather than overwriting old agreement context invisibly.
- Mobile should provide a clear adjustment screen:
  - "What would make this more doable?"
  - frequency/cadence controls;
  - success criteria field;
  - "keep this private" vs shared coordination when applicable.

Validation:

- Backend tests for adjustment persistence and revision history.
- Mobile tests for adjustment form payload.
- Browser test where a user changes "twice a month" to "once a month" and schedules a halfway reminder, matching the source transcript.

### Chunk 4: Reminder Scheduling And Delivery

Goal: reminders should be usable, schedulable, and delivered.

Implement reminder behavior:

- Mobile reminder controls:
  - presets: tomorrow, halfway, one week, two weeks, one month;
  - custom date/time;
  - cadence: one-time, weekly, monthly, every couple months;
  - scope: private or shared;
  - clear copy explaining private reminders do not notify partner.
- Backend validation:
  - private reminders can attach to individual or shared entries but notify only the requesting user;
  - shared reminders require shared entry and shared coordination/consent;
  - invalid dates/cadence rejected.
- Add a due-reminder processor:
  - finds scheduled reminders due at or before now;
  - publishes/pushes notification to correct user(s);
  - marks sent/delivered or advances next cadence;
  - never leaks private reminder content to partner.
- Update or add scripts/cron entry:
  - current `open-due-tending-entries.ts` only opens due shared check-ins; add reminders and individual entries.

Validation:

- Backend unit tests for reminder due processing, cadence advancement, privacy.
- E2E API tests for private vs shared reminders.
- Browser UX smoke where user chooses a reminder preset and sees confirmation.

### Chunk 5: Open Due Individual Entries And Check-In Windows

Goal: scheduled individual commitment check-ins should open, not just shared agreements.

Implement:

- Extend due opener to handle:
  - shared scheduled check-ins;
  - individual scheduled check-ins;
  - passive re-entry follow-up entries if applicable;
  - reminder due rows.
- Notification routing:
  - shared scheduled entry opening notifies both users;
  - individual scheduled entry opening notifies only owner;
  - opted-in shared individual entry visibility does not mean automatic partner notification.
- Add status metadata:
  - openedAt;
  - responseDeadlineAt for shared entries;
  - waiting/expired states if needed.

Validation:

- Backend tests for due shared/individual open behavior.
- E2E API tests for individual scheduled check-in opening privately.

### Chunk 6: Between-Period Holding Space

Goal: users can return before the scheduled check-in and talk privately without triggering a structured process.

Implement a private between-period Tending note/conversation path:

- On resolved sessions before check-in date:
  - user can "think out loud" or add a private Tending note;
  - MWF listens and reflects, Stage-1 style;
  - no new process is initiated automatically;
  - note is captured as possible check-in context;
  - user is told it will only carry forward if they choose.
- At check-in opening:
  - surface the user's own between-period notes;
  - ask whether to factor them in;
  - if something might cross to partner, ask consent separately.
- Do not expose one user's between-period notes to the partner unless explicit consent is recorded.

Validation:

- Backend tests for private notes and consented carry-forward.
- Mobile/browser test:
  - Eve adds a private between-period note;
  - Adam cannot see it;
  - Eve's check-in asks whether to bring it in.

### Chunk 7: Live Tending Prompt Integration

Goal: `buildTendingConversationPrompt` should be used by real AI/message paths where Tending conversations happen.

Implement:

- Wire Tending prompt context into resolved-session / Tending chat flows.
- Ensure prompt context includes:
  - entries;
  - linked needs;
  - success criteria;
  - prior between-period notes selected by user;
  - latest structured outcomes;
  - private partner boundary.
- Keep mobile form flow available, but support AI-guided conversational Tending where current UX expects chat.
- Ensure no prompt path directly relays private content to partner.

Validation:

- Backend prompt tests and message-route tests.
- Moment-eval tests covering:
  - what happened before what worked;
  - abandoned commitment as information;
  - no agreement-as-resolution;
  - consent before cross-track carryover.

### Chunk 8: Tending History And Review Record

Goal: produce a usable record for users, future MWF context, and eventual therapist/professional review.

Implement a Tending history/read model:

- Per Tending cycle:
  - commitments reviewed;
  - what happened;
  - what helped;
  - blockers;
  - need outcomes;
  - adjustments;
  - reminders/check-ins scheduled;
  - coordination result;
  - partner non-response if applicable.
- API endpoint or extended existing endpoint for Tending history.
- Mobile summary surface:
  - current status;
  - last check-in summary;
  - what continues;
  - what closed;
  - next reminder/check-in.
- Keep professional export out of scope unless quick, but design the data shape so export is straightforward.

Validation:

- Backend tests for history serialization.
- Mobile tests for summary rendering.
- Browser screenshot/smoke after one completed Tending cycle.

### Chunk 9: UX/UI Polish And Browser Verification

Goal: make the flow feel solid, not just technically present.

Use the Browser plugin / Playwright to test actual web UI at mobile viewport.

UX requirements:

- Tending panel clearly distinguishes:
  - scheduled check-in;
  - open check-in;
  - waiting for partner;
  - individual commitment;
  - passive re-entry;
  - reminder.
- Check-in flow:
  - no text overlap on mobile;
  - long commitment text wraps cleanly;
  - controls are tappable;
  - selected states are obvious;
  - next/back flow is predictable;
  - submitting shows loading and prevents double-submit;
  - error messages are understandable.
- Reminder flow:
  - date/cadence choices fit on mobile;
  - private/shared scope copy is clear;
  - confirmation says who will be notified.
- Coordination flow:
  - after one shared check-in submission, user sees "waiting for partner" with calm copy;
  - after both submit, each sees the combined outcome without private notes leaking.

Required browser runs:

- Start from deterministic Stage 4 shared-agreement fixture.
- Close Stage 4 with a due check-in.
- Browser A completes shared Tending check-in.
- Verify Browser A sees waiting state.
- Browser B completes shared Tending check-in with overlapping extension.
- Verify both browsers see coordinated extension and next check-in.
- Run a second scenario:
  - one user chooses adjustment;
  - set a private reminder;
  - verify partner cannot see private reminder.
- Run a third scenario:
  - no-shared-agreement closure;
  - user starts passive re-entry;
  - verify partner is not notified;
  - user explicitly chooses partner-involving path;
  - verify only then partner-visible notification is created.

Capture screenshots or Playwright traces for the key states and mention paths in the final response.

## Testing Requirements

Run targeted tests after each chunk. Before finishing, run:

- `DATABASE_URL=postgresql://user:pass@localhost:5432/mwf npx prisma@6.12.0 validate --schema backend/prisma/schema.prisma`
- `npm run check --workspace shared`
- `npm run check --workspace backend`
- `npm run check --workspace mobile`
- `npm run check --workspace e2e`
- `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts src/routes/__tests__/stage4.test.ts --runInBand`
- `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts src/services/__tests__/stage4-prompts.test.ts --runInBand`
- `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/TendingPanel.test.tsx src/screens/__tests__/TendingCheckinScreen.test.tsx src/hooks/__tests__/useStages.test.ts --runInBand --forceExit`
- `python3 scripts/test_mwf_moment_eval.py`
- `python3 scripts/mwf_moment_eval.py run --moment stage-4-tending-structured-checkin --max-iterations 1 --mock-response "..."`
- `npm --workspace e2e run e2e -- --project=two-browser-stage-4-redesign`

Add new tests where the implementation requires them; do not only update existing assertions.

## Progress And Git Rules

- Keep working in `/Users/shantam/Software/meet-without-fear-full-tending` unless a new dedicated worktree is necessary.
- Update `docs/product/stage-4-tending-build-progress.md` after each meaningful chunk.
- Include:
  - branch/worktree;
  - files changed;
  - decisions made;
  - commands run;
  - test results;
  - known blockers;
  - next step.
- Commit coherent checkpoints.
- Push updates to `codex/full-tending-flow`.
- Keep PR #640 as draft until:
  - shared coordination is implemented;
  - reminders are real;
  - adjustment is real;
  - browser UX flow passes.

## Completion Criteria

Do not mark this goal complete until all are true:

- Shared Tending check-ins hold private choices until both users submit or timeout.
- Coordination result is shown to both users only after appropriate overlap/consent.
- Adjustment creates real revised commitment/cadence/success criteria records.
- Reminders have usable mobile scheduling controls and a due delivery processor.
- Individual scheduled check-ins open privately when due.
- Passive re-entry remains private until an explicit partner-involving action.
- Between-period notes are private and can be explicitly factored into check-in.
- Live Tending prompt support is wired where conversational Tending occurs.
- Tending history/read model is available to users and future app context.
- Real browser verification covers the critical user journeys and mobile UI states.
- All required checks pass.
- PR #640 is updated with a clear summary, verification list, and remaining risk notes.
