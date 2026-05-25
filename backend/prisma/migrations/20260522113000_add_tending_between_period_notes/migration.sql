-- CreateTable
CREATE TABLE "TendingBetweenPeriodNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "carryForwardSelected" BOOLEAN NOT NULL DEFAULT false,
    "consentToShareWithPartner" BOOLEAN NOT NULL DEFAULT false,
    "shareConsentAt" TIMESTAMP(3),
    "selectedForCheckinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TendingBetweenPeriodNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TendingBetweenPeriodNote_sessionId_userId_createdAt_idx" ON "TendingBetweenPeriodNote"("sessionId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "TendingBetweenPeriodNote_selectedForCheckinId_idx" ON "TendingBetweenPeriodNote"("selectedForCheckinId");

-- AddForeignKey
ALTER TABLE "TendingBetweenPeriodNote" ADD CONSTRAINT "TendingBetweenPeriodNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendingBetweenPeriodNote" ADD CONSTRAINT "TendingBetweenPeriodNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendingBetweenPeriodNote" ADD CONSTRAINT "TendingBetweenPeriodNote_selectedForCheckinId_fkey" FOREIGN KEY ("selectedForCheckinId") REFERENCES "TendingCheckin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
