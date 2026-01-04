-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SESSION_ABANDONED';

-- DropForeignKey
ALTER TABLE "ConsentedContent" DROP CONSTRAINT "ConsentedContent_sourceUserId_fkey";

-- DropForeignKey
ALTER TABLE "EmpathyAttempt" DROP CONSTRAINT "EmpathyAttempt_draftId_fkey";

-- DropForeignKey
ALTER TABLE "EmpathyAttempt" DROP CONSTRAINT "EmpathyAttempt_sourceUserId_fkey";

-- DropForeignKey
ALTER TABLE "EmpathyValidation" DROP CONSTRAINT "EmpathyValidation_userId_fkey";

-- AlterTable
ALTER TABLE "ConsentedContent" ALTER COLUMN "sourceUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmpathyAttempt" ALTER COLUMN "draftId" DROP NOT NULL,
ALTER COLUMN "sourceUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmpathyValidation" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ConsentedContent" ADD CONSTRAINT "ConsentedContent_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EmpathyDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyValidation" ADD CONSTRAINT "EmpathyValidation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
