import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Snapshot } from '../types';
import { listSnapshotsFlat, queueRun } from '../services/api';

// Hardcoded list of e2e specs (mirrored in SnapshotDetailPage).
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

export function NewRunPage() {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<string>(SCENARIOS[0] ?? '');
  const [snapshotId, setSnapshotId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSnapshotsFlat()
      .then(setSnapshots)
      .catch((err: unknown) => {
        // Non-fatal: form still works without snapshot select.
        // eslint-disable-next-line no-console
        console.warn('Failed to load snapshots for select:', err);
      });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!scenario) return;
      setBusy(true);
      setError(null);
      try {
        const created = await queueRun({
          scenario,
          ...(snapshotId ? { starting_snapshot_id: snapshotId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        navigate(`/run/${created.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to queue run');
      } finally {
        setBusy(false);
      }
    },
    [scenario, snapshotId, notes, navigate]
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Queue a new run</h2>
          <div className="page-subtitle">
            The slam-bot picks queued runs every minute.
          </div>
        </div>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      <form onSubmit={handleSubmit} className="form">
        <div className="form-field">
          <label htmlFor="new-run-scenario">Scenario</label>
          <select
            id="new-run-scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            required
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="hint">
            Maps to a file in <span className="mono">e2e/tests/</span>.
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="new-run-snapshot">Starting snapshot (optional)</label>
          <select
            id="new-run-snapshot"
            value={snapshotId}
            onChange={(e) => setSnapshotId(e.target.value)}
          >
            <option value="">— Fresh DB (no snapshot) —</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="hint">
            If set, the bot resets the DB to this snapshot before running.
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="new-run-notes">Notes (optional)</label>
          <textarea
            id="new-run-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Why are you running this?"
          />
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
    </div>
  );
}
