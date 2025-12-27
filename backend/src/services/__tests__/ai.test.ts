import { getWitnessResponse, resetAIClient, WitnessContext } from '../ai';

describe('AI Service', () => {
  beforeEach(() => {
    // Reset the client before each test to ensure clean state
    resetAIClient();
    // Clear any ANTHROPIC_API_KEY to test mock mode
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('getWitnessResponse', () => {
    const defaultContext: WitnessContext = {
      userName: 'Test User',
      turnCount: 1,
    };

    it('returns a mock response when API key is not configured', async () => {
      const messages = [{ role: 'user' as const, content: 'I feel frustrated' }];

      const response = await getWitnessResponse(messages, defaultContext);

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('includes user name in mock response', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const context: WitnessContext = {
        userName: 'Alice',
        turnCount: 1,
      };

      const response = await getWitnessResponse(messages, context);

      expect(response).toContain('Alice');
    });

    it('provides initial greeting for empty conversation', async () => {
      const messages: { role: 'user' | 'assistant'; content: string }[] = [];

      const response = await getWitnessResponse(messages, defaultContext);

      expect(response).toBeDefined();
      expect(response).toContain('listen');
    });

    it('provides empathetic response for early turns', async () => {
      const messages = [
        { role: 'user' as const, content: 'I had a really hard day' },
      ];
      const context: WitnessContext = {
        userName: 'Test User',
        turnCount: 2,
      };

      const response = await getWitnessResponse(messages, context);

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(20);
    });

    it('provides deeper response for later turns', async () => {
      const messages = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'Response 1' },
        { role: 'user' as const, content: 'Second message' },
        { role: 'assistant' as const, content: 'Response 2' },
        { role: 'user' as const, content: 'Third message about feeling unheard' },
      ];
      const context: WitnessContext = {
        userName: 'Test User',
        turnCount: 5,
      };

      const response = await getWitnessResponse(messages, context);

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(20);
    });

    it('handles context with optional fields', async () => {
      const messages = [{ role: 'user' as const, content: 'Test message' }];
      const context: WitnessContext = {
        userName: 'Test User',
        turnCount: 3,
        emotionalIntensity: 7,
        sessionContext: 'Previous conflict about chores',
        priorThemes: ['feeling unheard', 'work-life balance'],
      };

      const response = await getWitnessResponse(messages, context);

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    });
  });

  describe('resetAIClient', () => {
    it('resets the client without error', () => {
      expect(() => resetAIClient()).not.toThrow();
    });
  });
});
