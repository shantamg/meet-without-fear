-- Stage 4 Phase 5: per-TendingEntry resolution table for the PARTIAL_CLOSURE path.

-- CreateEnum
CREATE TYPE "PartialClosureResolution" AS ENUM ('RESOLVED', 'CONTINUING');

-- CreateTable
CREATE TABLE "TendingResponsePartialClosure" (
    "id" TEXT NOT NULL,
    "tendingResponseId" TEXT NOT NULL,
    "tendingEntryId" TEXT NOT NULL,
    "resolution" "PartialClosureResolution" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingResponsePartialClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TendingResponsePartialClosure_tendingResponseId_tendingEntr_key"
  ON "TendingResponsePartialClosure"("tendingResponseId", "tendingEntryId");

-- CreateIndex
CREATE INDEX "TendingResponsePartialClosure_tendingEntryId_idx"
  ON "TendingResponsePartialClosure"("tendingEntryId");

-- AddForeignKey
ALTER TABLE "TendingResponsePartialClosure"
  ADD CONSTRAINT "TendingResponsePartialClosure_tendingResponseId_fkey"
  FOREIGN KEY ("tendingResponseId") REFERENCES "TendingResponse"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendingResponsePartialClosure"
  ADD CONSTRAINT "TendingResponsePartialClosure_tendingEntryId_fkey"
  FOREIGN KEY ("tendingEntryId") REFERENCES "TendingEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
