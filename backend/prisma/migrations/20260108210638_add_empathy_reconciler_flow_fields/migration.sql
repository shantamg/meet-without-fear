-- CreateEnum
CREATE TYPE "EmpathyStatus" AS ENUM ('HELD', 'ANALYZING', 'NEEDS_WORK', 'REVEALED', 'VALIDATED');

-- AlterTable
ALTER TABLE "EmpathyAttempt" ADD COLUMN     "revealedAt" TIMESTAMP(3),
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "EmpathyStatus" NOT NULL DEFAULT 'HELD';

-- Migrate existing empathy attempts to REVEALED status (they were shared before this flow)
UPDATE "EmpathyAttempt" SET "status" = 'REVEALED', "revealedAt" = "sharedAt";

-- AlterTable
ALTER TABLE "ReconcilerResult" ADD COLUMN     "areaHint" TEXT,
ADD COLUMN     "guidanceType" TEXT,
ADD COLUMN     "promptSeed" TEXT;

-- AlterEnum (add new message roles for empathy reveal flow)
ALTER TYPE "MessageRole" ADD VALUE 'EMPATHY_REVEAL_INTRO';
ALTER TYPE "MessageRole" ADD VALUE 'EMPATHY_VALIDATION_PROMPT';

-- AlterEnum (add new notification types for reconciler flow)
ALTER TYPE "NotificationType" ADD VALUE 'EMPATHY_REVEALED';
ALTER TYPE "NotificationType" ADD VALUE 'EMPATHY_NEEDS_WORK';
ALTER TYPE "NotificationType" ADD VALUE 'EMPATHY_VALIDATED';
