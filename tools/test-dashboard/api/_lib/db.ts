/**
 * Shared helpers for serverless API routes.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-bot-token',
  'Access-Control-Max-Age': '86400',
};

export function applyCors(res: VercelResponse) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

export function jsonError(res: VercelResponse, status: number, message: string) {
  applyCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json({ error: message });
}

export function json(res: VercelResponse, status: number, body: unknown) {
  applyCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(body);
}

/**
 * Throws a 401-style error if the x-bot-token header is missing or wrong.
 * Caller should catch and convert to a JSON 401 response.
 */
export class BotAuthError extends Error {
  status = 401;
}

export function requireBotToken(req: VercelRequest): void {
  const expected = process.env.BOT_WRITER_TOKEN;
  if (!expected) {
    throw new BotAuthError('BOT_WRITER_TOKEN not configured on server');
  }
  const got = req.headers['x-bot-token'];
  const value = Array.isArray(got) ? got[0] : got;
  if (!value || value !== expected) {
    throw new BotAuthError('invalid or missing x-bot-token');
  }
}

/**
 * Vercel Node runtime auto-parses JSON when Content-Type is application/json,
 * but for safety we accept either an already-parsed object or a string body.
 */
export function parseJsonBody<T = unknown>(req: VercelRequest): T {
  const body = req.body;
  if (body == null) return {} as T;
  if (typeof body === 'string') {
    if (body.trim() === '') return {} as T;
    try {
      return JSON.parse(body) as T;
    } catch (err) {
      throw new Error(`Invalid JSON body: ${(err as Error).message}`);
    }
  }
  return body as T;
}

/**
 * Generate a ulid-like id: 10 chars Crockford-base32 timestamp + 16 chars random.
 * 26 chars total, lexicographically sortable by creation time.
 *
 * We avoid the `ulid` npm dep to keep cold starts small; this implementation
 * matches the ulid spec closely enough for our uses (ids are opaque to clients).
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(value: number, length: number): string {
  let out = '';
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out = CROCKFORD[v % 32] + out;
    v = Math.floor(v / 32);
  }
  return out;
}

function randomBase32(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return out;
}

export function generateId(): string {
  const ts = Date.now();
  // Date.now() fits in 48 bits; encode as 10 base32 chars (50 bits of space).
  // We encode high 25 bits and low 25 bits separately to avoid float precision loss.
  const high = Math.floor(ts / 0x2000000); // top bits
  const low = ts % 0x2000000;
  const tsPart = (encodeBase32(high, 5) + encodeBase32(low, 5));
  return tsPart + randomBase32(16);
}

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
