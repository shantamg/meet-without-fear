-- AlterEnum
ALTER TYPE "BrainActivityCallType" ADD VALUE 'GLOBAL_MEMORY_CONSOLIDATION';

-- AlterTable
ALTER TABLE "UserVessel" ADD COLUMN     "lastViewedShareTabAt" TIMESTAMP(3);
