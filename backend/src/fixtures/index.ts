/**
 * E2E Fixture Registry
 *
 * Central registry of all E2E test fixtures.
 * Fixtures are imported as TypeScript modules for type safety.
 */

import { E2EFixture } from './types';
import { flatArrayFixture } from './flat-array-fixture';
import { homepage } from './homepage';
import { reconcilerCircuitBreaker } from './reconciler-circuit-breaker';
import { reconcilerNoGaps } from './reconciler-no-gaps';
import { reconcilerOfferOptional } from './reconciler-offer-optional';
import { reconcilerOfferSharing } from './reconciler-offer-sharing';
import { reconcilerRefinement } from './reconciler-refinement';
import { testFixture } from './test-fixture';
import { userAFullJourney } from './user-a-full-journey';
import { userBPartnerJourney } from './user-b-partner-journey';

// Re-export types
export * from './types';

// Re-export individual fixtures for direct imports
export {
  flatArrayFixture,
  homepage,
  reconcilerCircuitBreaker,
  reconcilerNoGaps,
  reconcilerOfferOptional,
  reconcilerOfferSharing,
  reconcilerRefinement,
  testFixture,
  userAFullJourney,
  userBPartnerJourney,
};

/**
 * Fixture registry mapping fixture IDs to fixture objects.
 * The ID matches the original YAML filename (without extension).
 */
export const fixtureRegistry: Record<string, E2EFixture> = {
  'flat-array-fixture': flatArrayFixture,
  homepage,
  'reconciler-circuit-breaker': reconcilerCircuitBreaker,
  'reconciler-no-gaps': reconcilerNoGaps,
  'reconciler-offer-optional': reconcilerOfferOptional,
  'reconciler-offer-sharing': reconcilerOfferSharing,
  'reconciler-refinement': reconcilerRefinement,
  'test-fixture': testFixture,
  'user-a-full-journey': userAFullJourney,
  'user-b-partner-journey': userBPartnerJourney,
};

/**
 * Get a fixture by ID.
 * @param fixtureId - The fixture ID (matches original YAML filename without extension)
 * @returns The fixture or undefined if not found
 */
export function getFixture(fixtureId: string): E2EFixture | undefined {
  return fixtureRegistry[fixtureId];
}

/**
 * Get all registered fixture IDs.
 */
export function getFixtureIds(): string[] {
  return Object.keys(fixtureRegistry);
}
