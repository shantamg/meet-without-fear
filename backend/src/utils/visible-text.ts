/**
 * Cleanup for AI-generated text before it is shown or persisted.
 *
 * This is intentionally narrow: it removes serialization and markdown artifacts
 * that the prompt format can leak, without rewriting normal prose.
 */
export interface CleanVisibleAITextOptions {
  /**
   * Streaming chunks may begin or end with semantically meaningful whitespace.
   * Preserve it when cleaning per-chunk text so chunk boundaries do not collapse
   * words together in the streamed or persisted response.
   */
  preserveBoundaryWhitespace?: boolean;
}

export function cleanVisibleAIText(
  text: string,
  options: CleanVisibleAITextOptions = {}
): string {
  if (options.preserveBoundaryWhitespace && text.trim().length === 0) {
    return text;
  }

  const leadingWhitespace = options.preserveBoundaryWhitespace
    ? text.match(/^\s*/)?.[0] ?? ''
    : '';
  const trailingWhitespace = options.preserveBoundaryWhitespace
    ? text.match(/\s*$/)?.[0] ?? ''
    : '';

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

  if (options.preserveBoundaryWhitespace && cleaned.length > 0) {
    return `${leadingWhitespace}${cleaned}${trailingWhitespace}`;
  }

  return cleaned;
}
