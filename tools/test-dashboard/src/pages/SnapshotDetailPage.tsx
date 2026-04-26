import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Snapshot, TestRun } from '../types';
import { getSnapshot, queueRun } from '../services/api';
import {
  formatDuration,
  formatRelative,
  shortSha,
} from '../utils/format';

// Hardcoded list of e2e specs (kept short — full list lives in e2e/tests/).
// In Phase 1B the API can return the canonical list.
const SCENARIOS = [
  'single-user-journey',
  'partner-journey',
  'two-browser-smoke',
  'two-browser-stage-0',
  'two-browser-stage-1',
  'two-browser-stage-2',
  'two-browser-stage-3',
  'two-browser-stage-4',
  'two-browser-full-flow',
  'two-browser-circuit-breaker',
  'two-browser-reconciler-offer-optional',
  'two-browser-reconciler-offer-sharing-refinement',
  'stage-3-4-complete',
  'live-ai-full-flow',
];

export function SnapshotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    snapshot: Snapshot;
    runs: TestRun[];
    parent: Snapshot | null;
    children: Snapshot[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string>(SCENARIOS[0] ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSnapshot(id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load snapshot');
      });
  }, [id]);

  const handleRun = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!id || !scenario) return;
      setBusy(true);
      try {
        const created = await queueRun({
          scenario,
          starting_snapshot_id: id,
        });
        navigate(`/run/${created.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to queue run');
      } finally {
        setBusy(false);
      }
    },
    [id, scenario, navigate]
  );

  if (!id) return <div className="empty">Missing snapshot id.</div>;
  if (error && !data) return <div className="error-banner">Error: {error}</div>;
  if (!data) return <div className="loading">Loading snapshot…</div>;

  const { snapshot, runs, parent, children } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{snapshot.name}</h2>
          {snapshot.description && (
            <div className="page-subtitle">{snapshot.description}</div>
          )}
        </div>
        <Link to="/snapshots" className="btn">
          ← Tree
        </Link>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      <section className="detail-section">
        <h3>Metadata</h3>
        <div className="kv">
          <span className="k">ID</span>
          <span className="v mono">{snapshot.id}</span>
          <span className="k">File path</span>
          <span className="v mono">{snapshot.file_path}</span>
          <span className="k">Parent</span>
          <span className="v">
            {parent ? (
              <Link to={`/snapshot/${parent.id}`}>{parent.name}</Link>
            ) : (
              '(root)'
            )}
          </span>
          <span className="k">Created</span>
          <span className="v">{formatRelative(snapshot.created_at)}</span>
        </div>

        {snapshot.db_state_summary !== null &&
          snapshot.db_state_summary !== undefined && (
            <details className="json-block" style={{ marginTop: '0.75rem' }}>
              <summary>DB state summary</summary>
              <pre>{JSON.stringify(snapshot.db_state_summary, null, 2)}</pre>
            </details>
          )}
      </section>

      <section className="detail-section">
        <h3>Run scenario from here</h3>
        <form onSubmit={handleRun} className="form">
          <div className="form-field">
            <label htmlFor="scenario-select">Scenario</label>
            <select
              id="scenario-select"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !scenario}
            >
              {busy ? 'Queueing…' : 'Queue run'}
            </button>
          </div>
        </form>
      </section>

      <section className="detail-section">
        <h3>Child snapshots ({children.length})</h3>
        {children.length === 0 ? (
          <div className="empty" style={{ padding: '1rem' }}>
            No children yet.
          </div>
        ) : (
          <ul className="snapshot-tree">
            {children.map((c) => (
              <li key={c.id}>
                <Link to={`/snapshot/${c.id}`} className="snapshot-link">
                  <span className="mono">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <h3>Runs that started here ({runs.length})</h3>
        {runs.length === 0 ? (
          <div className="empty" style={{ padding: '1rem' }}>
            No runs yet.
          </div>
        ) : (
          <div className="card-list">
            {runs.map((run) => (
              <Link key={run.id} to={`/run/${run.id}`} className="run-card">
                <div className="run-card-header">
                  <span className={`status-badge status-${run.status}`}>
                    {run.status}
                  </span>
                  <span className="scenario">{run.scenario}</span>
                </div>
                <div className="run-card-meta">
                  <span>{formatRelative(run.started_at)}</span>
                  <span>{formatDuration(run.duration_ms)}</span>
                  <span className="mono">{shortSha(run.code_sha)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
