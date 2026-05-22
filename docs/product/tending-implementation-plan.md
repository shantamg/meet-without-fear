# Tending Implementation Plan

Status: planning draft
Source material:
- `docs/product/source-material/stage-4-and-beyond-transcript.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `docs/product/stage-4-tending-technical-spec.md`
- `docs/product/stage-4-tending-build-progress.md`

## Product Thesis

Tending is the continuation after Stage 4. Stage 4 is not truly resolved just because people agreed to something. It is resolved only when the people come back, review what actually happened, and decide whether the need is now met, whether commitments should be adjusted, or whether another process is needed.

The transcript adds one missing emphasis to the existing technical spec: Tending should evaluate agreement follow-through against the needs Stage 4 was meant to serve. It should not be only a generic "how did it go?" reflection form.

## Current Code Map

### Data Model

Current Prisma support lives in `backend/prisma/schema.prisma`:

- `TendingEntry`
  - Current role: one scheduled/open/completed thing to review.
  - Fields already available: `sessionId`, optional `agreementId`, `type`, `scope`, `ownerUserId`, `optedInShared`, `status`, `scheduledFor`, `openedAt`, `completedAt`, `summary`.
  - Current limitation: it does not know which Stage 3 needs this entry is meant to resolve except indirectly through `Agreement`, `Stage4Closure.openNeedIds`, proposal coverage, and text summaries.
- `TendingResponse`
  - Current role: one user's submitted response for one entry.
  - Fields already available: `status`, `reflection`, `continueChoice`.
  - Current limitation: `status` is a string and `reflection` is a blob. It cannot answer: what happened, which side did or did not do their part, why, did this help the need, what adjustment was chosen?
- `TendingResponsePartialClosure`
  - Current role: records `RESOLVED` or `CONTINUING` per `TendingEntry` when the user chooses partial closure.
  - Current limitation: entry-level only; no need-level resolution.
- `Session.previousSessionId`
  - Current role: links a `NEW_PROCESS` session back to the prior session.
- `Stage4Closure.checkInAt`
  - Current role: session-level check-in date for generated Tending entries.

### Shared Contracts

Current DTOs live in `shared/src/dto/strategy.ts` and enums in `shared/src/enums.ts`:

- `TendingEntryDTO`
- `TendingResponseDTO`
- `SubmitTendingResponseRequest`
- `SubmitTendingCheckinRequest`
- `TendingCheckinOrientations`
- `ContinueChoice`
- `PartialClosureResolution`
- `TendingEntryType`, including shared agreement, individual commitment, and passive re-entry
- `TendingEntryScope`
- `TendingEntryStatus`

Current limitation: the check-in contract has:

```ts
whatWorked: { reflection; perEntryNotes }
whereMoreSupport: { reflection; perEntryNotes }
whatComesNext: { continueChoice; partialClosure }
```

That is enough for the existing three-step scaffold, but not enough for the transcript's "did the agreement actually resolve the need?" loop.

### Backend

Current backend code lives in:

- `backend/src/services/tending.service.ts`
- `backend/src/controllers/tending.ts`
- `backend/src/routes/tending.ts`
- `backend/src/controllers/stage4.ts`
- `backend/src/services/stage4-prompts.ts`

Current capabilities:

- `scheduleSharedAgreementTendingEntries`
  - Creates scheduled/open shared check-ins only for `Agreement` rows with a follow-up date.
- `scheduleIndividualCommitmentTendingEntries`
  - Creates private individual commitment check-ins.
- `listTendingEntries`
  - Lists shared entries, the current user's private individual entries, and opted-in shared individual entries.
- `submitTendingResponse`
  - Legacy single-entry response path using `WORKED/PARTLY/...` and `CONTINUE/ADJUST/...`.
- `submitTendingCheckin`
  - Newer session-level three-orientation check-in path with five choices: another round, extend, new process, partial closure, full closure.
- `createPassiveReentry`
  - Opens a private `USER_INITIATED_REENTRY` entry on resolved sessions.
- `publishPartnerInvolvingReentryChoice`
  - Explicit partner-notification boundary for re-entry.
- Stage 4 closure already creates Tending entries:
  - shared agreements create shared check-ins;
  - willing individual commitments create private individual check-ins;
  - no-shared-agreement does not create scheduled shared check-ins.

Current limitations:

- `submitTendingCheckin` stores the orientation reflections as combined blob text on every entry response.
- `perEntryNotes` are accepted by the DTO/controller but not persisted.
- There is no structured per-commitment outcome.
- There is no structured need-resolution outcome.
- `ANOTHER_ROUND` clears Stage 4 state broadly. It does not yet seed a focused reopened Stage 4 walkthrough around the failed/still-open needs.
- `TENDING_*_PERSONA` prompt fragments exist, but no real per-orientation AI conversation builder consumes them yet.

### Mobile

Current mobile code lives in:

- `mobile/src/components/TendingPanel.tsx`
- `mobile/src/screens/TendingCheckinScreen.tsx`
- `mobile/app/(auth)/session/[id]/tending-checkin.tsx`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

Current capabilities:

- `TendingPanel` appears on resolved-session surfaces and supports:
  - viewing scheduled/open entries;
  - single-entry response submission through the legacy endpoint;
  - passive re-entry;
  - individual commitment share/unshare.
- `TendingCheckinScreen` supports:
  - three sequential orientations;
  - per-entry notes in the UI;
  - five forward paths;
  - partial-closure toggles per entry.
- `useSubmitTendingCheckin` posts the three-orientation payload to `/sessions/:id/tending/checkin`.

Current limitations:

- `TendingPanel` and `TendingCheckinScreen` represent two different product shapes.
- The resolved-session panel does not route users into the richer check-in route.
- The check-in screen does not collect structured commitment outcomes or need outcomes.
- There is no mobile surface for reminder cadence.

## Current Work Alignment

The current Stage 4/Tending direction is mostly right:

- Conversation-led Stage 4 instead of bulk lists: aligned.
- One need at a time, user's own needs first, partner needs second: partially represented in the Stage 4 rework docs; this should remain an explicit acceptance criterion for Stage 4 before Tending.
- Options can come from either participant or MWF, with source labels: aligned.
- No direct three-way chat: aligned.
- Shared proposals versus individual commitments: aligned.
- Feasible, measurable agreements with check-in timing: aligned.
- Scheduled check-ins and passive re-entry: aligned.
- No-shared-agreement closure should not create a scheduled shared check-in: aligned.

The main gaps to close:

- Tending check-ins need structured per-commitment follow-through, not only freeform reflection.
- Tending needs to ask whether each original need feels resolved, partially resolved, or still open.
- Tending needs adjustment paths that can revise the agreement, create a lower-friction reminder, reopen Stage 4-style strategy work, or start a new process.
- Tending should produce a useful record for a future therapist/professional or the users themselves: what was agreed, what happened, what is working, what is not, and what remains hard.
- Stage 4 agreement quality checks must be strict enough that Tending has something measurable to inspect.

## Target Tending Flow

### 1. Entry Conditions

Create scheduled Tending entries only when Stage 4 closes with shared agreements that have timing.

Allow passive re-entry from any resolved session, including no-shared-agreement closure, but keep passive re-entry private until the user chooses a partner-involving path.

### 2. Check-In Opening

MWF opens with the concrete agreement context:

- "Here are the commitments from last time."
- "They were meant to help with these needs."
- "Let's check what actually happened."

The UI should show a compact agreement/need receipt, but the main interaction should be conversational and one item at a time.

### 3. Per-Commitment Review

For each commitment or Tending entry:

- Did it happen?
- Did the other person do their part, if applicable?
- Did you do your part, if applicable?
- If it happened, did it help the need it was meant to serve?
- If it did not happen, was it unwillingness, infeasibility, forgetfulness, misunderstanding, or changed circumstances?
- Is the commitment still worth trying as-is?

This is where the transcript's lawn example matters: if the agreement was "do not soil the lawn" and the behavior continued, MWF should not treat the agreement as successful. It should name that agreements depending only on the same non-occurring behavior may not be working and help explore alternatives.

### 4. Need Resolution Review

For each tracked Stage 3 need linked to the agreement set:

- Resolved: the need feels met enough to close.
- Improving: keep tending with minor support.
- Still open: the current strategy is not enough.
- Changed: the need or context is different now.

This should be stored separately from per-commitment status. A commitment can be kept while the need remains open, or a need can be resolved even if a particular commitment changed.

### 5. Adjustment Paths

At the end of a Tending cycle, offer five paths:

- Full closure: all relevant needs feel resolved enough; complete entries.
- Extend as-is: the agreement is working, needs more time; schedule another check-in.
- Adjust commitment: revise cadence, scope, measurability, or reminder support.
- Reopen strategy work: current approach is not working; return to Stage 4-style option generation for the still-open need.
- Start new process: the issue has changed enough that Stage 0/1 should begin again with linkage to the previous session.

Partial closure should be first-class: some commitments/needs can close while others continue.

### 6. Reminder Support

Tending should support lightweight reminders independent of full check-ins:

- Reminder halfway through a period.
- Monthly or every-couple-months nudge.
- One-sided reminder for an individual commitment.
- Shared reminder only when both users agreed to a shared commitment/reminder.

Do not notify the partner about a private reminder.

### 7. Output Record

Every Tending cycle should leave a structured record:

- Agreement status by commitment.
- Need status by linked need.
- What each user reported.
- What changed.
- Next path chosen.
- Next scheduled check-in/reminder, if any.

This record should be useful for the app, for future MWF context, and eventually for therapist/professional review.

## Proposed Contract Additions

Add structured fields without removing the current fields. Existing rows and mobile clients should keep working.

### Enums

Add to Prisma and shared enums:

```ts
enum TendingFollowThroughStatus {
  HAPPENED
  PARTLY_HAPPENED
  DID_NOT_HAPPEN
  NOT_SURE
}

