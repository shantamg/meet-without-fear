// Shared types for the test dashboard.
// Must match the contract agreed with the API/bot author exactly.

export type RunStatus =
  | 'queued'
  | 'running'
  | 'pass'
  | 'fail'
  | 'error'
  | 'cancelled';

export type TriggerSource = 'slack' | 'cron' | 'web' | 'manual';

export type ArtifactType =
  | 'screenshot'
  | 'transcript'
  | 'page_error'
  | 'console';

export interface TestRun {
  id: string;
  scenario: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  final_stage: number | null;
  starting_snapshot_id: string | null;
  ending_snapshot_id: string | null;
  code_sha: string | null;
  trigger_source: TriggerSource;
  triggered_by: string | null;
  error_message: string | null;
  failed_assertion: string | null;
  failed_test_file: string | null;
  failed_test_line: number | null;
  notes: string | null;
  created_at: string;
}

export interface Snapshot {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  file_path: string;
  db_state_summary: unknown | null;
  created_by_run_id: string | null;
  created_at: string;
}

export interface RunArtifact {
  id: string;
  run_id: string;
  type: ArtifactType;
  blob_url: string | null;
  inline_text: string | null;
  caption: string | null;
  step_index: number;
  created_at: string;
}

export interface RunDetail extends TestRun {
  artifacts: RunArtifact[];
  starting_snapshot: Snapshot | null;
  ending_snapshot: Snapshot | null;
}

export interface SnapshotNode extends Snapshot {
  children: SnapshotNode[];
  run_count: number;
}
