import { resetAIClient } from '../ai';

describe('AI Service', () => {
  beforeEach(() => {
    // Reset the client before each test to ensure clean state
    resetAIClient();
  });

  describe('resetAIClient', () => {
    it('resets the client without error', () => {
      expect(() => resetAIClient()).not.toThrow();
    });
  });

  // Note: getWitnessResponse and related functions have been removed
  // as they are no longer used in production (replaced by getOrchestratedResponse
  // which uses the AI orchestrator pipeline with stage-prompts.ts)
});
