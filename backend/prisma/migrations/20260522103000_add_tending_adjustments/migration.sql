CREATE TABLE "TendingAdjustment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "tendingEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "privacyScope" "TendingReminderScope" NOT NULL DEFAULT 'PRIVATE',
    "revisedCommitmentText" TEXT,
    "revisedCadence" TEXT,
    "revisedScope" TEXT,
    "revisedSuccessCriteria" TEXT,
    "reason" TEXT,
    "blockerAddressed" "TendingBlockerCategory"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TendingAdjustment_sessionId_createdAt_idx" ON "TendingAdjustment"("sessionId", "createdAt");
CREATE INDEX "TendingAdjustment_checkinId_idx" ON "TendingAdjustment"("checkinId");
CREATE INDEX "TendingAdjustment_tendingEntryId_idx" ON "TendingAdjustment"("tendingEntryId");
CREATE INDEX "TendingAdjustment_userId_createdAt_idx" ON "TendingAdjustment"("userId", "createdAt");

ALTER TABLE "TendingAdjustment" ADD CONSTRAINT "TendingAdjustment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingAdjustment" ADD CONSTRAINT "TendingAdjustment_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "TendingCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingAdjustment" ADD CONSTRAINT "TendingAdjustment_tendingEntryId_fkey" FOREIGN KEY ("tendingEntryId") REFERENCES "TendingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingAdjustment" ADD CONSTRAINT "TendingAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