enum TendingHelpfulnessStatus {
  HELPED
  PARTLY_HELPED
  DID_NOT_HELP
  TOO_SOON
  NOT_SURE
}

enum TendingBlockerCategory {
  NONE
  FORGOT
  TOO_HARD
  TOO_FREQUENT
  UNCLEAR
  PARTNER_DID_NOT_DO_PART
  I_DID_NOT_DO_PART
  CIRCUMSTANCES_CHANGED
  NO_LONGER_WANTED
  OTHER
}

enum TendingNeedResolutionStatus {
  RESOLVED
  IMPROVING
  STILL_OPEN
  CHANGED
  NOT_SURE
}

enum TendingNextAction {
  CLOSE
  EXTEND_AS_IS
  ADJUST_COMMITMENT
  REOPEN_STRATEGY_WORK
  START_NEW_PROCESS
  SCHEDULE_REMINDER
}

enum TendingReminderScope {
  PRIVATE
  SHARED
}
```

### New Tables

Add per-response structured commitment outcomes:

```prisma
model TendingCheckin {
  id             String @id @default(cuid())
  session        Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId      String
  user           User @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId         String
  continueChoice ContinueChoice
  submittedAt    DateTime @default(now())
  whatWorked      String? @db.Text
  whereSupport    String? @db.Text
  createdAt       DateTime @default(now())

  responses       TendingResponse[]
  entryOutcomes   TendingEntryOutcome[]
  needOutcomes    TendingNeedOutcome[]
  reminders       TendingReminder[]

  @@index([sessionId, submittedAt])
  @@index([userId, submittedAt])
}

