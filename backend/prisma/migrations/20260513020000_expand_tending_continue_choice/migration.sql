-- Stage 4 Phase 5: introduce ContinueChoice enum with the five forward paths and
-- remap legacy continueChoice string values onto the new enum.

-- CreateEnum
CREATE TYPE "ContinueChoice" AS ENUM (
  'ANOTHER_ROUND',
  'EXTEND',
  'NEW_PROCESS',
  'PARTIAL_CLOSURE',
  'FULL_CLOSURE'
);

-- Remap historical string values BEFORE column type change so the USING clause is total.
-- CONTINUE -> EXTEND, ADJUST -> ANOTHER_ROUND, CLOSE -> FULL_CLOSURE.
-- Any unknown legacy value (e.g. NEW_PROCESS, OTHER_TRACK) maps to NULL — surface in followup if needed.
UPDATE "TendingResponse"
SET "continueChoice" = CASE "continueChoice"
  WHEN 'CONTINUE'        THEN 'EXTEND'
  WHEN 'ADJUST'          THEN 'ANOTHER_ROUND'
  WHEN 'CLOSE'           THEN 'FULL_CLOSURE'
  WHEN 'NEW_PROCESS'     THEN 'NEW_PROCESS'
  WHEN 'ANOTHER_ROUND'   THEN 'ANOTHER_ROUND'
  WHEN 'EXTEND'          THEN 'EXTEND'
  WHEN 'PARTIAL_CLOSURE' THEN 'PARTIAL_CLOSURE'
  WHEN 'FULL_CLOSURE'    THEN 'FULL_CLOSURE'
  ELSE NULL
END;

ALTER TABLE "TendingResponse"
  ALTER COLUMN "continueChoice" TYPE "ContinueChoice"
  USING "continueChoice"::"ContinueChoice";
