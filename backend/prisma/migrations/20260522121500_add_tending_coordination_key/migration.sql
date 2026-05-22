ALTER TABLE "TendingCoordinationCycle"
ADD COLUMN "coordinationKey" TEXT;

CREATE INDEX "TendingCoordinationCycle_coordinationKey_idx"
ON "TendingCoordinationCycle"("coordinationKey");

CREATE UNIQUE INDEX "TendingCoordinationCycle_active_coordinationKey_key"
ON "TendingCoordinationCycle"("coordinationKey")
WHERE "coordinationKey" IS NOT NULL
  AND "status" IN ('WAITING_FOR_PARTNER', 'READY_TO_RESOLVE');
