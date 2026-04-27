/**
 * POST /api/artifacts
 *   Body: { run_id, type, caption?, step_index, blob_url? OR inline_text? }
 *   Auth: header `x-bot-token: <BOT_WRITER_TOKEN>`.
 *
 * Screenshot binaries themselves are uploaded to Vercel Blob *by the bot* via
 * `@vercel/blob`'s `put()` (using BLOB_READ_WRITE_TOKEN). The bot then calls this
 * endpoint with the resulting blob_url. This endpoint never handles file bytes.
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

const VALID_TYPES = new Set(['screenshot', 'transcript', 'page_error', 'console']);

interface CreateArtifactBody {
  run_id?: string;
  type?: string;
  caption?: string | null;
  step_index?: number;
  blob_url?: string | null;
  inline_text?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return jsonError(res, 405, `Method ${req.method} not allowed`);
  }

  try {
    requireBotToken(req);
    const body = parseJsonBody<CreateArtifactBody>(req);

    if (!body.run_id) return jsonError(res, 400, 'run_id is required');
    if (!body.type || !VALID_TYPES.has(body.type)) {
      return jsonError(res, 400, `invalid type: ${body.type}`);
    }
    if (!body.blob_url && !body.inline_text) {
      return jsonError(res, 400, 'either blob_url or inline_text must be provided');
    }

    // Confirm run exists (FK is CASCADE; this gives a friendlier 404 than a constraint err).
    const runExists = await sql`SELECT id FROM test_runs WHERE id = ${body.run_id}`;
    if (runExists.rows.length === 0) {
      return jsonError(res, 404, 'run_id does not exist');
    }

    const id = generateId();
    const stepIndex = Number.isFinite(body.step_index) ? Number(body.step_index) : 0;
    const caption = body.caption ?? null;
    const blobUrl = body.blob_url ?? null;
    const inlineText = body.inline_text ?? null;

    const result = await sql`
      INSERT INTO run_artifacts (
        id, run_id, type, blob_url, inline_text, caption, step_index
      )
      VALUES (
        ${id}, ${body.run_id}, ${body.type}, ${blobUrl}, ${inlineText}, ${caption}, ${stepIndex}
      )
      RETURNING *
    `;

    return json(res, 201, result.rows[0]);
  } catch (err) {
    if (err instanceof BotAuthError) {
      return jsonError(res, err.status, err.message);
    }
    console.error('[api/artifacts] error:', err);
    return jsonError(res, 500, (err as Error).message);
  }
}
