-- AlterTable
ALTER TABLE "ReconcilerShareOffer" ADD COLUMN "lastDeliveryNotifiedAt" TIMESTAMP(3),
ADD COLUMN "lastSeenNotifiedAt" TIMESTAMP(3);
