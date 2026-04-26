import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TestRun } from '../types';
import { listRuns } from '../services/api';
import { useTestRunsChannel } from '../hooks/useAbly';
import {
  formatDuration,
  formatRelative,
  githubShaUrl,
  shortSha,
} from '../utils/format';

export function RunsFeedPage() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listRuns()
      .then((r) => {
        // Sort newest first defensively.
        const sorted = [...r].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        );
        setRuns(sorted);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: refetch on any test-runs event.
  useTestRunsChannel(useCallback(() => refresh(), [refresh]));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Test Runs</h2>
          <div className="page-subtitle">Newest first. Click for details.</div>
        </div>
        <Link to="/new-run" className="btn btn-primary">
          + New Run
        </Link>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      {runs === null && <div className="loading">Loading runs…</div>}

      {runs && runs.length === 0 && (
        <div className="empty">
          <p>No runs yet.</p>
          <p>
            <Link to="/new-run">Trigger one from /new-run</Link>.
          </p>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="card-list">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: TestRun }) {
  const shaUrl = githubShaUrl(run.code_sha);
  return (
    <Link to={`/run/${run.id}`} className="run-card">
      <div className="run-card-header">
        <span className={`status-badge status-${run.status}`}>{run.status}</span>
        <span className="scenario">{run.scenario}</span>
        <span className="trigger-badge">{run.trigger_source}</span>
      </div>
      <div className="run-card-meta">
        <span>
          <span className="label">started</span>
          {formatRelative(run.started_at)}
        </span>
        <span>
          <span className="label">duration</span>
          {formatDuration(run.duration_ms)}
        </span>
        <span>
          <span className="label">stage</span>
          {run.final_stage ?? '—'}
        </span>
        <span>
          <span className="label">snapshots</span>
          <span className="mono">
            {run.starting_snapshot_id ?? '—'} → {run.ending_snapshot_id ?? '—'}
          </span>
        </span>
        <span>
          <span className="label">sha</span>
          {shaUrl ? (
            <a
              href={shaUrl}
              target="_blank"
              rel="noreferrer"
              className="mono"
              onClick={(e) => e.stopPropagation()}
            >
              {shortSha(run.code_sha)}
            </a>
          ) : (
            <span className="mono">—</span>
          )}
        </span>
        {run.triggered_by && (
          <span>
            <span className="label">by</span>
            {run.triggered_by}
          </span>
        )}
      </div>
    </Link>
  );
}
