-- CreateTable
CREATE TABLE "StrategyProposalNeed" (
    "proposalId" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyProposalNeed_pkey" PRIMARY KEY ("proposalId","needId")
);

-- CreateIndex
CREATE INDEX "StrategyProposalNeed_needId_idx" ON "StrategyProposalNeed"("needId");

-- AddForeignKey
ALTER TABLE "StrategyProposalNeed" ADD CONSTRAINT "StrategyProposalNeed_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposalNeed" ADD CONSTRAINT "StrategyProposalNeed_needId_fkey" FOREIGN KEY ("needId") REFERENCES "IdentifiedNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
