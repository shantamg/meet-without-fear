-- AlterTable: Make sessionId nullable on BrainActivity
ALTER TABLE "BrainActivity" ALTER COLUMN "sessionId" DROP NOT NULL;

-- AddColumn: Add innerWorkSessionId to BrainActivity
ALTER TABLE "BrainActivity" ADD COLUMN "innerWorkSessionId" TEXT;

-- CreateIndex
CREATE INDEX "BrainActivity_innerWorkSessionId_idx" ON "BrainActivity"("innerWorkSessionId");

-- AddForeignKey
ALTER TABLE "BrainActivity" ADD CONSTRAINT "BrainActivity_innerWorkSessionId_fkey" FOREIGN KEY ("innerWorkSessionId") REFERENCES "InnerWorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
