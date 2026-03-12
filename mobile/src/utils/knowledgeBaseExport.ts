/**
 * Knowledge Base Export Utility
 *
 * Pure string-formatting functions for exporting takeaways as readable plain text.
 * Used with React Native's built-in Share.share() to invoke the OS share sheet.
 *
 * No React / React Native dependencies — suitable for unit testing in isolation.
 */

// ============================================================================
// Types
// ============================================================================

export interface TakeawayForExport {
  content: string;
  /** Optional theme label for grouping. Takeaways without a theme go into a single unnamed group. */
  theme?: string;
}

// ============================================================================
// Formatter
// ============================================================================

/**
 * Format an array of takeaways as readable plain text for the OS share sheet.
 *
 * Rules:
 * - Always includes a date header line ("My Reflections\n<date>").
 * - If `context` is provided, the header becomes "My Reflections: <context>\n<date>".
 * - Takeaways are grouped by `theme`. If only one theme group exists, the theme
 *   label is omitted (no redundant "General:" or single-topic echo).
 * - Each takeaway is prefixed with a dash bullet ("- ").
 * - Empty array returns the header only (no crash).
 *
 * @param takeaways - Takeaway items to format.
 * @param context   - Optional context label appended to the header (e.g. "Work Stress").
 * @returns Plain text string ready to pass to Share.share({ message }).
 */
export function formatTakeawaysForExport(
  takeaways: TakeawayForExport[],
  context?: string
): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const headerTitle = context ? `My Reflections: ${context}` : 'My Reflections';
  const header = `${headerTitle}\n${date}`;

  if (takeaways.length === 0) {
    return header;
  }

  // Group takeaways by theme
  const grouped = new Map<string, TakeawayForExport[]>();
  for (const t of takeaways) {
    const key = t.theme ?? 'General';
    const group = grouped.get(key) ?? [];
    group.push(t);
    grouped.set(key, group);
  }

  const showThemeHeaders = grouped.size > 1;
  const lines: string[] = [header];

  for (const [theme, items] of grouped) {
    if (showThemeHeaders) {
      lines.push(`\n${theme}:`);
    }
    for (const item of items) {
      lines.push(`- ${item.content}`);
    }
  }

  return lines.join('\n');
}
