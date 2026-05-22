CREATE TYPE "TendingFollowThroughStatus" AS ENUM ('HAPPENED', 'PARTLY_HAPPENED', 'DID_NOT_HAPPEN', 'NOT_SURE');

CREATE TYPE "TendingHelpfulnessStatus" AS ENUM ('HELPED', 'PARTLY_HELPED', 'DID_NOT_HELP', 'NOT_SURE');

CREATE TYPE "TendingBlockerCategory" AS ENUM ('FORGOT', 'TOO_HARD', 'TOO_FREQUENT', 'UNCLEAR', 'PARTNER_DID_NOT_DO_PART', 'I_DID_NOT_DO_PART', 'CIRCUMSTANCES_CHANGED', 'NO_LONGER_WANTED', 'OTHER');

CREATE TYPE "TendingNeedResolutionStatus" AS ENUM ('RESOLVED', 'IMPROVING', 'STILL_OPEN', 'CHANGED', 'NOT_SURE');

CREATE TYPE "TendingNextAction" AS ENUM ('FULL_CLOSURE', 'EXTEND', 'ADJUST_COMMITMENT', 'REOPEN_STRATEGY_WORK', 'NEW_PROCESS', 'PARTIAL_CLOSURE');

CREATE TYPE "TendingReminderScope" AS ENUM ('PRIVATE', 'SHARED');

CREATE TABLE "TendingCheckin" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nextAction" "TendingNextAction",
    "continueChoice" "ContinueChoice",
    "reflectionSummary" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingCheckin_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TendingResponse"
ADD COLUMN "checkinId" TEXT;

CREATE TABLE "TendingEntryOutcome" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "tendingEntryId" TEXT NOT NULL,
    "responseId" TEXT,
    "userId" TEXT NOT NULL,
    "followThroughStatus" "TendingFollowThroughStatus" NOT NULL,
    "helpfulnessStatus" "TendingHelpfulnessStatus",
    "blockerCategories" "TendingBlockerCategory"[],
    "whatHappened" TEXT,
    "helpedNeed" TEXT,
    "blockerNote" TEXT,
    "stillWorthTrying" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingEntryOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TendingNeedOutcome" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "needId" TEXT,
    "needLabel" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "resolutionStatus" "TendingNeedResolutionStatus" NOT NULL,
    "note" TEXT,
    "changedNeedLabel" TEXT,
    "nextAction" "TendingNextAction",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingNeedOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TendingReminder" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkinId" TEXT,
    "tendingEntryId" TEXT,
    "userId" TEXT NOT NULL,
    "scope" "TendingReminderScope" NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "cadence" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TendingReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TendingCheckin_sessionId_submittedAt_idx" ON "TendingCheckin"("sessionId", "submittedAt");
CREATE INDEX "TendingCheckin_userId_submittedAt_idx" ON "TendingCheckin"("userId", "submittedAt");
CREATE INDEX "TendingResponse_checkinId_idx" ON "TendingResponse"("checkinId");
CREATE UNIQUE INDEX "TendingEntryOutcome_checkinId_tendingEntryId_key" ON "TendingEntryOutcome"("checkinId", "tendingEntryId");
CREATE INDEX "TendingEntryOutcome_tendingEntryId_idx" ON "TendingEntryOutcome"("tendingEntryId");
CREATE INDEX "TendingEntryOutcome_userId_createdAt_idx" ON "TendingEntryOutcome"("userId", "createdAt");
CREATE INDEX "TendingNeedOutcome_sessionId_createdAt_idx" ON "TendingNeedOutcome"("sessionId", "createdAt");
CREATE INDEX "TendingNeedOutcome_checkinId_idx" ON "TendingNeedOutcome"("checkinId");
CREATE INDEX "TendingNeedOutcome_needId_idx" ON "TendingNeedOutcome"("needId");
CREATE INDEX "TendingReminder_sessionId_remindAt_idx" ON "TendingReminder"("sessionId", "remindAt");
CREATE INDEX "TendingReminder_userId_remindAt_idx" ON "TendingReminder"("userId", "remindAt");
CREATE INDEX "TendingReminder_checkinId_idx" ON "TendingReminder"("checkinId");
CREATE INDEX "TendingReminder_tendingEntryId_idx" ON "TendingReminder"("tendingEntryId");

ALTER TABLE "TendingCheckin" ADD CONSTRAINT "TendingCheckin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingCheckin" ADD CONSTRAINT "TendingCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingResponse" ADD CONSTRAINT "TendingResponse_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "TendingCheckin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TendingEntryOutcome" ADD CONSTRAINT "TendingEntryOutcome_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "TendingCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingEntryOutcome" ADD CONSTRAINT "TendingEntryOutcome_tendingEntryId_fkey" FOREIGN KEY ("tendingEntryId") REFERENCES "TendingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingEntryOutcome" ADD CONSTRAINT "TendingEntryOutcome_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "TendingResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TendingEntryOutcome" ADD CONSTRAINT "TendingEntryOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingNeedOutcome" ADD CONSTRAINT "TendingNeedOutcome_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "TendingCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingNeedOutcome" ADD CONSTRAINT "TendingNeedOutcome_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingReminder" ADD CONSTRAINT "TendingReminder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingReminder" ADD CONSTRAINT "TendingReminder_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "TendingCheckin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TendingReminder" ADD CONSTRAINT "TendingReminder_tendingEntryId_fkey" FOREIGN KEY ("tendingEntryId") REFERENCES "TendingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingReminder" ADD CONSTRAINT "TendingReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
