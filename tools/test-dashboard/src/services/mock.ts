// Mock data fallback. Used in dev when the API is unreachable.
// Snapshot names match the actual files in backend/snapshots/.

import type {
  TestRun,
  Snapshot,
  RunArtifact,
  RunDetail,
  SnapshotNode,
} from '../types';

const NOW = Date.parse('2026-04-26T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

export const MOCK_SNAPSHOTS: Snapshot[] = [
  {
    id: 'snap-01',
    name: 'snapshot-01-after-seed',
    description: 'Fresh DB after seed; no users invited.',
    parent_id: null,
    file_path: 'backend/snapshots/snapshot-01-after-seed--2026-03-01T18-34-41.sql',
    db_state_summary: { sessions: 0, users: 2 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:34:41Z',
  },
  {
    id: 'snap-02',
    name: 'snapshot-02-alice-invitation-sent',
    description: 'Alice has invited Bob.',
    parent_id: 'snap-01',
    file_path: 'backend/snapshots/snapshot-02-alice-invitation-sent--2026-03-01T18-43-36.sql',
    db_state_summary: { sessions: 1, users: 2, invitations: 1 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:43:36Z',
  },
  {
    id: 'snap-03',
    name: 'snapshot-03-invitation-accepted',
    description: 'Bob accepted invitation.',
    parent_id: 'snap-02',
    file_path: 'backend/snapshots/snapshot-03-invitation-accepted--2026-03-01T18-43-57.sql',
    db_state_summary: { sessions: 1, stage: 0 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:43:57Z',
  },
  {
    id: 'snap-04',
    name: 'snapshot-04-bob-stage1-complete',
    description: 'Bob completed stage 1.',
    parent_id: 'snap-03',
    file_path: 'backend/snapshots/snapshot-04-bob-stage1-complete--2026-03-01T18-48-57.sql',
    db_state_summary: { stage: 1 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:48:57Z',
  },
  {
    id: 'snap-05',
    name: 'snapshot-05-empathy-shared',
    description: 'Empathy shared.',
    parent_id: 'snap-04',
    file_path: 'backend/snapshots/snapshot-05-empathy-shared--2026-03-01T18-51-26.sql',
    db_state_summary: { stage: 2 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:51:26Z',
  },
  {
    id: 'snap-06',
    name: 'snapshot-06-context-exchanged',
    description: 'Context exchanged between partners.',
    parent_id: 'snap-05',
    file_path: 'backend/snapshots/snapshot-06-context-exchanged--2026-03-01T18-53-12.sql',
    db_state_summary: { stage: 2 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:53:12Z',
  },
  {
    id: 'snap-07',
    name: 'snapshot-07-empathy-validated',
    description: 'Empathy validated.',
    parent_id: 'snap-06',
    file_path: 'backend/snapshots/snapshot-07-empathy-validated--2026-03-01T18-58-55.sql',
    db_state_summary: { stage: 2 },
    created_by_run_id: null,
    created_at: '2026-03-01T18:58:55Z',
  },
  {
    id: 'snap-08',
    name: 'snapshot-08-stage3-complete',
    description: 'Stage 3 complete.',
    parent_id: 'snap-07',
    file_path: 'backend/snapshots/snapshot-08-stage3-complete--2026-03-01T19-05-48.sql',
    db_state_summary: { stage: 3 },
    created_by_run_id: null,
    created_at: '2026-03-01T19:05:48Z',
  },
  {
    id: 'snap-09',
    name: 'snapshot-09-session-resolved',
    description: 'Session resolved at stage 4.',
    parent_id: 'snap-08',
    file_path: 'backend/snapshots/snapshot-09-session-resolved--2026-03-01T19-21-46.sql',
    db_state_summary: { stage: 4 },
    created_by_run_id: null,
    created_at: '2026-03-01T19:21:46Z',
  },
];

export const MOCK_RUNS: TestRun[] = [
  {
    id: 'run-001',
    scenario: 'two-browser-full-flow',
    status: 'pass',
    started_at: minutesAgo(10),
    finished_at: minutesAgo(5),
    duration_ms: 5 * 60_000,
    final_stage: 4,
    starting_snapshot_id: 'snap-01',
    ending_snapshot_id: 'snap-09',
    code_sha: 'c7ee67b1234567',
    trigger_source: 'cron',
    triggered_by: 'daily-smoke',
    error_message: null,
    failed_assertion: null,
    failed_test_file: null,
    failed_test_line: null,
    notes: null,
    created_at: minutesAgo(10),
  },
  {
    id: 'run-002',
    scenario: 'two-browser-stage-3',
    status: 'fail',
    started_at: minutesAgo(45),
    finished_at: minutesAgo(40),
    duration_ms: 5 * 60_000,
    final_stage: 3,
    starting_snapshot_id: 'snap-07',
    ending_snapshot_id: null,
    code_sha: '2c0382e1234567',
    trigger_source: 'slack',
    triggered_by: 'jason@galuten.com',
    error_message: 'Expected stage transition message but found nothing',
    failed_assertion: "expect(page.locator('.transition-message')).toBeVisible()",
    failed_test_file: 'e2e/tests/two-browser-stage-3.spec.ts',
    failed_test_line: 142,
    notes: null,
    created_at: minutesAgo(45),
  },
  {
    id: 'run-003',
    scenario: 'single-user-journey',
    status: 'running',
    started_at: minutesAgo(2),
    finished_at: null,
    duration_ms: null,
    final_stage: 1,
    starting_snapshot_id: 'snap-01',
    ending_snapshot_id: null,
    code_sha: 'c7ee67b1234567',
    trigger_source: 'web',
    triggered_by: 'jason@galuten.com',
    error_message: null,
    failed_assertion: null,
    failed_test_file: null,
    failed_test_line: null,
    notes: 'Smoke after waiting-status copy fix',
    created_at: minutesAgo(2),
  },
  {
    id: 'run-004',
    scenario: 'two-browser-reconciler-offer-optional',
    status: 'queued',
    started_at: minutesAgo(1),
    finished_at: null,
    duration_ms: null,
    final_stage: null,
    starting_snapshot_id: 'snap-06',
    ending_snapshot_id: null,
    code_sha: null,
    trigger_source: 'web',
    triggered_by: 'jason@galuten.com',
    error_message: null,
    failed_assertion: null,
    failed_test_file: null,
    failed_test_line: null,
    notes: null,
    created_at: minutesAgo(1),
  },
  {
    id: 'run-005',
    scenario: 'two-browser-circuit-breaker',
    status: 'error',
    started_at: minutesAgo(180),
    finished_at: minutesAgo(178),
    duration_ms: 2 * 60_000,
    final_stage: null,
    starting_snapshot_id: 'snap-04',
    ending_snapshot_id: null,
    code_sha: '8507b6c1234567',
    trigger_source: 'manual',
    triggered_by: 'shantam@example.com',
    error_message: 'browser launch timed out after 30s',
    failed_assertion: null,
    failed_test_file: null,
    failed_test_line: null,
    notes: null,
    created_at: minutesAgo(180),
  },
  {
    id: 'run-006',
    scenario: 'partner-journey',
    status: 'cancelled',
    started_at: minutesAgo(360),
    finished_at: minutesAgo(359),
    duration_ms: 60_000,
    final_stage: 0,
    starting_snapshot_id: 'snap-01',
    ending_snapshot_id: null,
    code_sha: '250d0d71234567',
    trigger_source: 'cron',
    triggered_by: null,
    error_message: 'cancelled by superseding run',
    failed_assertion: null,
    failed_test_file: null,
    failed_test_line: null,
    notes: null,
    created_at: minutesAgo(360),
  },
];

export const MOCK_ARTIFACTS_BY_RUN: Record<string, RunArtifact[]> = {
  'run-001': [
    {
      id: 'a-001-1',
      run_id: 'run-001',
      type: 'screenshot',
      blob_url: 'https://placehold.co/640x400/0a0e1a/4ade80?text=Step+1+%E2%80%94+Invitation',
      inline_text: null,
      caption: 'Step 1 — Alice sends invitation',
      step_index: 1,
      created_at: minutesAgo(9),
    },
    {
      id: 'a-001-2',
      run_id: 'run-001',
      type: 'screenshot',
      blob_url: 'https://placehold.co/640x400/0a0e1a/4ade80?text=Step+2+%E2%80%94+Stage+1',
      inline_text: null,
      caption: 'Step 2 — Stage 1 complete',
      step_index: 2,
      created_at: minutesAgo(8),
    },
    {
      id: 'a-001-3',
      run_id: 'run-001',
      type: 'screenshot',
      blob_url: 'https://placehold.co/640x400/0a0e1a/4ade80?text=Step+3+%E2%80%94+Resolved',
      inline_text: null,
      caption: 'Step 3 — Session resolved',
      step_index: 3,
      created_at: minutesAgo(5),
    },
    {
      id: 'a-001-t',
      run_id: 'run-001',
      type: 'transcript',
      blob_url: null,
      inline_text:
        '[Alice] I feel hurt when meetings start late.\n[Bob] I hear that meetings starting late hurts you.\n[Alice] Yes — exactly.',
      caption: 'Full transcript',
      step_index: 99,
      created_at: minutesAgo(5),
    },
  ],
  'run-002': [
    {
      id: 'a-002-1',
      run_id: 'run-002',
      type: 'screenshot',
      blob_url: 'https://placehold.co/640x400/0a0e1a/f87171?text=Failed+at+Stage+3',
      inline_text: null,
      caption: 'Failed at stage 3 — transition missing',
      step_index: 1,
      created_at: minutesAgo(41),
    },
    {
      id: 'a-002-c',
      run_id: 'run-002',
      type: 'console',
      blob_url: null,
      inline_text:
        '[log] navigating to /session/abc\n[warn] retry 1/3 polling Ably channel\n[error] expected transition message but found nothing',
      caption: 'Console log',
      step_index: 50,
      created_at: minutesAgo(40),
    },
    {
      id: 'a-002-e',
      run_id: 'run-002',
      type: 'page_error',
      blob_url: null,
      inline_text:
        'TypeError: Cannot read property "stage" of undefined\n  at TransitionMessage (/src/components/TransitionMessage.tsx:42:18)',
      caption: 'Page error',
      step_index: 51,
      created_at: minutesAgo(40),
    },
  ],
  'run-003': [
    {
      id: 'a-003-1',
      run_id: 'run-003',
      type: 'screenshot',
      blob_url: 'https://placehold.co/640x400/0a0e1a/60a5fa?text=Running+%E2%80%94+Stage+1',
      inline_text: null,
      caption: 'Currently at stage 1',
      step_index: 1,
      created_at: minutesAgo(1),
    },
  ],
  'run-005': [
    {
      id: 'a-005-e',
      run_id: 'run-005',
      type: 'page_error',
      blob_url: null,
      inline_text: 'Error: browser launch timed out after 30s',
      caption: 'Launch error',
      step_index: 0,
      created_at: minutesAgo(179),
    },
  ],
};

export function buildMockRunDetail(id: string): RunDetail | null {
  const run = MOCK_RUNS.find((r) => r.id === id);
  if (!run) return null;
  const artifacts = MOCK_ARTIFACTS_BY_RUN[run.id] ?? [];
  const starting =
    MOCK_SNAPSHOTS.find((s) => s.id === run.starting_snapshot_id) ?? null;
  const ending =
    MOCK_SNAPSHOTS.find((s) => s.id === run.ending_snapshot_id) ?? null;
  return {
    ...run,
    artifacts,
    starting_snapshot: starting,
    ending_snapshot: ending,
  };
}

export function buildMockSnapshotTree(): SnapshotNode[] {
  const byId = new Map<string, SnapshotNode>();
  for (const s of MOCK_SNAPSHOTS) {
    byId.set(s.id, {
      ...s,
      children: [],
      run_count: MOCK_RUNS.filter((r) => r.starting_snapshot_id === s.id).length,
    });
  }
  const roots: SnapshotNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function buildMockSnapshotDetail(id: string): {
  snapshot: Snapshot;
  runs: TestRun[];
  parent: Snapshot | null;
  children: Snapshot[];
} | null {
  const snapshot = MOCK_SNAPSHOTS.find((s) => s.id === id);
  if (!snapshot) return null;
  const parent = snapshot.parent_id
    ? MOCK_SNAPSHOTS.find((s) => s.id === snapshot.parent_id) ?? null
    : null;
  const children = MOCK_SNAPSHOTS.filter((s) => s.parent_id === id);
  const runs = MOCK_RUNS.filter((r) => r.starting_snapshot_id === id);
  return { snapshot, runs, parent, children };
}
