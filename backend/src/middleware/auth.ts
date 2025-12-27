/**
 * Authentication Middleware
 *
 * Provides Clerk-based authentication with mock support for development.
 * When CLERK_SECRET_KEY is not set, uses mock authentication that extracts
 * user info from headers for local development and testing.
 */

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from './errors';
import { prisma } from '../lib/prisma';
import { ApiResponse, ErrorCode } from '@listen-well/shared';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  id: string;
  clerkId: string | null;
  email: string;
  name: string | null;
  pushToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clerkUserId?: string;
    }
  }
}

// ============================================================================
// Configuration
// ============================================================================

const isClerkConfigured = (): boolean => {
  return !!(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
};

const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== 'production';
};

// ============================================================================
// Mock Authentication (Development Only)
// ============================================================================

interface MockAuthPayload {
  userId: string;
  email: string;
  name?: string;
}

/**
 * Parses mock auth from request headers
 * Supports multiple formats:
 * 1. X-Mock-User-Id header with optional X-Mock-User-Email and X-Mock-User-Name
 * 2. Authorization: Mock <base64-encoded-json> with { userId, email, name }
 * 3. Authorization: Bearer test-token-<userId> (legacy format)
 * 4. Authorization: Bearer <userId> (direct user ID)
 */
function parseMockAuth(req: Request): MockAuthPayload | null {
  // Format 1: Individual headers
  const mockUserId = req.headers['x-mock-user-id'] as string | undefined;
  if (mockUserId) {
    return {
      userId: mockUserId,
      email: (req.headers['x-mock-user-email'] as string) || `${mockUserId}@mock.local`,
      name: req.headers['x-mock-user-name'] as string | undefined,
    };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  // Format 2: Authorization header with Mock scheme
  if (authHeader.startsWith('Mock ')) {
    try {
      const payload = authHeader.slice(5);
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as Partial<MockAuthPayload>;
      if (parsed.userId && parsed.email) {
        return {
          userId: parsed.userId,
          email: parsed.email,
          name: parsed.name,
        };
      }
    } catch {
      // Invalid mock token format
    }
  }

  // Format 3 & 4: Bearer token (legacy formats for dev/testing)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Format 3: test-token-{userId}
    if (token.startsWith('test-token-')) {
      const userId = token.replace('test-token-', '');
      return {
        userId,
        email: `${userId}@mock.local`,
      };
    }

    // Format 4: Direct user ID (looks like a cuid)
    if (token.match(/^[a-z0-9]{20,}$/i)) {
      return {
        userId: token,
        email: `${token}@mock.local`,
      };
    }
  }

  return null;
}

/**
 * Mock authentication middleware for development
 */
async function handleMockAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  required: boolean
): Promise<void> {
  const mockAuth = parseMockAuth(req);

  if (!mockAuth) {
    if (required) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      };
      res.status(401).json(response);
      return;
    }
    next();
    return;
  }

  try {
    // Try to find user by ID first (for existing users in tests)
    let user = await prisma.user.findUnique({
      where: { id: mockAuth.userId },
    });

    // If not found by ID, try by email
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: mockAuth.email },
      });
    }

    // If still not found, create new user
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: mockAuth.email,
          name: mockAuth.name || null,
        },
      });
    }

    req.user = {
      ...user,
      clerkId: user.clerkId ?? null,
    };
    req.clerkUserId = mockAuth.userId;
    next();
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Clerk Authentication
// ============================================================================

/**
 * Verifies Clerk JWT and returns the user ID
 * Uses @clerk/express when available
 */
async function verifyClerkToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    // Dynamic import to avoid issues when Clerk is not installed
    const { verifyToken } = await import('@clerk/express');
    const token = authHeader.slice(7);
    const session = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return session.sub;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Auth] Clerk token verification failed:', error);
    }
    return null;
  }
}

/**
 * Clerk authentication handler
 */
async function handleClerkAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  required: boolean
): Promise<void> {
  const clerkUserId = await verifyClerkToken(req);

  if (!clerkUserId) {
    if (required) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      };
      res.status(401).json(response);
      return;
    }
    next();
    return;
  }

  try {
    // Upsert user based on Clerk ID
    // Note: In real implementation, you'd fetch user details from Clerk
    const user = await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {},
      create: {
        clerkId: clerkUserId,
        email: `${clerkUserId}@pending.clerk`, // Placeholder, updated on first profile fetch
        name: null,
      },
    });

    req.user = user;
    req.clerkUserId = clerkUserId;
    next();
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Middleware Exports
// ============================================================================

/**
 * Requires authentication - returns 401 if not authenticated
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isClerkConfigured()) {
    await handleClerkAuth(req, res, next, true);
  } else if (isDevelopment()) {
    await handleMockAuth(req, res, next, true);
  } else {
    // Production without Clerk configured is a hard failure
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Authentication not configured: set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY',
      },
    };
    res.status(500).json(response);
  }
}

/**
 * Optional authentication - populates req.user if authenticated, continues if not
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isClerkConfigured()) {
    await handleClerkAuth(req, res, next, false);
  } else if (isDevelopment()) {
    await handleMockAuth(req, res, next, false);
  } else {
    // Production without auth - just continue
    next();
  }
}

/**
 * Gets the current authenticated user or throws
 */
export function getUser(req: Request): AuthUser {
  if (!req.user) {
    throw new UnauthorizedError('No authenticated user');
  }
  return req.user;
}

/**
 * Checks if the current user has access to a relationship
 */
export async function requireRelationshipAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError();
  }

  const relationshipId = req.params.relationshipId;
  if (!relationshipId) {
    next();
    return;
  }

  try {
    const membership = await prisma.relationshipMember.findFirst({
      where: {
        relationshipId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access to this relationship denied');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Checks if the current user has access to a session
 */
export async function requireSessionAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError();
  }

  const sessionId = req.params.sessionId;
  if (!sessionId) {
    next();
    return;
  }

  try {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    });

    if (!session) {
      throw new ForbiddenError('Access to this session denied');
    }

    next();
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Helper for creating mock auth header (for testing)
// ============================================================================

export function createMockAuthHeader(payload: MockAuthPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `Mock ${encoded}`;
}
