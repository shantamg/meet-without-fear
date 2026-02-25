-- Clean up orphaned ReconcilerResult records (sessionId not in Session table)
DELETE FROM "ReconcilerShareOffer" WHERE "resultId" IN (
  SELECT "id" FROM "ReconcilerResult" WHERE "sessionId" NOT IN (SELECT "id" FROM "Session")
);
DELETE FROM "ReconcilerResult" WHERE "sessionId" NOT IN (SELECT "id" FROM "Session");

-- Clean up orphaned BrainActivity records (sessionId not in Session table)
DELETE FROM "BrainActivity" WHERE "sessionId" NOT IN (SELECT "id" FROM "Session");

-- AddForeignKey: ReconcilerResult.sessionId -> Session.id with CASCADE
ALTER TABLE "ReconcilerResult" ADD CONSTRAINT "ReconcilerResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: BrainActivity.sessionId -> Session.id with CASCADE
ALTER TABLE "BrainActivity" ADD CONSTRAINT "BrainActivity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
