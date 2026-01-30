/**
 * E2E Fixture Loader Tests
 *
 * Tests for loading YAML fixtures for E2E testing.
 */

import path from 'path';
import { loadFixture, getFixtureResponse, clearFixtureCache } from '../e2e-fixtures';

describe('E2E Fixture Loader', () => {
  const originalEnv = process.env.E2E_FIXTURES_PATH;

  beforeAll(() => {
    // Point to test fixtures directory
    process.env.E2E_FIXTURES_PATH = path.join(__dirname, 'test-fixtures');
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.E2E_FIXTURES_PATH = originalEnv;
    } else {
      delete process.env.E2E_FIXTURES_PATH;
    }
  });

  describe('loadFixture', () => {
    it('loads a valid YAML fixture', () => {
      const fixture = loadFixture('test-fixture');

      expect(fixture).toBeDefined();
      expect(fixture.name).toBe('Test Fixture');
      expect(fixture.description).toBe('A test fixture for unit tests');
    });

    it('parses seed.users from fixture', () => {
      const fixture = loadFixture('test-fixture');

      expect(fixture.seed?.users).toHaveLength(1);
      expect(fixture.seed!.users![0]).toEqual({
        id: 'user-a',
        email: 'user-a@e2e.test',
        clerkId: 'e2e_clerk_user_a',
        name: 'Alice Test',
      });
    });

    it('parses storyline from fixture', () => {
      const fixture = loadFixture('test-fixture');

      expect(fixture.storyline).toBeDefined();
      expect(fixture.storyline['user-a']).toHaveLength(2);
      expect(fixture.storyline['user-a'][0].user).toBe('Hello');
      expect(fixture.storyline['user-a'][0].ai).toContain('thinking');
    });

    it('throws error when fixture not found', () => {
      expect(() => loadFixture('non-existent')).toThrow(
        'Fixture not found: non-existent'
      );
    });

    it('throws error when E2E_FIXTURES_PATH not set', () => {
      const savedPath = process.env.E2E_FIXTURES_PATH;
      delete process.env.E2E_FIXTURES_PATH;
      clearFixtureCache(); // Clear cache to test fresh load

      expect(() => loadFixture('uncached-fixture')).toThrow(
        'E2E_FIXTURES_PATH environment variable not set'
      );

      process.env.E2E_FIXTURES_PATH = savedPath;
    });
  });

  describe('getFixtureResponse', () => {
    it('returns AI response for given user and index', () => {
      const fixture = loadFixture('test-fixture');

      const response = getFixtureResponse(fixture, 'user-a', 0);

      expect(response).toContain('thinking');
      expect(response).toContain("Hi there! How can I help you today?");
    });

    it('returns next response when index increments', () => {
      const fixture = loadFixture('test-fixture');

      const response = getFixtureResponse(fixture, 'user-a', 1);

      expect(response).toContain("I'm doing well");
    });

    it('throws error when user not in storyline', () => {
      const fixture = loadFixture('test-fixture');

      expect(() => getFixtureResponse(fixture, 'unknown-user', 0)).toThrow(
        'No storyline found for user: unknown-user'
      );
    });

    it('throws error when index out of bounds', () => {
      const fixture = loadFixture('test-fixture');

      expect(() => getFixtureResponse(fixture, 'user-a', 99)).toThrow(
        'Response index 99 out of bounds for user user-a (has 2 responses)'
      );
    });
  });
});
