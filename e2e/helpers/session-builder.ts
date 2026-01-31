/**
 * Session Builder for E2E Tests
 *
 * Fluent builder pattern for setting up test sessions at various stages.
 * Uses the backend's seed-session API endpoint.
 */

import type { APIRequestContext } from '@playwright/test';

// ============================================================================
// Types
// ============================================================================

export type TargetStage = 'CREATED' | 'EMPATHY_SHARED_A' | 'CONTEXT_SHARED_B';

export interface UserConfig {
  email: string;
  name: string;
}

export interface SessionSetupResult {
  session: {
    id: string;
    status: string;
    relationshipId: string;
  };
  userA: {
    id: string;
    email: string;
    name: string;
  };
  userB?: {
    id: string;
    email: string;
    name: string;
  };
  invitation: {
    id: string;
    status: string;
  };
  pageUrls: {
    userA: string;
    userB?: string;
  };
}

// ============================================================================
// Session Builder
// ============================================================================

/**
 * Fluent builder for setting up E2E test sessions.
 *
 * @example
 * ```typescript
 * const setup = await new SessionBuilder()
 *   .userA('shantam@e2e.test', 'Shantam')
 *   .userB('darryl@e2e.test', 'Darryl')
 *   .startingAt('EMPATHY_SHARED_A')
 *   .setup(request);
 * ```
 */
export class SessionBuilder {
  private _userA: UserConfig | null = null;
  private _userB: UserConfig | null = null;
  private _targetStage: TargetStage = 'CREATED';
  private _apiBaseUrl: string;
  private _fixtureId: string | null = null;

  constructor(apiBaseUrl: string = process.env.API_BASE_URL || 'http://localhost:3002') {
    this._apiBaseUrl = apiBaseUrl;
  }

  /**
   * Set the E2E fixture ID for this session.
   * This determines which mock AI responses are used during the test.
   */
  withFixture(fixtureId: string): this {
    this._fixtureId = fixtureId;
    return this;
  }

  /**
   * Get the fixture ID for this session (used when making API calls).
   */
  get fixtureId(): string | null {
    return this._fixtureId;
  }

  /**
   * Set User A (the session initiator).
   * Email must end with @e2e.test.
   */
  userA(email: string, name: string): this {
    if (!email.endsWith('@e2e.test')) {
      throw new Error(`User A email must end with @e2e.test: ${email}`);
    }
    this._userA = { email, name };
    return this;
  }

  /**
   * Set User B (the invited partner).
   * Email must end with @e2e.test.
   */
  userB(email: string, name: string): this {
    if (!email.endsWith('@e2e.test')) {
      throw new Error(`User B email must end with @e2e.test: ${email}`);
    }
    this._userB = { email, name };
    return this;
  }

  /**
   * Set the target stage for the session.
   *
   * - CREATED: Session just created, compact not signed
   * - EMPATHY_SHARED_A: User A completed through empathy, User B at Stage 0
   */
  startingAt(stage: TargetStage): this {
    this._targetStage = stage;
    return this;
  }

  /**
   * Execute the setup by calling the seed-session API.
   *
   * @param request - Playwright's APIRequestContext
   * @returns The session setup result with all IDs and URLs
   */
  async setup(request: APIRequestContext): Promise<SessionSetupResult> {
    if (!this._userA) {
      throw new Error('User A is required. Call .userA(email, name) before .setup()');
    }

    const response = await request.post(`${this._apiBaseUrl}/api/e2e/seed-session`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        userA: this._userA,
        userB: this._userB || undefined,
        targetStage: this._targetStage,
      },
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Session seeding failed: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`Session seeding failed: ${result.error}`);
    }

    return result.data as SessionSetupResult;
  }
}

/**
 * Convenience function for quick session setup.
 *
 * @example
 * ```typescript
 * const setup = await setupSession(request, {
 *   userA: { email: 'shantam@e2e.test', name: 'Shantam' },
 *   userB: { email: 'darryl@e2e.test', name: 'Darryl' },
 *   targetStage: 'EMPATHY_SHARED_A',
 * });
 * ```
 */
export async function setupSession(
  request: APIRequestContext,
  options: {
    userA: UserConfig;
    userB?: UserConfig;
    targetStage: TargetStage;
    apiBaseUrl?: string;
  }
): Promise<SessionSetupResult> {
  const builder = new SessionBuilder(options.apiBaseUrl);
  builder.userA(options.userA.email, options.userA.name);

  if (options.userB) {
    builder.userB(options.userB.email, options.userB.name);
  }

  builder.startingAt(options.targetStage);

  return builder.setup(request);
}
