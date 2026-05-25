-- AlterTable
ALTER TABLE "IdentifiedNeed" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "supersededByNeedId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "refiningNeedId" TEXT;

-- CreateIndex
CREATE INDEX "IdentifiedNeed_supersededByNeedId_idx" ON "IdentifiedNeed"("supersededByNeedId");

-- CreateIndex
CREATE INDEX "IdentifiedNeed_lockedAt_idx" ON "IdentifiedNeed"("lockedAt");

-- CreateIndex
CREATE INDEX "IdentifiedNeed_deletedAt_idx" ON "IdentifiedNeed"("deletedAt");

-- CreateIndex
CREATE INDEX "Message_refiningNeedId_idx" ON "Message"("refiningNeedId");

-- AddForeignKey
ALTER TABLE "IdentifiedNeed" ADD CONSTRAINT "IdentifiedNeed_supersededByNeedId_fkey" FOREIGN KEY ("supersededByNeedId") REFERENCES "IdentifiedNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_refiningNeedId_fkey" FOREIGN KEY ("refiningNeedId") REFERENCES "IdentifiedNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
