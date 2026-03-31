-- Row Level Security (RLS) Policies
--
-- Ensures that even if application code has a bug, one user cannot
-- read or modify another user's private data at the database level.
--
-- How it works:
-- 1. The app sets `app.current_user_id` via SET LOCAL before each query
-- 2. RLS policies check this variable to filter rows
-- 3. Default-deny: if the variable is not set, no rows are visible
--
-- Tables protected:
-- - InnerWorkSession, InnerWorkMessage (private self-reflection)
-- - UserVessel (private emotional data per session)
-- - UserMemory (personal memories)
-- - StageProgress (per-user progress)
-- - EmpathyDraft (private empathy drafts)
-- ============================================================================
-- Enable RLS on sensitive tables
-- ============================================================================

ALTER TABLE "InnerWorkSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InnerWorkMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserVessel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmpathyDraft" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: InnerWorkSession (user owns their sessions)
-- ============================================================================

CREATE POLICY "inner_work_session_user_isolation"
  ON "InnerWorkSession"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Policies: InnerWorkMessage (via session ownership)
-- ============================================================================

CREATE POLICY "inner_work_message_user_isolation"
  ON "InnerWorkMessage"
  FOR ALL
  USING (
    "sessionId" IN (
      SELECT id FROM "InnerWorkSession"
      WHERE "userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    "sessionId" IN (
      SELECT id FROM "InnerWorkSession"
      WHERE "userId" = current_setting('app.current_user_id', true)
    )
  );

-- ============================================================================
-- Policies: UserVessel (user owns their vessel)
-- ============================================================================

CREATE POLICY "user_vessel_user_isolation"
  ON "UserVessel"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Policies: UserMemory (user owns their memories)
-- ============================================================================

CREATE POLICY "user_memory_user_isolation"
  ON "UserMemory"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Policies: StageProgress (user owns their progress)
-- ============================================================================

CREATE POLICY "stage_progress_user_isolation"
  ON "StageProgress"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Policies: EmpathyDraft (user owns their drafts)
-- ============================================================================

CREATE POLICY "empathy_draft_user_isolation"
  ON "EmpathyDraft"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Bypass policy for service role (migrations, admin, background jobs)
-- ============================================================================
-- The app can bypass RLS by not setting the session variable and using
-- a superuser/owner connection, OR by setting a special bypass flag.
-- Prisma connects as the DB owner which bypasses RLS by default.
-- To enforce RLS, the app must use SET LOCAL within transactions.
--
-- IMPORTANT: RLS only applies to non-superuser roles. If the app connects
-- as the database owner, RLS is bypassed. To enforce it, create a
-- separate app role:
--
--   CREATE ROLE app_user NOINHERIT LOGIN PASSWORD '...';
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
--   ALTER TABLE "InnerWorkSession" FORCE ROW LEVEL SECURITY;
--   (repeat FORCE for each table)
--
-- For now, RLS policies are created but enforcement requires the
-- separate app role setup (done during deployment configuration).
