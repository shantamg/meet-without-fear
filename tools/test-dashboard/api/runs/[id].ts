/**
 * GET   /api/runs/:id  — RunDetail (run + artifacts + starting/ending snapshots)
 * PATCH /api/runs/:id  — bot writer updates status / timing / failure fields.
 *                        Requires header `x-bot-token: <BOT_WRITER_TOKEN>`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import {
  BotAuthError,
  handleOptions,
  json,
  jsonError,
  parseJsonBody,
  requireBotToken,
} from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

const VALID_STATUSES = new Set([
  'queued',
  'running',
  'pass',
  'fail',
  'error',
  'cancelled',
]);

const VALID_TRIGGER_SOURCES = new Set(['slack', 'cron', 'web', 'manual']);

const PATCHABLE_FIELDS = [
  'status',
  'started_at',
  'finished_at',
  'duration_ms',
  'final_stage',
  'starting_snapshot_id',
  'ending_snapshot_id',
  'code_sha',
  'trigger_source',
  'triggered_by',
  'error_message',
  'failed_assertion',
  'failed_test_file',
  'failed_test_line',
  'notes',
] as const;

type PatchableField = (typeof PATCHABLE_FIELDS)[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return jsonError(res, 400, 'missing :id');

  try {
    if (req.method === 'GET') {
      return await getRun(id, res);
    }
    if (req.method === 'PATCH') {
      requireBotToken(req);
      return await patchRun(id, req, res);
    }
    return jsonError(res, 405, `Method ${req.method} not allowed`);
  } catch (err) {
    if (err instanceof BotAuthError) {
      return jsonError(res, err.status, err.message);
    }
    console.error('[api/runs/:id] error:', err);
    return jsonError(res, 500, (err as Error).message);
  }
}

async function getRun(id: string, res: VercelResponse) {
  const runResult = await sql`SELECT * FROM test_runs WHERE id = ${id}`;
  const run = runResult.rows[0];
  if (!run) {
    return jsonError(res, 404, 'run not found');
  }

  const artifactsResult = await sql`
    SELECT * FROM run_artifacts
    WHERE run_id = ${id}
    ORDER BY step_index ASC, created_at ASC
  `;

  let startingSnapshot = null;
  if (run.starting_snapshot_id) {
    const r = await sql`SELECT * FROM snapshots WHERE id = ${run.starting_snapshot_id}`;
    startingSnapshot = r.rows[0] ?? null;
  }

  let endingSnapshot = null;
  if (run.ending_snapshot_id) {
    const r = await sql`SELECT * FROM snapshots WHERE id = ${run.ending_snapshot_id}`;
    endingSnapshot = r.rows[0] ?? null;
  }

  return json(res, 200, {
    ...run,
    artifacts: artifactsResult.rows,
    starting_snapshot: startingSnapshot,
    ending_snapshot: endingSnapshot,
  });
}

async function patchRun(id: string, req: VercelRequest, res: VercelResponse) {
  const body = parseJsonBody<Record<string, unknown>>(req);

  // Whitelist patchable fields and validate enums.
  const updates: Partial<Record<PatchableField, unknown>> = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (
    typeof updates.status === 'string' &&
    !VALID_STATUSES.has(updates.status)
  ) {
    return jsonError(res, 400, `invalid status: ${updates.status}`);
  }

  if (
    typeof updates.trigger_source === 'string' &&
    !VALID_TRIGGER_SOURCES.has(updates.trigger_source)
  ) {
    return jsonError(
      res,
      400,
      `invalid trigger_source: ${updates.trigger_source}`
    );
  }

  if (Object.keys(updates).length === 0) {
    return jsonError(res, 400, 'no patchable fields supplied');
  }

  // Confirm row exists.
  const exists = await sql`SELECT id FROM test_runs WHERE id = ${id}`;
  if (exists.rows.length === 0) {
    return jsonError(res, 404, 'run not found');
  }

  // Build a parameterized UPDATE manually (sql tag doesn't support dynamic columns).
  const cols = Object.keys(updates) as PatchableField[];
  const setClauses = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const values = cols.map((c) => updates[c]);
  values.push(id);

  // Use the underlying client via @vercel/postgres' `db` export.
  const { db } = await import('@vercel/postgres');
  const client = await db.connect();
  try {
    const result = await client.query(
      `UPDATE test_runs SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return json(res, 200, result.rows[0]);
  } finally {
    client.release();
  }
}
