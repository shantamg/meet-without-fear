// Fetch helpers for the test dashboard API.
// In dev (and when VITE_USE_REAL_API is not set), failures fall back to mock data
// so the UI remains browsable without the API running.

import type {
  TestRun,
  RunDetail,
  Snapshot,
  SnapshotNode,
} from '../types';
import {
  MOCK_RUNS,
  MOCK_SNAPSHOTS,
  buildMockRunDetail,
  buildMockSnapshotTree,
  buildMockSnapshotDetail,
} from './mock';

const SHOULD_FALLBACK =
  import.meta.env.DEV && !import.meta.env.VITE_USE_REAL_API;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function withFallback<T>(
  fetcher: () => Promise<T>,
  fallback: () => T | null,
  label: string
): Promise<T> {
  return fetcher().catch((err: unknown) => {
    if (!SHOULD_FALLBACK) throw err;
    const mock = fallback();
    if (mock === null) {
      throw err;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[api] ${label} failed, falling back to mock data:`,
      err instanceof Error ? err.message : err
    );
    return mock;
  });
}

export function listRuns(): Promise<TestRun[]> {
  return withFallback<TestRun[]>(
    () => getJSON<TestRun[]>('/api/runs'),
    () => MOCK_RUNS,
    'listRuns'
  );
}

export function getRun(id: string): Promise<RunDetail> {
  return withFallback<RunDetail>(
    () => getJSON<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),
    () => buildMockRunDetail(id),
    `getRun(${id})`
  );
}

export function listSnapshots(): Promise<SnapshotNode[]> {
  return withFallback<SnapshotNode[]>(
    () => getJSON<SnapshotNode[]>('/api/snapshots'),
    () => buildMockSnapshotTree(),
    'listSnapshots'
  );
}

export interface SnapshotDetailResponse {
  snapshot: Snapshot;
  runs: TestRun[];
  parent: Snapshot | null;
  children: Snapshot[];
}

export function getSnapshot(id: string): Promise<SnapshotDetailResponse> {
  return withFallback<SnapshotDetailResponse>(
    () => getJSON<SnapshotDetailResponse>(`/api/snapshots/${encodeURIComponent(id)}`),
    () => buildMockSnapshotDetail(id),
    `getSnapshot(${id})`
  );
}

export interface QueueRunPayload {
  scenario: string;
  starting_snapshot_id?: string;
  notes?: string;
}

export function queueRun(payload: QueueRunPayload): Promise<TestRun> {
  // No mock fallback for POST — we want errors to surface so the user knows the
  // backend isn't wired yet.
  return postJSON<TestRun>('/api/runs', payload);
}

/**
 * Returns the flat list of snapshots from the server (helper for forms that
 * need a select list rather than the full tree).
 */
export async function listSnapshotsFlat(): Promise<Snapshot[]> {
  const tree = await listSnapshots();
  const out: Snapshot[] = [];
  const visit = (node: SnapshotNode) => {
    const { children: _children, run_count: _run_count, ...snapshot } = node;
    out.push(snapshot);
    node.children.forEach(visit);
  };
  tree.forEach(visit);
  if (out.length === 0 && SHOULD_FALLBACK) return MOCK_SNAPSHOTS;
  return out;
}
