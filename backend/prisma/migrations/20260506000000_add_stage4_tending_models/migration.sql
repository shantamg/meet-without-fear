CREATE TYPE "Stage4ProposalKind" AS ENUM ('SHARED_PROPOSAL', 'INDIVIDUAL_COMMITMENT');

CREATE TYPE "Stage4ProposalStatus" AS ENUM ('ACTIVE', 'REVISED', 'REMOVED', 'CONVERTED_TO_AGREEMENT');

CREATE TYPE "Stage4SelectionDecision" AS ENUM ('WILLING', 'NOT_WILLING', 'NEEDS_DISCUSSION');

CREATE TYPE "Stage4ClosureKind" AS ENUM ('SHARED_AGREEMENT', 'NO_SHARED_AGREEMENT');

CREATE TYPE "Stage4ClosureReason" AS ENUM ('MUTUAL_SELECTION', 'NO_OVERLAP', 'BOUNDARY_HONORED', 'USER_STOPPED');

CREATE TYPE "TendingEntryType" AS ENUM ('SCHEDULED_SHARED_AGREEMENT_CHECKIN', 'USER_INITIATED_REENTRY');

CREATE TYPE "TendingEntryStatus" AS ENUM ('SCHEDULED', 'OPEN', 'PARTIAL', 'COMPLETED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "Agreement"
ADD COLUMN "duration" TEXT,
ADD COLUMN "measureOfSuccess" TEXT;

ALTER TABLE "StrategyProposal"
ADD COLUMN "kind" "Stage4ProposalKind" NOT NULL DEFAULT 'SHARED_PROPOSAL',
ADD COLUMN "status" "Stage4ProposalStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "removedAt" TIMESTAMP(3),
ADD COLUMN "removedByUserId" TEXT,
ADD COLUMN "removalReason" TEXT,
ADD COLUMN "parentProposalId" TEXT,
ADD COLUMN "coverageSummary" JSONB,
ADD COLUMN "capturedFromMessageId" TEXT;

CREATE TABLE "Stage4ProposalSelection" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "Stage4SelectionDecision" NOT NULL,
    "note" TEXT,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage4ProposalSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Stage4ProposalRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage4ProposalRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Stage4NeedCoverage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "needId" TEXT,
    "needLabel" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "coverageStatus" TEXT NOT NULL,
    "coveringProposalIds" TEXT[],
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage4NeedCoverage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Stage4Closure" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "Stage4ClosureKind" NOT NULL,
    "reason" "Stage4ClosureReason" NOT NULL,
    "summary" TEXT NOT NULL,
    "sharedAgreementIds" TEXT[],
    "individualProposalIds" TEXT[],
    "openNeedIds" TEXT[],
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage4Closure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TendingEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agreementId" TEXT,
    "type" "TendingEntryType" NOT NULL,
    "status" "TendingEntryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TendingEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TendingResponse" (
    "id" TEXT NOT NULL,
    "tendingEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reflection" TEXT,
    "continueChoice" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TendingResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Stage4ProposalSelection_proposalId_userId_key" ON "Stage4ProposalSelection"("proposalId", "userId");
CREATE INDEX "Stage4ProposalSelection_sessionId_userId_idx" ON "Stage4ProposalSelection"("sessionId", "userId");
CREATE INDEX "Stage4ProposalRevision_proposalId_createdAt_idx" ON "Stage4ProposalRevision"("proposalId", "createdAt");
CREATE INDEX "Stage4ProposalRevision_sessionId_createdAt_idx" ON "Stage4ProposalRevision"("sessionId", "createdAt");
CREATE INDEX "Stage4NeedCoverage_sessionId_idx" ON "Stage4NeedCoverage"("sessionId");
CREATE UNIQUE INDEX "Stage4Closure_sessionId_key" ON "Stage4Closure"("sessionId");
CREATE INDEX "TendingEntry_sessionId_status_idx" ON "TendingEntry"("sessionId", "status");
CREATE INDEX "TendingEntry_agreementId_idx" ON "TendingEntry"("agreementId");
CREATE INDEX "TendingEntry_scheduledFor_idx" ON "TendingEntry"("scheduledFor");
CREATE UNIQUE INDEX "TendingResponse_tendingEntryId_userId_key" ON "TendingResponse"("tendingEntryId", "userId");
CREATE INDEX "StrategyProposal_sessionId_status_idx" ON "StrategyProposal"("sessionId", "status");
CREATE INDEX "StrategyProposal_parentProposalId_idx" ON "StrategyProposal"("parentProposalId");

ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Stage4ProposalSelection" ADD CONSTRAINT "Stage4ProposalSelection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stage4ProposalSelection" ADD CONSTRAINT "Stage4ProposalSelection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stage4ProposalSelection" ADD CONSTRAINT "Stage4ProposalSelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stage4ProposalRevision" ADD CONSTRAINT "Stage4ProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stage4NeedCoverage" ADD CONSTRAINT "Stage4NeedCoverage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stage4Closure" ADD CONSTRAINT "Stage4Closure_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingEntry" ADD CONSTRAINT "TendingEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingEntry" ADD CONSTRAINT "TendingEntry_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingResponse" ADD CONSTRAINT "TendingResponse_tendingEntryId_fkey" FOREIGN KEY ("tendingEntryId") REFERENCES "TendingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TendingResponse" ADD CONSTRAINT "TendingResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
