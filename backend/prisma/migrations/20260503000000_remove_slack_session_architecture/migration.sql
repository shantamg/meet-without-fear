-- Remove the deprecated MWF-over-Slack session architecture.
-- Slack triage/test-runner bot infrastructure remains outside the app schema.

DROP TABLE IF EXISTS "SessionSlackThread";

DROP INDEX IF EXISTS "Session_slackJoinCode_key";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "slackJoinCode";

DROP INDEX IF EXISTS "User_slackUserId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "slackUserId";
