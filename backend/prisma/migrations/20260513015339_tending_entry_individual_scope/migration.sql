-- CreateEnum
CREATE TYPE "TendingEntryScope" AS ENUM ('SHARED', 'INDIVIDUAL');

-- AlterEnum
ALTER TYPE "TendingEntryType" ADD VALUE 'SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN';

-- AlterTable
ALTER TABLE "TendingEntry" ADD COLUMN     "optedInShared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "scope" "TendingEntryScope" NOT NULL DEFAULT 'SHARED';

-- CreateIndex
CREATE INDEX "TendingEntry_sessionId_scope_ownerUserId_idx" ON "TendingEntry"("sessionId", "scope", "ownerUserId");
