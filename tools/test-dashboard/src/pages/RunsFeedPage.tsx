import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunStatus, TestRun } from '../types';
import { listRuns } from '../services/api';
import { useTestRunsChannel } from '../hooks/useAbly';
import {
  formatDuration,
  formatRelative,
  githubShaUrl,
  shortSha,
} from '../utils/format';

type StatusFilter = 'all' | RunStatus;

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'running',
  'queued',
  'pass',
  'fail',
  'error',
  'cancelled',
];

export function RunsFeedPage() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const refresh = useCallback(() => {
    listRuns()
      .then((r) => {
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

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0,
      running: 0,
      queued: 0,
      pass: 0,
      fail: 0,
      error: 0,
      cancelled: 0,
    };
    if (!runs) return c;
    c.all = runs.length;
    for (const r of runs) c[r.status]++;
    return c;
  }, [runs]);

  const visibleRuns = useMemo(() => {
    if (!runs) return null;
    const term = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (term && !r.scenario.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [runs, statusFilter, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Test Runs</h2>
          <div className="page-subtitle">
            {runs ? `${runs.length} run${runs.length === 1 ? '' : 's'}` : 'Loading…'}
            {' · newest first · live'}
          </div>
        </div>
        <Link to="/new-run" className="btn btn-primary">
          + New Run
        </Link>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      <div className="filter-bar" role="toolbar" aria-label="Filter runs">
        <span className="filter-label">Status</span>
        <div className="filter-pills">
          {STATUS_FILTERS.map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                className={`filter-pill${isActive ? ' active' : ''}`}
                aria-pressed={isActive}
                onClick={() => setStatusFilter(s)}
              >
                <span>{s}</span>
                <span className="count">{counts[s]}</span>
              </button>
            );
          })}
        </div>
        <div className="filter-search">
          <label htmlFor="run-search" className="visually-hidden">
            Search scenarios
          </label>
          <input
            id="run-search"
            type="search"
            placeholder="Filter by scenario name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {runs === null && (
        <div className="card-list" aria-hidden="true">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {runs && visibleRuns && visibleRuns.length === 0 && (
        <div className="empty">
          {runs.length === 0 ? (
            <>
              <p>No runs yet.</p>
              <p>
                <Link to="/new-run">Trigger one</Link> or run the EC2 writer
                script.
              </p>
            </>
          ) : (
            <p>No runs match the current filter.</p>
          )}
        </div>
      )}

      {visibleRuns && visibleRuns.length > 0 && (
        <div className="card-list">
          {visibleRuns.map((run) => (
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
    <Link
      to={`/run/${run.id}`}
      className="run-card"
      data-status={run.status}
      aria-label={`${run.scenario} — ${run.status}`}
    >
      <div className="run-card-header">
        <span className={`status-badge status-${run.status}`}>{run.status}</span>
        <span className="scenario">{run.scenario}</span>
        <span className="trigger-badge">{run.trigger_source}</span>
      </div>
      <div className="run-card-meta">
        <div className="field">
          <span className="label">Started</span>
          <span className="value">{formatRelative(run.started_at)}</span>
        </div>
        <div className="field">
          <span className="label">Duration</span>
          <span className="value">{formatDuration(run.duration_ms)}</span>
        </div>
        <div className="field">
          <span className="label">Stage</span>
          <span className="value">{run.final_stage ?? '—'}</span>
        </div>
        <div className="field">
          <span className="label">Snapshots</span>
          <span className="value">
            {run.starting_snapshot_id ?? '—'} → {run.ending_snapshot_id ?? '—'}
          </span>
        </div>
        <div className="field">
          <span className="label">SHA</span>
          <span className="value">
            {shaUrl ? (
              <a
                href={shaUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {shortSha(run.code_sha)}
              </a>
            ) : (
              '—'
            )}
          </span>
        </div>
        {run.triggered_by && (
          <div className="field">
            <span className="label">By</span>
            <span className="value">{run.triggered_by}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
