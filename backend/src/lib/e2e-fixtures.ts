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

export interface E2EFixture {
  name: string;
  description: string;
  seed?: E2EFixtureSeed;
  storyline: Record<string, E2EStorylineEntry[]>;
  postInvitationSent?: E2EStorylineEntry[];
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
