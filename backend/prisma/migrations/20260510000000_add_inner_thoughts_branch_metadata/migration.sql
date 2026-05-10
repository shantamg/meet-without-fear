-- Add point-in-time metadata for Inner Thoughts sessions that branch into partner sessions.
ALTER TABLE "InnerWorkSession"
ADD COLUMN "linkedAtMessageId" TEXT,
ADD COLUMN "contextSummarySnapshot" TEXT;

CREATE INDEX "InnerWorkSession_linkedAtMessageId_idx" ON "InnerWorkSession"("linkedAtMessageId");

ALTER TABLE "InnerWorkSession"
ADD CONSTRAINT "InnerWorkSession_linkedAtMessageId_fkey"
FOREIGN KEY ("linkedAtMessageId") REFERENCES "InnerWorkMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
