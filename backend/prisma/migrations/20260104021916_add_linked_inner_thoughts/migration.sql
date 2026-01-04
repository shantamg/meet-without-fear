-- AlterTable
ALTER TABLE "InnerWorkSession" ADD COLUMN     "linkedAtStage" INTEGER,
ADD COLUMN     "linkedPartnerSessionId" TEXT,
ADD COLUMN     "linkedTrigger" TEXT;

-- CreateIndex
CREATE INDEX "InnerWorkSession_linkedPartnerSessionId_idx" ON "InnerWorkSession"("linkedPartnerSessionId");

-- AddForeignKey
ALTER TABLE "InnerWorkSession" ADD CONSTRAINT "InnerWorkSession_linkedPartnerSessionId_fkey" FOREIGN KEY ("linkedPartnerSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
