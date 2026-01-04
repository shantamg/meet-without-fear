-- CreateEnum
CREATE TYPE "ReconcilerShareStatus" AS ENUM ('NOT_OFFERED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ReconcilerResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "guesserId" TEXT NOT NULL,
    "guesserName" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "alignmentScore" INTEGER NOT NULL,
    "alignmentSummary" TEXT NOT NULL,
    "correctlyIdentified" TEXT[],
    "gapSeverity" TEXT NOT NULL,
    "gapSummary" TEXT NOT NULL,
    "missedFeelings" TEXT[],
    "misattributions" TEXT[],
    "mostImportantGap" TEXT,
    "recommendedAction" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "sharingWouldHelp" BOOLEAN NOT NULL,
    "suggestedShareFocus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconcilerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconcilerShareOffer" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReconcilerShareStatus" NOT NULL DEFAULT 'NOT_OFFERED',
    "offerMessage" TEXT,
    "quoteOptions" JSONB,
    "recommendedQuote" INTEGER,
    "sharedContent" TEXT,
    "sharedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconcilerShareOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconcilerResult_sessionId_idx" ON "ReconcilerResult"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconcilerResult_sessionId_guesserId_subjectId_key" ON "ReconcilerResult"("sessionId", "guesserId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconcilerShareOffer_resultId_key" ON "ReconcilerShareOffer"("resultId");

-- CreateIndex
CREATE INDEX "ReconcilerShareOffer_userId_status_idx" ON "ReconcilerShareOffer"("userId", "status");

-- AddForeignKey
ALTER TABLE "ReconcilerShareOffer" ADD CONSTRAINT "ReconcilerShareOffer_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ReconcilerResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
