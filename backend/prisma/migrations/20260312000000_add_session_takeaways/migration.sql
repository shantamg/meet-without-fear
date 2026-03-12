-- CreateEnum
CREATE TYPE "TakeawaySource" AS ENUM ('AI', 'USER');

-- AlterEnum
ALTER TYPE "BrainActivityCallType" ADD VALUE 'DISTILLATION';

-- AlterTable
ALTER TABLE "InnerWorkSession" ADD COLUMN "distilledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionTakeaway" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "theme" TEXT,
    "source" "TakeawaySource" NOT NULL DEFAULT 'AI',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTakeaway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionTakeaway_sessionId_position_idx" ON "SessionTakeaway"("sessionId", "position");

-- AddForeignKey
ALTER TABLE "SessionTakeaway" ADD CONSTRAINT "SessionTakeaway_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InnerWorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
