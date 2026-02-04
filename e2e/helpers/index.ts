/**
 * E2E Test Helpers
 *
 * Re-exports all helper functions for convenient imports.
 */

export { createAuthHeaders, getE2EHeaders } from './auth';
export { cleanupE2EData } from './cleanup';
export { SessionBuilder, setupSession } from './session-builder';
export type { TargetStage, UserConfig, SessionSetupResult } from './session-builder';
export {
  waitForAIResponse,
  createUserContext,
  handleMoodCheck,
  navigateToSession,
  navigateToShareFromSession,
  signCompact,
  confirmFeelHeard,
} from './test-utils';
