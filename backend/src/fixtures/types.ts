/**
 * E2E Fixture Types
 *
 * Type definitions for E2E test fixtures.
 */

export interface E2EFixtureUser {
  id: string;
  email: string;
  clerkId: string;
  name: string;
}

export interface E2EFixtureSeed {
  users?: E2EFixtureUser[];
  session?: {
    id?: string;
    [key: string]: unknown;
  };
}

export interface E2EStorylineEntry {
  user: string | null;
  ai: string;
}

/**
 * Simple response entry for flat-array fixture format.
 */
export interface E2EResponseEntry {
  user?: string;
  ai: string;
}

/**
 * Operation-specific mock response for non-streaming AI calls (e.g., reconciler)
 */
export interface E2EOperationResponse {
  /** JSON response to return (will be stringified) */
  response: unknown;
}

/**
 * E2E Test Fixture
 *
 * Defines deterministic AI responses for E2E tests.
 */
export interface E2EFixture {
  name: string;
  description: string;
  seed?: E2EFixtureSeed;
  /** Legacy: per-user storylines */
  storyline?: Record<string, E2EStorylineEntry[]>;
  /** Flat array of responses (preferred format) */
  responses?: E2EResponseEntry[];
  postInvitationSent?: E2EStorylineEntry[];
  /** Operation-specific mock responses for non-streaming AI calls */
  operations?: Record<string, E2EOperationResponse>;
}
