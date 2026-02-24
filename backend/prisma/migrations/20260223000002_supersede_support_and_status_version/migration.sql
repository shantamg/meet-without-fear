-- Add supersededAt to ReconcilerResult for audit trail instead of deletion
ALTER TABLE "ReconcilerResult" ADD COLUMN "supersededAt" TIMESTAMP(3);

-- Change @@unique to @@index on ReconcilerResult (allows multiple results per direction)
DROP INDEX IF EXISTS "ReconcilerResult_sessionId_guesserId_subjectId_key";
CREATE INDEX "ReconcilerResult_sessionId_guesserId_subjectId_idx" ON "ReconcilerResult"("sessionId", "guesserId", "subjectId");

-- Add index for hot query path (lookup by sessionId + subjectId)
CREATE INDEX "ReconcilerResult_sessionId_subjectId_idx" ON "ReconcilerResult"("sessionId", "subjectId");

-- Add statusVersion to EmpathyAttempt for event ordering
ALTER TABLE "EmpathyAttempt" ADD COLUMN "statusVersion" INTEGER NOT NULL DEFAULT 0;
