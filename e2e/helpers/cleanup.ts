/**
 * E2E Database Cleanup Helper
 *
 * Cleans up test data before each E2E test run.
 * Deletes all users with emails matching *@e2e.test pattern.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Clean up all E2E test data from the database.
 * Deletes users with emails matching the *@e2e.test pattern.
 * Cascades to related data (sessions, messages, etc.).
 */
export async function cleanupE2EData(): Promise<{ deletedCount: number }> {
  const response = await fetch(`${API_BASE_URL}/api/e2e/cleanup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-e2e-admin-key': process.env.E2E_ADMIN_KEY || 'e2e-test-admin-key',
    },
  });

  if (!response.ok) {
    throw new Error(`Cleanup failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
