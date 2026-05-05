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
      .trim();

    const emphasisMatch = cleaned.match(/^\*\*([\s\S]*?)\*\*$/) ??
      cleaned.match(/^__([\s\S]*?)__$/);
    if (emphasisMatch) {
      cleaned = emphasisMatch[1].trim();
    }

    const quoteMatch = cleaned.match(/^["“”']([\s\S]*?)["“”']$/);
    if (quoteMatch) {
      cleaned = quoteMatch[1].trim();
    }
    if (cleaned === before) break;
  }

  return cleaned;
}