model TendingEntryOutcome {
  id                 String @id @default(cuid())
  checkin           TendingCheckin @relation(fields: [checkinId], references: [id], onDelete: Cascade)
  checkinId         String
  tendingResponse   TendingResponse? @relation(fields: [tendingResponseId], references: [id], onDelete: Cascade)
  tendingResponseId String?
  tendingEntry      TendingEntry @relation(fields: [tendingEntryId], references: [id], onDelete: Cascade)
  tendingEntryId    String
  followThrough     TendingFollowThroughStatus
  helpfulness       TendingHelpfulnessStatus?
  blockerCategory   TendingBlockerCategory?
  adjustedText      String? @db.Text
  note              String? @db.Text
  createdAt         DateTime @default(now())

  @@unique([checkinId, tendingEntryId])
  @@index([tendingEntryId])
}
```

Add need-level Tending outcomes:

```prisma
model TendingNeedOutcome {
  id                 String @id @default(cuid())
  session            Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId          String
  checkin            TendingCheckin @relation(fields: [checkinId], references: [id], onDelete: Cascade)
  checkinId          String
  needId             String?
  needLabel          String
  resolutionStatus   TendingNeedResolutionStatus
  supportingEntryIds String[]
  nextAction         TendingNextAction?
  note               String? @db.Text
  createdAt          DateTime @default(now())

  @@index([sessionId])
  @@index([checkinId])
  @@index([needId])
}
```

Add reminders if current notification tables cannot represent one-off or recurring Tending reminders with privacy scope:

```prisma
model TendingReminder {
  id             String @id @default(cuid())
  session        Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sessionId      String
  checkin        TendingCheckin? @relation(fields: [checkinId], references: [id], onDelete: SetNull)
  checkinId      String?
  tendingEntry   TendingEntry? @relation(fields: [tendingEntryId], references: [id], onDelete: Cascade)
  tendingEntryId String?
  userId         String
  scope          TendingReminderScope
  scheduledFor   DateTime
  cadence        String?
  message        String @db.Text
  completedAt    DateTime?
  cancelledAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([sessionId])
  @@index([userId, scheduledFor])
}
```

### DTO Shape

Extend `TendingEntryDTO` with optional joined structured outcomes:

```ts
entryOutcomes?: TendingEntryOutcomeDTO[];
needOutcomes?: TendingNeedOutcomeDTO[];
```

Extend `TendingCheckinOrientations`:

```ts
interface TendingCheckinOrientations {
  whatWorked: {
    reflection: string;
    perEntryNotes?: Record<string, string>;
    entryOutcomes?: Record<string, {
      followThrough: TendingFollowThroughStatus;
      helpfulness?: TendingHelpfulnessStatus;
      note?: string;
    }>;
  };
  whereMoreSupport: {
    reflection: string;
    perEntryNotes?: Record<string, string>;
    entryOutcomes?: Record<string, {
      blockerCategory?: TendingBlockerCategory;
      note?: string;
    }>;
  };
  needsReview?: Record<string, {
    needLabel: string;
    resolutionStatus: TendingNeedResolutionStatus;
    supportingEntryIds: string[];
    nextAction?: TendingNextAction;
    note?: string;
  }>;
  whatComesNext: {
    continueChoice: ContinueChoice;
    partialClosure?: Record<string, PartialClosureResolution>;
    reminder?: {
      scope: TendingReminderScope;
      scheduledFor: string;
      cadence?: string;
      message?: string;
    };
  };
}
```

Keep `reflection`, `perEntryNotes`, and `partialClosure` so current UI/tests keep compiling while the richer flow is added.

## Implementation Slices

### Slice 1: Source-Material Alignment and Acceptance Tests

- Add this transcript as source material.
- Add an explicit Tending rubric to the gold evaluator:
  - agreements are inspected for follow-through;
  - needs are checked for actual resolution;
  - failed commitments produce adjustment/exploration, not premature closure;
  - private re-entry stays private;
  - reminders respect consent boundaries.
- Add a deterministic lawn/boundary fixture that includes:
  - a clean/healthy-space need;
  - a shared commitment not to repeat the boundary violation;
  - an alternative self-protective strategy;
  - a Tending check-in where the shared commitment failed.

Concrete files:

- `docs/product/source-material/stage-4-and-beyond-transcript.md`
- `docs/product/source-material/index.md`
- `eval/skills/mwf-gold-session-scorer/references/gold-alignment-rubric.md`
- `eval/scorer/judge-prompts/*` or the current scorer prompt source after locating the active eval entrypoint
- `backend/src/testing/state-factory.ts`
- `e2e/helpers/session-builder.ts`

Acceptance:

- A scorer prompt or rubric can explicitly fail a Tending run that only asks "how did it go?" and never checks follow-through or need resolution.
- A deterministic fixture exists for the lawn/boundary example.

### Slice 2: Data Model Extensions

Extend existing Tending models rather than replacing them.

Concrete files:

- `backend/prisma/schema.prisma`
- new migration under `backend/prisma/migrations/`
- `shared/src/enums.ts`
- `shared/src/dto/strategy.ts`
- `backend/src/__tests__/prisma-schema.test.ts`

Implementation:

- Add the enums and tables listed in "Proposed Contract Additions".
- Add a batch-level `TendingCheckin` model. A single `/tending/checkin` submission should create one parent row and then link all per-entry responses/outcomes to it.
- Add optional `checkinId` to `TendingResponse` so existing single-entry responses remain valid while new check-in submissions can be grouped.
- Add relations from `TendingCheckin` to `TendingResponse[]`, `TendingEntryOutcome[]`, `TendingNeedOutcome[]`, and `TendingReminder[]`.
- Add optional relation from `TendingResponse` to `TendingEntryOutcome[]`.
- Add relation from `TendingEntry` to `TendingEntryOutcome[]` and optional `TendingReminder[]`.
- Add relation from `Session` to `TendingCheckin[]`, `TendingNeedOutcome[]`, and `TendingReminder[]`.
- Prefer child tables over stuffing structured data into `TendingResponse.reflection`; the blob remains human-readable backup text.

Acceptance:

- Prisma validates.
- Shared package exports all new enum/DTO types.
- Existing Tending tests still compile without requiring the new fields.

### Slice 3: Backend Tending Service

- Expand `submitTendingCheckin` to persist structured per-commitment and per-need payloads.
- Implement path handlers:
  - full closure;
  - extend;
  - adjust;
  - partial closure;
  - reopen Stage 4 strategy work;
  - start new process.
- Keep passive re-entry private until the user chooses a partner-involving action.
- Add tests for failure-to-follow-through triggering adjustment/reopen options.

Concrete files:

- `backend/src/services/tending.service.ts`
- `backend/src/controllers/tending.ts`
- `backend/src/routes/tending.ts`
- `backend/src/services/__tests__/tending.service.test.ts`
- `backend/src/controllers/stage4.ts`
- `backend/src/routes/__tests__/stage4.test.ts`
- `backend/src/scripts/open-due-tending-entries.ts`

Implementation:

- Preserve `/sessions/:id/tending/:entryId/responses` for compatibility, but mark it legacy in comments and route docs.
- Make `/sessions/:id/tending/checkin` the canonical scheduled check-in submission endpoint.
- Update controller Zod schema to accept the new optional structured maps.
- In `submitTendingCheckin`:
  - create one `TendingCheckin` parent row for the submission;
  - upsert one `TendingResponse` per visible/respondable open entry, as today;
  - set `TendingResponse.checkinId` on each response created by the batch endpoint;
  - persist `TendingEntryOutcome` for every `entryOutcomes` item;
  - persist `TendingNeedOutcome` for every `needsReview` item;
  - store `perEntryNotes` in `TendingEntryOutcome.note` rather than dropping them;
  - derive a conservative path recommendation internally when a need is `STILL_OPEN` and all linked entries are `DID_NOT_HAPPEN` or `DID_NOT_HELP`.
- For `ANOTHER_ROUND`:
  - rename internally or document as "reopen strategy work";
  - do not blindly delete all Stage 4 coverage unless the UI is ready to rebuild it;
  - seed the next Stage 4 walkthrough around the still-open need ids from `TendingNeedOutcome`.
- For `EXTEND`:
  - reschedule only entries marked as still relevant; do not extend entries whose need is resolved.
- For `PARTIAL_CLOSURE`:
  - close entries marked resolved and reschedule continuing entries, as today;
  - also persist need outcomes so partial closure is not entry-only.
- For `FULL_CLOSURE`:
  - require, at minimum, the submitted need outcomes to be `RESOLVED` or `IMPROVING` unless the user explicitly overrides; record the override in `note`.
- For reminders:
  - create `TendingReminder` rows when `whatComesNext.reminder` is supplied;
  - private reminders notify only the owner;
  - shared reminders require a shared entry or explicit partner-involving path.
- Extend `openDueTendingEntries` or add `openDueTendingReminders` for reminders.

Acceptance:

- Unit tests cover:
  - structured per-entry outcomes persist;
  - per-entry notes no longer disappear;
  - need outcomes persist;
  - failed follow-through plus still-open need recommends or allows strategy reopening;
  - private reminder does not notify partner;
  - shared reminder does notify both users only when scoped shared;
  - passive re-entry remains private.

### Slice 4: Tending Conversation Prompts

- Wire the existing Tending persona fragments into actual Tending conversation paths.
- Prompt posture:
  - concrete and accountability-oriented;
  - not shaming;
  - not "agreement equals resolution";
  - explores alternative strategies when the current one fails;
  - distinguishes "can't do it" from "didn't do it."
- Preserve the never-three-way principle.

Concrete files:

- `backend/src/services/stage4-prompts.ts`
- `backend/src/services/stage-prompts.ts`
- a new `backend/src/services/tending-conversation.service.ts` if no suitable service exists
- `backend/src/services/__tests__/stage4-prompts.test.ts`
- `backend/src/services/__tests__/stage-prompts.test.ts`

Implementation:

- Keep `RESOLVED_LISTEN_FIRST_CLAUSE` for pre-check-in resolved-session chat.
- Add a Tending conversation builder that accepts:
  - orientation (`whatWorked`, `whereMoreSupport`, `needsReview`, `whatComesNext`);
  - visible entries;
  - linked needs;
  - prior Tending outcomes;
  - whether the interaction is private or partner-involving.
- Extend `TENDING_WHAT_WORKED_PERSONA` to ask "what actually happened?" before "what worked?" for each commitment.
- Extend `TENDING_MORE_SUPPORT_PERSONA` with blocker categories: forgot, too hard, too frequent, unclear, partner did not do part, I did not do part, circumstances changed.
- Add `TENDING_NEEDS_REVIEW_PERSONA`:
  - one need at a time;
  - asks whether the need feels resolved, improving, still open, changed, or unclear;
  - ties answers back to linked entries.
- Extend `TENDING_WHAT_COMES_NEXT_PERSONA`:
  - if current agreements did not happen or did not help, propose adjustment/reopen strategy work rather than generic extension;
  - if the need is resolved, honor closure;
  - if the user wants lightweight support, offer reminders.

Acceptance:

- Prompt tests assert:
  - no "agreement equals resolution" posture;
  - failed follow-through is treated as information, not failure;
  - the model asks whether the underlying need is resolved;
  - partner notification/crossing requires explicit partner-involving choice.

### Slice 5: Mobile Tending UI

- Make `TendingCheckinScreen` the canonical scheduled check-in UI and reduce `TendingPanel` to a resolved-session launcher/summary.
- Replace generic single-card check-in with a stepwise check-in:
  - agreement receipt;
  - per-commitment review;
  - support/blocker review;
  - need resolution review;
  - path choice;
  - next reminder/check-in setup.
- Keep the list inspectable, but guide one item at a time.
- Include a passive re-entry CTA from resolved sessions.
- Include a confirmation surface that records the next check-in/reminder.

Concrete files:

- `mobile/src/components/TendingPanel.tsx`
- `mobile/src/screens/TendingCheckinScreen.tsx`
- `mobile/app/(auth)/session/[id]/tending-checkin.tsx`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/hooks/queryKeys.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/components/__tests__/TendingPanel.test.tsx`
- `mobile/src/screens/__tests__/TendingCheckinScreen.test.tsx`
- `mobile/src/hooks/__tests__/useStages.test.ts`

Implementation:

- In `TendingPanel`:
  - show scheduled/open entries and their status;
  - show agreement context and linked open needs;
  - replace "Save review" for scheduled/open entries with "Start check-in" that routes to `/session/${sessionId}/tending-checkin`;
  - keep passive re-entry and individual share/unshare controls.
- In `TendingCheckinScreen`:
  - Step 1: "What happened?" per entry, with happened/partly/did not happen controls.
  - Step 2: "Did it help?" per entry, with helpfulness controls and blocker category if not.
  - Step 3: "Are the needs resolved?" one linked need at a time.
  - Step 4: "What comes next?" five paths plus reminder options.
  - Keep `whatWorked` and `whereMoreSupport` reflection fields for compatibility, but do not make them the only data.
- In route handling:
  - post the richer payload through `useSubmitTendingCheckin`;
  - navigate to the reopened session/new process/confirmation based on response;
  - display reminder scheduling result if present.

Acceptance:

- Tests cover:
  - the old single-entry review controls no longer appear for open scheduled entries;
  - check-in route submits structured entry outcomes and need outcomes;
  - reminder controls appear for extend/adjust paths;
  - partial closure still works;
  - passive re-entry remains available from no-shared-agreement resolved sessions.

### Slice 6: E2E and Evaluation

- Add two-browser E2E for:
  - shared agreement creates scheduled Tending;
  - Tending opens after due date;
  - both users submit check-in;
  - failed commitment leads to adjustment/reopen path;
  - full closure completes entries;
  - partial closure keeps only unresolved entries open;
  - private reminder does not notify partner.
- Add a passive re-entry E2E for no-shared-agreement sessions.
- Add a transcript/eval case based on the lawn example to prevent generic "how did it go?" handling.

Concrete files:

- `e2e/tests/two-browser-stage-4-redesign.spec.ts`
- a new `e2e/tests/tending-checkin.spec.ts` if the existing file gets too broad
- `e2e/helpers/session-builder.ts`
- `backend/src/testing/state-factory.ts`
- active eval scorer files after locating the current entrypoint

Acceptance:

- A seeded session with a shared "clean/healthy space" need and failed behavior-change agreement can:
  - open Tending;
  - record that the commitment did not happen;
  - mark the need still open;
  - choose reopen strategy work;
  - land back in Stage 4 with the still-open need focused.
- A seeded session where the agreement worked can:
  - mark the need resolved;
  - choose full closure;
  - complete all relevant entries.
- Private reminder path does not create partner notifications.

## Risks and Decisions

- **Migration risk:** Use additive schema changes only. Do not remove legacy `TendingResponse.status`, `reflection`, or `continueChoice` yet.
- **Two Tending UIs:** Consolidate around `TendingCheckinScreen` for scheduled/open entries. Keep `TendingPanel` as launcher and passive re-entry surface.
- **Reopening Stage 4:** The current `ANOTHER_ROUND` implementation clears broad state. Before shipping deeper Tending, make reopening focused and recoverable: preserve history, seed current need, and leave prior agreements as context.
- **Need linkage:** Tending quality depends on Stage 4 proposals/agreements being linked to Stage 3 needs. If an agreement lacks explicit linked needs, fall back to `Stage4NeedCoverage` and summary text, but record this as low confidence in tests.
- **Partner visibility:** Passive re-entry and private reminders stay private. Partner notification happens only for scheduled shared check-ins, submitted shared check-ins, or explicit partner-involving choices.
- **Professional review:** The structured outcome tables are the foundation for future therapist/professional reporting. Do not defer all outcome detail into unstructured reflections.

## Immediate Next Step

Continue in the dedicated worktree recorded by `docs/product/stage-4-tending-build-progress.md`, not the main checkout:

`/Users/shantam/Software/meet-without-fear-stage4-tending`

Start by updating that worktree with this source transcript and plan, then complete the current remaining Stage 4/Tending verification work before implementing deeper Tending adjustments.
