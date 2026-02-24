-- DropIndex
DROP INDEX IF EXISTS "EmpathyAttempt_sessionId_sourceUserId_idx";

-- CreateIndex (unique constraint replaces the plain index)
CREATE UNIQUE INDEX "EmpathyAttempt_sessionId_sourceUserId_key" ON "EmpathyAttempt"("sessionId", "sourceUserId");
