/**
 * E2E Auth Helper
 *
 * Creates authentication headers for E2E testing.
 */

export interface E2EAuthHeaders {
  'x-e2e-user-id': string;
  'x-e2e-user-email': string;
}

/**
 * Create E2E auth headers for a given user email.
 * @param email - User email (should end with @e2e.test)
 * @param userId - Optional user ID (defaults to email prefix)
 */
export function createAuthHeaders(
  email: string,
  userId?: string
): E2EAuthHeaders {
  const id = userId ?? email.split('@')[0];
  return {
    'x-e2e-user-id': id,
    'x-e2e-user-email': email,
  };
}

/**
 * Create extra HTTP headers object for fetch/Playwright requests.
 */
export function getE2EHeaders(email: string, userId?: string): Record<string, string> {
  const headers = createAuthHeaders(email, userId);
  return {
    'x-e2e-user-id': headers['x-e2e-user-id'],
    'x-e2e-user-email': headers['x-e2e-user-email'],
  };
}
