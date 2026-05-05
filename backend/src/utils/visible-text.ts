/**
 * Cleanup for AI-generated text before it is shown or persisted.
 *
 * This is intentionally narrow: it removes serialization and markdown artifacts
 * that the prompt format can leak, without rewriting normal prose.
 */
export function cleanVisibleAIText(text: string): string {
  let cleaned = text
    .replace(/\\"/g, '"')
    .replace(/\r\n/g, '\n')
    .trim();

  for (let i = 0; i < 4; i += 1) {
    const before = cleaned;
    cleaned = cleaned
      .split('\n')
      .filter((line, index) => {
        const trimmed = line.trim();
        if (index === 0 && /^(?:---+|```(?:json|markdown)?|~~~)$/.test(trimmed)) {
          return false;
        }
        return !/^(?:```|~~~)$/.test(trimmed);
      })
      .join('\n')
      .replace(/^---+\s*/, '')
      .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, '$1')
      .replace(/__([^_\n][\s\S]*?[^_\n])__/g, '$1')
      .trim();

    const quoteMatch = cleaned.match(/^["“”']([\s\S]*?)["“”']$/);
    if (quoteMatch) {
      cleaned = quoteMatch[1].trim();
    }
    if (cleaned === before) break;
  }

  return cleaned;
}
