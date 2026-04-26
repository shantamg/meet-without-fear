/**
 * GET  /api/snapshots  — flat list of all snapshots, each augmented with `run_count`.
 *                        Frontend builds the tree by linking child.parent_id → parent.id.
 * POST /api/snapshots  — bot writer creates a new snapshot row.
 *                        Requires header `x-bot-token: <BOT_WRITER_TOKEN>`.
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
  requireBotToken,
} from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  try {
    if (req.method === 'GET') {
      return await listSnapshots(res);
    }
    if (req.method === 'POST') {
      requireBotToken(req);
      return await createSnapshot(req, res);
    }
    return jsonError(res, 405, `Method ${req.method} not allowed`);
  } catch (err) {
    if (err instanceof BotAuthError) {
      return jsonError(res, err.status, err.message);
    }
    console.error('[api/snapshots] error:', err);
    return jsonError(res, 500, (err as Error).message);
  }
}

async function listSnapshots(res: VercelResponse) {
  // Flat array; frontend assembles the tree from parent_id.
  // run_count = number of runs that started from this snapshot.
  const result = await sql`
    SELECT
      s.*,
      COALESCE(rc.run_count, 0)::int AS run_count
    FROM snapshots s
    LEFT JOIN (
      SELECT starting_snapshot_id, COUNT(*) AS run_count
      FROM test_runs
      WHERE starting_snapshot_id IS NOT NULL
      GROUP BY starting_snapshot_id
    ) rc ON rc.starting_snapshot_id = s.id
    ORDER BY s.created_at ASC
  `;

  return json(res, 200, result.rows);
}

interface CreateSnapshotBody {
  name?: string;
  description?: string | null;
  parent_id?: string | null;
  file_path?: string;
  db_state_summary?: unknown;
  created_by_run_id?: string | null;
}

async function createSnapshot(req: VercelRequest, res: VercelResponse) {
  const body = parseJsonBody<CreateSnapshotBody>(req);

  const name = body.name?.trim();
  const filePath = body.file_path?.trim();
  if (!name) return jsonError(res, 400, 'name is required');
  if (!filePath) return jsonError(res, 400, 'file_path is required');

  const id = generateId();
  const description = body.description ?? null;
  const parentId = body.parent_id ?? null;
  const createdByRunId = body.created_by_run_id ?? null;
  const dbStateSummary =
    body.db_state_summary === undefined
      ? null
      : JSON.stringify(body.db_state_summary);

  const result = await sql`
    INSERT INTO snapshots (
      id, name, description, parent_id, file_path,
      db_state_summary, created_by_run_id
    )
    VALUES (
      ${id}, ${name}, ${description}, ${parentId}, ${filePath},
      ${dbStateSummary}::jsonb, ${createdByRunId}
    )
    RETURNING *
  `;

  return json(res, 201, result.rows[0]);
}
