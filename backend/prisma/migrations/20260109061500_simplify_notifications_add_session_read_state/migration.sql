-- Simplify notification system: Remove Notification model, add session read state tracking
-- This migration removes the per-notification tracking system and replaces it with
-- per-session read state on UserVessel (lastViewedAt, lastSeenChatItemId)

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_invitationId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- AlterTable: Add session read state tracking to UserVessel
ALTER TABLE "UserVessel" ADD COLUMN "lastSeenChatItemId" TEXT,
ADD COLUMN "lastViewedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Notification";

-- DropEnum
DROP TYPE "NotificationType";
