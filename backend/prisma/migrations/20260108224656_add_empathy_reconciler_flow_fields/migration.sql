-- Add new EmpathyStatus values
ALTER TYPE "EmpathyStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SHARING';
ALTER TYPE "EmpathyStatus" ADD VALUE IF NOT EXISTS 'REFINING';

-- Add new ReconcilerShareStatus values
ALTER TYPE "ReconcilerShareStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ReconcilerShareStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- AlterTable: Add new columns to ReconcilerResult
ALTER TABLE "ReconcilerResult" ADD COLUMN IF NOT EXISTS "suggestedShareContent" TEXT,
ADD COLUMN IF NOT EXISTS "suggestedShareReason" TEXT;

-- AlterTable: Add new columns to ReconcilerShareOffer
ALTER TABLE "ReconcilerShareOffer" ADD COLUMN IF NOT EXISTS "refinedContent" TEXT,
ADD COLUMN IF NOT EXISTS "suggestedContent" TEXT,
ADD COLUMN IF NOT EXISTS "suggestedReason" TEXT;

-- Note: The default value for ReconcilerShareOffer.status will be changed to PENDING
-- in a subsequent migration, after the enum value is committed.
