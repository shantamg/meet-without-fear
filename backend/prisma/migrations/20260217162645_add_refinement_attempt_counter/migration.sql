-- AlterTable
ALTER TABLE "InnerWorkSession" ADD COLUMN     "contentEmbedding" vector(1024);

-- AlterTable
ALTER TABLE "UserVessel" ADD COLUMN     "contentEmbedding" vector(1024);

-- CreateTable
CREATE TABLE "RefinementAttemptCounter" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementAttemptCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefinementAttemptCounter_sessionId_idx" ON "RefinementAttemptCounter"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementAttemptCounter_sessionId_direction_key" ON "RefinementAttemptCounter"("sessionId", "direction");
