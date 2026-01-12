-- CreateTable
CREATE TABLE "SavedMeditation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedMeditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationFeedbackDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readyToShare" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationFeedbackDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedMeditation_userId_createdAt_idx" ON "SavedMeditation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationFeedbackDraft_sessionId_userId_key" ON "ValidationFeedbackDraft"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "SavedMeditation" ADD CONSTRAINT "SavedMeditation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFeedbackDraft" ADD CONSTRAINT "ValidationFeedbackDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFeedbackDraft" ADD CONSTRAINT "ValidationFeedbackDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
