/**
 * GET  /api/runs?status=fail   — list latest 100 runs
 * POST /api/runs                — enqueue a new run from the web UI
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import {
  BotAuthError,
  generateId,
  handleOptions,
  json,
  jsonError,
  parseJsonBody,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  try {
    if (req.method === 'GET') {
      return await listRuns(req, res);
    }
    if (req.method === 'POST') {
      return await createRun(req, res);
    }
    return jsonError(res, 405, `Method ${req.method} not allowed`);
  } catch (err) {
    if (err instanceof BotAuthError) {
      return jsonError(res, err.status, err.message);
    }
    console.error('[api/runs] error:', err);
    return jsonError(res, 500, (err as Error).message);
  }
}

async function listRuns(req: VercelRequest, res: VercelResponse) {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;

  let result;
  if (statusFilter) {
    if (!VALID_STATUSES.has(statusFilter)) {
      return jsonError(res, 400, `invalid status filter: ${statusFilter}`);
    }
    result = await sql`
      SELECT * FROM test_runs
      WHERE status = ${statusFilter}
      ORDER BY created_at DESC
      LIMIT 100
    `;
  } else {
    result = await sql`
      SELECT * FROM test_runs
      ORDER BY created_at DESC
      LIMIT 100
    `;
  }

  return json(res, 200, result.rows);
}

interface CreateRunBody {
  scenario?: string;
  starting_snapshot_id?: string | null;
  notes?: string | null;
  triggered_by?: string | null;
}

async function createRun(req: VercelRequest, res: VercelResponse) {
  const body = parseJsonBody<CreateRunBody>(req);
  const scenario = body.scenario?.trim();
  if (!scenario) {
    return jsonError(res, 400, 'scenario is required');
  }

  const id = generateId();
  const startingSnapshotId = body.starting_snapshot_id ?? null;
  const notes = body.notes ?? null;
  const triggeredBy = body.triggered_by ?? null;

  const result = await sql`
    INSERT INTO test_runs (
      id, scenario, status, trigger_source,
      starting_snapshot_id, notes, triggered_by
    )
    VALUES (
      ${id}, ${scenario}, 'queued', 'web',
      ${startingSnapshotId}, ${notes}, ${triggeredBy}
    )
    RETURNING *
  `;

  return json(res, 201, result.rows[0]);
}
