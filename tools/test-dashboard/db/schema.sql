-- Test Dashboard schema (Vercel Postgres)
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- snapshots: a captured DB state on EC2 (a `.sql` file) that runs can branch from.
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT,
  file_path TEXT NOT NULL,
  db_state_summary JSONB,
  created_by_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- test_runs: one execution of a Playwright scenario.
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  final_stage SMALLINT,
  starting_snapshot_id TEXT,
  ending_snapshot_id TEXT,
  code_sha TEXT,
  trigger_source TEXT NOT NULL,
  triggered_by TEXT,
  error_message TEXT,
  failed_assertion TEXT,
  failed_test_file TEXT,
  failed_test_line INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT test_runs_status_check
    CHECK (status IN ('queued', 'running', 'pass', 'fail', 'error', 'cancelled')),
  CONSTRAINT test_runs_trigger_source_check
    CHECK (trigger_source IN ('slack', 'cron', 'web', 'manual')),
  CONSTRAINT test_runs_final_stage_check
    CHECK (final_stage IS NULL OR (final_stage >= 0 AND final_stage <= 4))
);

-- run_artifacts: screenshots, transcripts, page errors, console logs.
CREATE TABLE IF NOT EXISTS run_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  blob_url TEXT,
  inline_text TEXT,
  caption TEXT,
  step_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT run_artifacts_type_check
    CHECK (type IN ('screenshot', 'transcript', 'page_error', 'console'))
);

-- Foreign keys (added separately so re-running is safe; we drop+re-add via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'test_runs_starting_snapshot_id_fkey'
  ) THEN
    ALTER TABLE test_runs
      ADD CONSTRAINT test_runs_starting_snapshot_id_fkey
      FOREIGN KEY (starting_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'test_runs_ending_snapshot_id_fkey'
  ) THEN
    ALTER TABLE test_runs
      ADD CONSTRAINT test_runs_ending_snapshot_id_fkey
      FOREIGN KEY (ending_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'snapshots_parent_id_fkey'
  ) THEN
    ALTER TABLE snapshots
      ADD CONSTRAINT snapshots_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES snapshots(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'snapshots_created_by_run_id_fkey'
  ) THEN
    ALTER TABLE snapshots
      ADD CONSTRAINT snapshots_created_by_run_id_fkey
      FOREIGN KEY (created_by_run_id) REFERENCES test_runs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'run_artifacts_run_id_fkey'
  ) THEN
    ALTER TABLE run_artifacts
      ADD CONSTRAINT run_artifacts_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS test_runs_created_at_idx ON test_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS test_runs_status_idx ON test_runs (status);
CREATE INDEX IF NOT EXISTS test_runs_scenario_idx ON test_runs (scenario);
CREATE INDEX IF NOT EXISTS test_runs_starting_snapshot_id_idx ON test_runs (starting_snapshot_id);
CREATE INDEX IF NOT EXISTS snapshots_parent_id_idx ON snapshots (parent_id);
CREATE INDEX IF NOT EXISTS run_artifacts_run_id_step_idx ON run_artifacts (run_id, step_index);

INSERT INTO schema_migrations (version) VALUES ('001')
ON CONFLICT (version) DO NOTHING;
