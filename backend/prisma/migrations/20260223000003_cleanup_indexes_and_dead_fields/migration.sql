-- Add composite index on Message for badge count and pending actions queries
CREATE INDEX "Message_sessionId_forUserId_role_idx" ON "Message"("sessionId", "forUserId", "role");

-- Remove redundant index from RefinementAttemptCounter (covered by @@unique prefix)
DROP INDEX IF EXISTS "RefinementAttemptCounter_sessionId_idx";

-- Add foreign key for RefinementAttemptCounter -> Session cascade delete
ALTER TABLE "RefinementAttemptCounter" ADD CONSTRAINT "RefinementAttemptCounter_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove dead legacy fields from ReconcilerShareOffer
ALTER TABLE "ReconcilerShareOffer" DROP COLUMN IF EXISTS "quoteOptions";
ALTER TABLE "ReconcilerShareOffer" DROP COLUMN IF EXISTS "recommendedQuote";
