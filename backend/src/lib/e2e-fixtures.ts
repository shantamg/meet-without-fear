/**
 * E2E Fixture Loader
 *
 * Loads YAML fixtures for E2E testing with deterministic AI responses.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

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

export interface E2EFixture {
  name: string;
  description: string;
  seed?: E2EFixtureSeed;
  /** Legacy: per-user storylines */
  storyline?: Record<string, E2EStorylineEntry[]>;
  /** New: flat array of responses (simpler format) */
  responses?: E2EResponseEntry[];
  postInvitationSent?: E2EStorylineEntry[];
  /** Operation-specific mock responses for non-streaming AI calls */
  operations?: Record<string, E2EOperationResponse>;
}

// ============================================================================
// Fixture Loader
// ============================================================================

const fixtureCache = new Map<string, E2EFixture>();

/**
 * Load a YAML fixture by name
 */
export function loadFixture(fixtureId: string): E2EFixture {
  // Check cache first
  if (fixtureCache.has(fixtureId)) {
    return fixtureCache.get(fixtureId)!;
  }

  const fixturesPath = process.env.E2E_FIXTURES_PATH;
  if (!fixturesPath) {
    throw new Error('E2E_FIXTURES_PATH environment variable not set');
  }

  const fixturePath = path.resolve(fixturesPath, `${fixtureId}.yaml`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }

  const fileContent = fs.readFileSync(fixturePath, 'utf8');
  const fixture = yaml.load(fileContent) as E2EFixture;

  // Cache for future calls
  fixtureCache.set(fixtureId, fixture);

  return fixture;
}

/**
 * Get AI response from fixture for a specific user and response index
 */
export function getFixtureResponse(
  fixture: E2EFixture,
  userId: string,
  responseIndex: number
): string {
  if (!fixture.storyline) {
    throw new Error(`No storyline found in fixture`);
  }

  const userStoryline = fixture.storyline[userId];

  if (!userStoryline) {
    throw new Error(`No storyline found for user: ${userId}`);
  }

  if (responseIndex >= userStoryline.length) {
    throw new Error(
      `Response index ${responseIndex} out of bounds for user ${userId} (has ${userStoryline.length} responses)`
    );
  }

  return userStoryline[responseIndex].ai;
}

/**
 * Clear the fixture cache (useful for testing)
 */
export function clearFixtureCache(): void {
  fixtureCache.clear();
}

/**
 * Get AI response from fixture by ID and index (flat-array format).
 * This is the simplified API for E2E tests.
 *
 * @param fixtureId - The fixture file name (without .yaml extension)
 * @param index - The response index (0-based)
 * @returns The AI response string
 * @throws Error if fixture not found or index out of bounds
 */
export function getFixtureResponseByIndex(fixtureId: string, index: number): string {
  const fixture = loadFixture(fixtureId);

  // Support flat-array format (responses array)
  if (fixture.responses && fixture.responses.length > 0) {
    if (index < 0 || index >= fixture.responses.length) {
      throw new Error(
        `Response index ${index} out of bounds for fixture ${fixtureId} (has ${fixture.responses.length} responses)`
      );
    }
    return fixture.responses[index].ai;
  }

  // Fallback to legacy storyline format (use first user's storyline)
  if (fixture.storyline && Object.keys(fixture.storyline).length > 0) {
    const userKeys = Object.keys(fixture.storyline);
    const storyline = fixture.storyline[userKeys[0]];
    if (index < 0 || index >= storyline.length) {
      throw new Error(
        `Response index ${index} out of bounds for fixture ${fixtureId} (has ${storyline.length} responses)`
      );
    }
    return storyline[index].ai;
  }

  throw new Error(`No responses or storyline found in fixture: ${fixtureId}`);
}

/**
 * Get operation-specific mock response for non-streaming AI calls.
 * Used for reconciler, share suggestions, and other JSON-response operations.
 *
 * @param fixtureId - The fixture file name (without .yaml extension)
 * @param operationName - The operation name (e.g., 'reconciler-analysis', 'share-suggestion')
 * @returns The JSON response as a string, or null if not found
 */
export function getFixtureOperationResponse(fixtureId: string, operationName: string): string | null {
  try {
    const fixture = loadFixture(fixtureId);

    if (!fixture.operations) {
      return null;
    }

    const operation = fixture.operations[operationName];
    if (!operation) {
      return null;
    }

    // Return the response as a JSON string
    return JSON.stringify(operation.response);
  } catch {
    // Fixture not found or other error
    return null;
  }
}
