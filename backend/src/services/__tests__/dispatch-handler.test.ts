import { handleDispatch, DispatchTag } from '../dispatch-handler';

describe('dispatch-handler', () => {
  describe('handleDispatch', () => {
    it('returns process explanation for EXPLAIN_PROCESS', async () => {
      const result = await handleDispatch('EXPLAIN_PROCESS');

      expect(result).toContain('stages');
      expect(result).toContain('Witness');
      expect(result).toContain('Perspective');
    });

    it('returns memory guidance for HANDLE_MEMORY_REQUEST', async () => {
      const result = await handleDispatch('HANDLE_MEMORY_REQUEST');

      expect(result).toContain('Profile');
      expect(result).toContain('Things to Remember');
    });

    it('returns generic message for unknown dispatch tag', async () => {
      const result = await handleDispatch('UNKNOWN_TAG');

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });

    it('handles null/empty dispatch tag gracefully', async () => {
      const result = await handleDispatch('');
      expect(result).toBeTruthy();
    });
  });
});
