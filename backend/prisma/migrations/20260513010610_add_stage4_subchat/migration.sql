-- CreateEnum
CREATE TYPE "Stage4SubChatAnchor" AS ENUM ('NEEDS_BRAINSTORM', 'PROPOSAL_REFINEMENT', 'NO_OVERLAP');

-- CreateEnum
CREATE TYPE "Stage4SubChatStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- DropIndex
DROP INDEX "SessionTakeaway_embedding_idx";

-- CreateTable
CREATE TABLE "Stage4SubChat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anchorKind" "Stage4SubChatAnchor" NOT NULL,
    "anchorId" TEXT,
    "status" "Stage4SubChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Stage4SubChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage4SubChatMessage" (
    "id" TEXT NOT NULL,
    "subChatId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage4SubChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stage4SubChat_sessionId_userId_status_idx" ON "Stage4SubChat"("sessionId", "userId", "status");

-- CreateIndex
CREATE INDEX "Stage4SubChat_sessionId_anchorKind_anchorId_status_idx" ON "Stage4SubChat"("sessionId", "anchorKind", "anchorId", "status");

-- CreateIndex
CREATE INDEX "Stage4SubChatMessage_subChatId_createdAt_idx" ON "Stage4SubChatMessage"("subChatId", "createdAt");

-- AddForeignKey
ALTER TABLE "Stage4SubChat" ADD CONSTRAINT "Stage4SubChat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage4SubChat" ADD CONSTRAINT "Stage4SubChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage4SubChatMessage" ADD CONSTRAINT "Stage4SubChatMessage_subChatId_fkey" FOREIGN KEY ("subChatId") REFERENCES "Stage4SubChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
