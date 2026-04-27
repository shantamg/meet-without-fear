/**
 * GET /api/snapshots/:id
 *   Returns: { snapshot, parent, children: Snapshot[], runs: TestRun[] }
 *     - parent  = snapshot whose id == snapshot.parent_id (or null)
 *     - children = snapshots where parent_id = :id
 *     - runs    = runs where starting_snapshot_id = :id (newest first)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { handleOptions, json, jsonError } from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonError(res, 405, `Method ${req.method} not allowed`);
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return jsonError(res, 400, 'missing :id');

  try {
    const snapResult = await sql`SELECT * FROM snapshots WHERE id = ${id}`;
    const snapshot = snapResult.rows[0];
    if (!snapshot) {
      return jsonError(res, 404, 'snapshot not found');
    }

    let parent = null;
    if (snapshot.parent_id) {
      const r = await sql`SELECT * FROM snapshots WHERE id = ${snapshot.parent_id}`;
      parent = r.rows[0] ?? null;
    }

    const childrenResult = await sql`
      SELECT * FROM snapshots
      WHERE parent_id = ${id}
      ORDER BY created_at ASC
    `;

    const runsResult = await sql`
      SELECT * FROM test_runs
      WHERE starting_snapshot_id = ${id}
      ORDER BY created_at DESC
      LIMIT 200
    `;

    return json(res, 200, {
      snapshot,
      parent,
      children: childrenResult.rows,
      runs: runsResult.rows,
    });
  } catch (err) {
    console.error('[api/snapshots/:id] error:', err);
    return jsonError(res, 500, (err as Error).message);
  }
}
