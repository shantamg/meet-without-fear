-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('CONFLICT_RESOLUTION', 'INNER_WORK');

-- CreateEnum
CREATE TYPE "InnerWorkStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "type" "SessionType" NOT NULL DEFAULT 'CONFLICT_RESOLUTION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memoryPreferences" JSONB;

-- CreateTable
CREATE TABLE "InnerWorkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "theme" TEXT,
    "status" "InnerWorkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InnerWorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InnerWorkMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "InnerWorkMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InnerWorkSession_userId_updatedAt_idx" ON "InnerWorkSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "InnerWorkSession_status_idx" ON "InnerWorkSession"("status");

-- CreateIndex
CREATE INDEX "InnerWorkMessage_sessionId_timestamp_idx" ON "InnerWorkMessage"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "Session_type_idx" ON "Session"("type");

-- AddForeignKey
ALTER TABLE "InnerWorkSession" ADD CONSTRAINT "InnerWorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InnerWorkMessage" ADD CONSTRAINT "InnerWorkMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InnerWorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
