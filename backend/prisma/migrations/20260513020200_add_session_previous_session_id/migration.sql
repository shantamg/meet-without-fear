-- Stage 4 Phase 5: Session lineage for the NEW_PROCESS check-in path.
-- previousSessionId is nullable and self-referential (a fresh session can point back
-- at the session whose Tending check-in chose NEW_PROCESS).

ALTER TABLE "Session" ADD COLUMN "previousSessionId" TEXT;

CREATE INDEX "Session_previousSessionId_idx" ON "Session"("previousSessionId");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_previousSessionId_fkey"
  FOREIGN KEY ("previousSessionId") REFERENCES "Session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
