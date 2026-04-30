-- Remove unenforced Row Level Security (RLS) policies.
--
-- Migration 20260311000000_add_row_level_security created policies that depend on
-- app.current_user_id being set on every transaction. Production Prisma code does
-- not set that variable, and the app connects as the table owner, so these
-- policies are bypassed at runtime. Drop the misleading policies and disable RLS
-- until the application is ready to enforce it end-to-end with a non-owner role.

DROP POLICY IF EXISTS "inner_work_session_user_isolation" ON "InnerWorkSession";
DROP POLICY IF EXISTS "inner_work_message_user_isolation" ON "InnerWorkMessage";
DROP POLICY IF EXISTS "user_vessel_user_isolation" ON "UserVessel";
DROP POLICY IF EXISTS "user_memory_user_isolation" ON "UserMemory";
DROP POLICY IF EXISTS "stage_progress_user_isolation" ON "StageProgress";
DROP POLICY IF EXISTS "empathy_draft_user_isolation" ON "EmpathyDraft";

ALTER TABLE "InnerWorkSession" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "InnerWorkMessage" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "UserVessel" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "StageProgress" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "EmpathyDraft" DISABLE ROW LEVEL SECURITY;
