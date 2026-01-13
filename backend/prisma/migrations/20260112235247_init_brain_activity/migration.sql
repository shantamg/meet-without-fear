/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LLM_CALL', 'EMBEDDING', 'RETRIEVAL', 'TOOL_USE');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- DropTable
DROP TABLE "AuditLog";

-- CreateTable
CREATE TABLE "BrainActivity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT,
    "activityType" "ActivityType" NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "metadata" JSONB,
    "tokenCountInput" INTEGER NOT NULL DEFAULT 0,
    "tokenCountOutput" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BrainActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrainActivity_sessionId_idx" ON "BrainActivity"("sessionId");

-- CreateIndex
CREATE INDEX "BrainActivity_turnId_idx" ON "BrainActivity"("turnId");

-- CreateIndex
CREATE INDEX "BrainActivity_activityType_idx" ON "BrainActivity"("activityType");

-- CreateIndex
CREATE INDEX "BrainActivity_createdAt_idx" ON "BrainActivity"("createdAt");
