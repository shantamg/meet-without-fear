-- Operator note: this migration is purely additive — nullable columns, new
-- table, indexes on columns that are currently all-NULL. Safe to run against
-- production without downtime.
--
-- At current scale (small User/Session tables, Render starter tier) the
-- `CREATE UNIQUE INDEX` statements below complete in milliseconds. At 1M+
-- rows, `CREATE UNIQUE INDEX` takes an ACCESS EXCLUSIVE lock for the build
-- duration, which blocks writes. If rerunning this style of migration at
-- scale, split it into two steps: `CREATE UNIQUE INDEX CONCURRENTLY` (no
-- lock) on a prior deploy, then the constraint add.

-- AlterTable: add Slack user identity to User
ALTER TABLE "User" ADD COLUMN "slackUserId" TEXT;
CREATE UNIQUE INDEX "User_slackUserId_key" ON "User"("slackUserId");

-- AlterTable: add Slack join code to Session
ALTER TABLE "Session" ADD COLUMN "slackJoinCode" TEXT;
CREATE UNIQUE INDEX "Session_slackJoinCode_key" ON "Session"("slackJoinCode");

-- CreateTable: SessionSlackThread (per-user DM thread mapping for MWF sessions)
CREATE TABLE "SessionSlackThread" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadTs" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSlackThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionSlackThread_channelId_threadTs_key"
    ON "SessionSlackThread"("channelId", "threadTs");

CREATE UNIQUE INDEX "SessionSlackThread_sessionId_userId_key"
    ON "SessionSlackThread"("sessionId", "userId");

CREATE INDEX "SessionSlackThread_sessionId_idx"
    ON "SessionSlackThread"("sessionId");

CREATE INDEX "SessionSlackThread_channelId_idx"
    ON "SessionSlackThread"("channelId");

ALTER TABLE "SessionSlackThread"
    ADD CONSTRAINT "SessionSlackThread_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
