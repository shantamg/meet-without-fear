-- AlterTable
ALTER TABLE "EmpathyAttempt" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" "SharedContentDeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "seenAt" TIMESTAMP(3);
