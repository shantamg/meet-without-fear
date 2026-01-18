-- AlterTable
ALTER TABLE "UserVessel" ADD COLUMN     "notableFacts" TEXT[] DEFAULT ARRAY[]::TEXT[];
