-- CreateEnum
CREATE TYPE "SharedContentDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'SEEN');

-- AlterTable
ALTER TABLE "ReconcilerShareOffer" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" "SharedContentDeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "seenAt" TIMESTAMP(3);
