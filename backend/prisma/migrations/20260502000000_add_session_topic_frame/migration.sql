-- AlterTable
ALTER TABLE "Session"
  ADD COLUMN "topicFrame" TEXT,
  ADD COLUMN "topicFrameConfirmedAt" TIMESTAMP(3);
