-- Drop NEEDS_DISCUSSION from Stage4SelectionDecision enum.
-- 1. Rewrite any existing selections using the removed value to NOT_WILLING.
-- 2. Recreate the enum without NEEDS_DISCUSSION and swap it in.

UPDATE "Stage4ProposalSelection"
SET "decision" = 'NOT_WILLING'
WHERE "decision" = 'NEEDS_DISCUSSION';

ALTER TYPE "Stage4SelectionDecision" RENAME TO "Stage4SelectionDecision_old";

CREATE TYPE "Stage4SelectionDecision" AS ENUM ('WILLING', 'NOT_WILLING');

ALTER TABLE "Stage4ProposalSelection"
  ALTER COLUMN "decision" TYPE "Stage4SelectionDecision"
  USING ("decision"::text::"Stage4SelectionDecision");

DROP TYPE "Stage4SelectionDecision_old";
