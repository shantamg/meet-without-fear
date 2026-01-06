-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('AI_NAME', 'LANGUAGE', 'COMMUNICATION', 'PERSONAL_INFO', 'RELATIONSHIP', 'PREFERENCE');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('USER_APPROVED', 'USER_CREATED', 'USER_EDITED');

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "content" TEXT NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "MemorySource" NOT NULL DEFAULT 'USER_APPROVED',
    "suggestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMemory_userId_idx" ON "UserMemory"("userId");

-- CreateIndex
CREATE INDEX "UserMemory_userId_sessionId_idx" ON "UserMemory"("userId", "sessionId");

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
