/**
 * Tests for knowledgeBaseExport.ts
 *
 * Tests the pure utility function that formats takeaway data as readable
 * plain text for export via the OS share sheet.
 */

import { formatTakeawaysForExport, TakeawayForExport } from '../knowledgeBaseExport';

// ============================================================================
// Helpers
// ============================================================================

function makeTakeaway(content: string, theme?: string): TakeawayForExport {
  return { content, theme };
}

// ============================================================================
// Tests
// ============================================================================

describe('formatTakeawaysForExport', () => {
  describe('header', () => {
    it('always includes a date header line', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I need space')]);
      // Should contain some date-like content
      expect(result).toMatch(/My Reflections/);
    });

    it('includes context in the header when context param is provided', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I need space')], 'Work Stress');
      expect(result).toContain('My Reflections: Work Stress');
    });

    it('omits context prefix when no context param', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I need space')]);
      // Should have "My Reflections" but NOT "My Reflections: " followed by text
      expect(result).not.toMatch(/My Reflections: \w/);
    });
  });

  describe('single takeaway', () => {
    it('includes the takeaway content in the output', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I need space', 'Boundaries')]);
      expect(result).toContain('I need space');
    });

    it('uses a dash bullet prefix for the takeaway', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I need space', 'Boundaries')]);
      expect(result).toContain('- I need space');
    });

    it('omits the theme header when there is only one theme group', () => {
      // Single theme — no redundant "Boundaries:" label should appear
      const result = formatTakeawaysForExport([makeTakeaway('I need space', 'Boundaries')]);
      expect(result).not.toContain('Boundaries:');
    });

    it('omits any theme label when theme is undefined and only one group', () => {
      const result = formatTakeawaysForExport([makeTakeaway('I feel overwhelmed')]);
      // Should not print "General:" when there is only one group
      expect(result).not.toContain('General:');
      expect(result).toContain('- I feel overwhelmed');
    });
  });

  describe('multiple themes', () => {
    it('groups takeaways by theme with theme headers', () => {
      const takeaways: TakeawayForExport[] = [
        makeTakeaway('I need space', 'Boundaries'),
        makeTakeaway('I feel respected', 'Connection'),
      ];
      const result = formatTakeawaysForExport(takeaways);
      expect(result).toContain('Boundaries:');
      expect(result).toContain('Connection:');
    });

    it('includes all takeaway contents when multiple themes', () => {
      const takeaways: TakeawayForExport[] = [
        makeTakeaway('I need space', 'Boundaries'),
        makeTakeaway('I feel respected', 'Connection'),
      ];
      const result = formatTakeawaysForExport(takeaways);
      expect(result).toContain('- I need space');
      expect(result).toContain('- I feel respected');
    });

    it('groups multiple takeaways under the same theme', () => {
      const takeaways: TakeawayForExport[] = [
        makeTakeaway('I need space', 'Boundaries'),
        makeTakeaway('I need quiet time', 'Boundaries'),
        makeTakeaway('I feel respected', 'Connection'),
      ];
      const result = formatTakeawaysForExport(takeaways);
      // Boundaries: header appears once, then both items
      const lines = result.split('\n');
      const boundariesHeaderIdx = lines.findIndex((l) => l.includes('Boundaries:'));
      expect(boundariesHeaderIdx).toBeGreaterThanOrEqual(0);
      // Both Boundaries items appear after the header
      const afterHeader = lines.slice(boundariesHeaderIdx + 1);
      expect(afterHeader.some((l) => l.includes('I need space'))).toBe(true);
      expect(afterHeader.some((l) => l.includes('I need quiet time'))).toBe(true);
    });
  });

  describe('empty array', () => {
    it('returns header only without crashing', () => {
      const result = formatTakeawaysForExport([]);
      expect(result).toMatch(/My Reflections/);
      // Should not throw; no bullet items
      expect(result).not.toContain('- ');
    });

    it('includes context in header even when empty', () => {
      const result = formatTakeawaysForExport([], 'Work Stress');
      expect(result).toContain('My Reflections: Work Stress');
    });
  });
});
