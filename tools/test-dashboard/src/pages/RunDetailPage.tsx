import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RunArtifact, RunDetail } from '../types';
import { getRun, queueRun } from '../services/api';
import { useTestRunsChannel } from '../hooks/useAbly';
import {
  formatDuration,
  formatTimestamp,
  githubFileUrl,
  githubShaUrl,
  shortSha,
} from '../utils/format';

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    getRun(id)
      .then((r) => {
        setRun(r);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load run');
      });
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: refetch when this run changes.
  useTestRunsChannel(
    useCallback(
      (event) => {
        if (event.run_id === id) refresh();
      },
      [id, refresh]
    )
  );

  const handleRequeue = useCallback(
    async (withStartingSnapshot: boolean) => {
      if (!run) return;
      setBusy(true);
      try {
        const created = await queueRun({
          scenario: run.scenario,
          ...(withStartingSnapshot && run.starting_snapshot_id
            ? { starting_snapshot_id: run.starting_snapshot_id }
            : {}),
        });
        navigate(`/run/${created.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to queue run');
      } finally {
        setBusy(false);
      }
    },
    [run, navigate]
  );

  if (!id) return <div className="empty">Missing run id.</div>;
  if (error && !run) return <div className="error-banner">Error: {error}</div>;
  if (!run) return <div className="loading">Loading run…</div>;

  const screenshots = run.artifacts
    .filter((a) => a.type === 'screenshot')
    .sort((a, b) => a.step_index - b.step_index);
  const consoleLogs = run.artifacts.filter((a) => a.type === 'console');
  const pageErrors = run.artifacts.filter((a) => a.type === 'page_error');
  const transcripts = run.artifacts.filter((a) => a.type === 'transcript');

  const failedFileLink = githubFileUrl(
    run.failed_test_file,
    run.failed_test_line,
    run.code_sha
  );

  const shaUrl = githubShaUrl(run.code_sha);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            <span className={`status-badge status-${run.status}`}>{run.status}</span>{' '}
            {run.scenario}
          </h2>
          <div className="page-subtitle">
            Started {formatTimestamp(run.started_at)} · Finished{' '}
            {formatTimestamp(run.finished_at)} · {formatDuration(run.duration_ms)}
          </div>
        </div>
        <Link to="/" className="btn">
          ← All runs
        </Link>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      <section className="detail-section">
        <h3>Summary</h3>
        <div className="kv">
          <span className="k">Trigger</span>
          <span className="v">
            {run.trigger_source}
            {run.triggered_by ? ` · ${run.triggered_by}` : ''}
          </span>
          <span className="k">Final stage</span>
          <span className="v">{run.final_stage ?? '—'}</span>
          <span className="k">Starting snapshot</span>
          <span className="v">
            {run.starting_snapshot_id ? (
              <Link to={`/snapshot/${run.starting_snapshot_id}`}>
                {run.starting_snapshot?.name ?? run.starting_snapshot_id}
              </Link>
            ) : (
              '—'
            )}
          </span>
          <span className="k">Ending snapshot</span>
          <span className="v">
            {run.ending_snapshot_id ? (
              <Link to={`/snapshot/${run.ending_snapshot_id}`}>
                {run.ending_snapshot?.name ?? run.ending_snapshot_id}
              </Link>
            ) : (
              '—'
            )}
          </span>
          <span className="k">Code SHA</span>
          <span className="v">
            {shaUrl ? (
              <a href={shaUrl} target="_blank" rel="noreferrer" className="mono">
                {shortSha(run.code_sha)}
              </a>
            ) : (
              '—'
            )}
          </span>
          {run.notes && (
            <>
              <span className="k">Notes</span>
              <span className="v">{run.notes}</span>
            </>
          )}
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleRequeue(true)}
            disabled={busy || !run.starting_snapshot_id}
            title={
              run.starting_snapshot_id
                ? 'Re-run with this run’s starting snapshot'
                : 'No starting snapshot recorded'
            }
          >
            Re-run from this start state
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleRequeue(false)}
            disabled={busy}
          >
            Re-run with latest code
          </button>
          {run.starting_snapshot_id && (
            <Link
              to={`/snapshot/${run.starting_snapshot_id}`}
              className="btn"
            >
              Open snapshot
            </Link>
          )}
        </div>
      </section>

      {(run.error_message ||
        run.failed_assertion ||
        run.failed_test_file) && (
        <section className="detail-section">
          <h3>Failure</h3>
          {run.error_message && (
            <pre className="log-block error">{run.error_message}</pre>
          )}
          {run.failed_assertion && (
            <>
              <div className="page-subtitle" style={{ marginTop: '0.75rem' }}>
                Failed assertion
              </div>
              <pre className="log-block">{run.failed_assertion}</pre>
            </>
          )}
          {run.failed_test_file && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
              <span className="k" style={{ color: 'var(--text-muted)' }}>
                Test file:{' '}
              </span>
              {failedFileLink ? (
                <a
                  href={failedFileLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                >
                  {run.failed_test_file}
                  {run.failed_test_line ? `:${run.failed_test_line}` : ''}
                </a>
              ) : (
                <span className="mono">
                  {run.failed_test_file}
                  {run.failed_test_line ? `:${run.failed_test_line}` : ''}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      <section className="detail-section">
        <h3>Screenshots ({screenshots.length})</h3>
        {screenshots.length === 0 ? (
          <div className="empty" style={{ padding: '1rem' }}>
            No screenshots.
          </div>
        ) : (
          <div className="screenshot-grid">
            {screenshots.map((a) => (
              <ScreenshotCard key={a.id} artifact={a} />
            ))}
          </div>
        )}
      </section>

      {pageErrors.length > 0 && (
        <section className="detail-section">
          <h3>Page errors ({pageErrors.length})</h3>
          {pageErrors.map((a) => (
            <pre key={a.id} className="log-block error">
              {a.inline_text ?? a.caption ?? '(empty)'}
            </pre>
          ))}
        </section>
      )}

      {consoleLogs.length > 0 && (
        <section className="detail-section">
          <h3>Console log</h3>
          {consoleLogs.map((a) => (
            <pre key={a.id} className="log-block">
              {a.inline_text ?? '(empty)'}
            </pre>
          ))}
        </section>
      )}

      {transcripts.length > 0 && (
        <section className="detail-section">
          <h3>Transcript</h3>
          {transcripts.map((a) => (
            <pre key={a.id} className="transcript">
              {a.inline_text ?? '(transcript stored externally)'}
            </pre>
          ))}
        </section>
      )}
    </div>
  );
}

function ScreenshotCard({ artifact }: { artifact: RunArtifact }) {
  return (
    <div className="screenshot-card">
      {artifact.blob_url ? (
        <a href={artifact.blob_url} target="_blank" rel="noreferrer">
          <img src={artifact.blob_url} alt={artifact.caption ?? 'screenshot'} />
        </a>
      ) : (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          (no blob_url)
        </div>
      )}
      <div className="caption">
        <span className="mono">#{artifact.step_index}</span>{' '}
        {artifact.caption ?? '(no caption)'}
      </div>
    </div>
  );
}
