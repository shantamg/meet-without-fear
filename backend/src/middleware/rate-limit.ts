/**
 * Rate Limiting Middleware
 *
 * Protects expensive endpoints (especially LLM-backed) from abuse.
 * Uses per-user limits when authenticated, falls back to IP-based limits.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Key generator: uses authenticated user ID when available, falls back to IP.
 * Validates against the library to suppress ERR_ERL_KEY_GEN_IPV6.
 */
function keyGenerator(req: Request): string {
  return req.user?.id || req.ip || 'unknown';
}

const validate: Options['validate'] = {
  // We prefer user ID and only fall back to IP; the IPv6 concern doesn't apply.
  keyGeneratorIpFallback: false,
};

/**
 * Rate limiter for streaming message endpoints (most expensive — triggers LLM calls).
 * 10 requests per minute per user.
 */
export const streamingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many messages. Please wait a moment before sending another.',
    },
  },
  skip: () => process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production',
  validate,
});

/**
 * Rate limiter for empathy/reconciler endpoints.
 * 20 requests per minute per user.
 */
export const empathyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment.',
    },
  },
  skip: () => process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production',
  validate,
});

/**
 * Rate limiter for auth token endpoints.
 * 30 requests per minute per user.
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many auth requests. Please wait a moment.',
    },
  },
  skip: () => process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production',
  validate,
});

/**
 * Global rate limiter as a safety net.
 * 100 requests per minute per user.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.',
    },
  },
  skip: () => process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production',
  validate,
});
