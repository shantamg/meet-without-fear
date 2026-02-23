-- AlterTable
ALTER TABLE "ReconcilerResult" ADD COLUMN "iteration" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "wasCircuitBreakerTrip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ReconcilerShareOffer" ADD COLUMN "iteration" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "refinementChatUsed" BOOLEAN NOT NULL DEFAULT false;
