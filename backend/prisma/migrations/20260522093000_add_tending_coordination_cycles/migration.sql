CREATE TYPE "TendingCoordinationStatus" AS ENUM ('WAITING_FOR_PARTNER', 'READY_TO_RESOLVE', 'RESOLVED', 'TIMED_OUT');

CREATE TABLE "TendingCoordinationCycle" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "TendingCoordinationStatus" NOT NULL DEFAULT 'WAITING_FOR_PARTNER',
    "entryIds" TEXT[],
    "participantUserIds" TEXT[],
    "submittedUserIds" TEXT[],
    "responseDeadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TendingCoordinationCycle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TendingCheckin"
ADD COLUMN "coordinationCycleId" TEXT;

CREATE INDEX "TendingCoordinationCycle_sessionId_status_idx" ON "TendingCoordinationCycle"("sessionId", "status");
CREATE INDEX "TendingCoordinationCycle_responseDeadlineAt_idx" ON "TendingCoordinationCycle"("responseDeadlineAt");
CREATE INDEX "TendingCheckin_coordinationCycleId_idx" ON "TendingCheckin"("coordinationCycleId");

ALTER TABLE "TendingCoordinationCycle" ADD CONSTRAINT "TendingCoordinationCycle_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingCoordinationCycle" ADD CONSTRAINT "TendingCoordinationCycle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingCheckin" ADD CONSTRAINT "TendingCheckin_coordinationCycleId_fkey" FOREIGN KEY ("coordinationCycleId") REFERENCES "TendingCoordinationCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
