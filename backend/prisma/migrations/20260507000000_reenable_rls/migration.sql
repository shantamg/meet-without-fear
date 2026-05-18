-- Re-enable Row Level Security with comprehensive policies.
--
-- This migration restores and extends the RLS policies that were removed in
-- 20260430000000_remove_unenforced_rls. The original policies were never
-- enforced because Prisma connects as the database owner. This migration:
--
--   1. Re-enables RLS on all high-sensitivity user-owned tables
--   2. Creates USING/WITH CHECK policies based on app.current_user_id
--   3. Does NOT add FORCE ROW LEVEL SECURITY yet — the database owner
--      bypasses RLS by default, so current behaviour is unchanged
--
-- Activation requires infrastructure steps (not code):
--   a. Provision a non-owner application role (e.g. mwf_app)
--   b. GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO mwf_app
--   c. ALTER DEFAULT PRIVILEGES … GRANT ALL TO mwf_app
--   d. Update DATABASE_URL to connect as mwf_app
--   e. Add FORCE ROW LEVEL SECURITY on each table (follow-up migration)
--
-- Until those steps are complete, the application middleware sets
-- app.current_user_id as preparation, and the policies exist but do
-- not restrict the owner connection.

-- ============================================================================
-- Enable RLS on user-owned tables (direct userId column)
-- ============================================================================

ALTER TABLE "InnerWorkSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserVessel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmpathyDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreSessionMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ValidationFeedbackDraft" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Enable RLS on session-scoped tables (membership-based access)
-- ============================================================================

ALTER TABLE "InnerWorkMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmpathyAttempt" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies: direct userId ownership
-- ============================================================================

CREATE POLICY "rls_inner_work_session_user"
  ON "InnerWorkSession" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_user_vessel_user"
  ON "UserVessel" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_user_memory_user"
  ON "UserMemory" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_stage_progress_user"
  ON "StageProgress" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_empathy_draft_user"
  ON "EmpathyDraft" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_consent_record_user"
  ON "ConsentRecord" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_pre_session_message_user"
  ON "PreSessionMessage" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "rls_validation_feedback_draft_user"
  ON "ValidationFeedbackDraft" FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- ============================================================================
-- Policies: InnerWorkMessage (owned via InnerWorkSession.userId)
-- ============================================================================

CREATE POLICY "rls_inner_work_message_user"
  ON "InnerWorkMessage" FOR ALL
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
-- Policies: Message (accessible to both users in the session relationship)
-- ============================================================================

CREATE POLICY "rls_message_session_member"
  ON "Message" FOR ALL
  USING (
    "sessionId" IN (
      SELECT s.id FROM "Session" s
      JOIN "RelationshipMember" rm ON rm."relationshipId" = s."relationshipId"
      WHERE rm."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    "sessionId" IN (
      SELECT s.id FROM "Session" s
      JOIN "RelationshipMember" rm ON rm."relationshipId" = s."relationshipId"
      WHERE rm."userId" = current_setting('app.current_user_id', true)
    )
  );

-- ============================================================================
-- Policies: EmpathyAttempt (accessible to both users in the session)
-- ============================================================================

CREATE POLICY "rls_empathy_attempt_session_member"
  ON "EmpathyAttempt" FOR ALL
  USING (
    "sessionId" IN (
      SELECT s.id FROM "Session" s
      JOIN "RelationshipMember" rm ON rm."relationshipId" = s."relationshipId"
      WHERE rm."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    "sessionId" IN (
      SELECT s.id FROM "Session" s
      JOIN "RelationshipMember" rm ON rm."relationshipId" = s."relationshipId"
      WHERE rm."userId" = current_setting('app.current_user_id', true)
    )
  );
