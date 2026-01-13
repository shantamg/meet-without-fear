/**
 * Formats a model name to a human-readable short form.
 */
export function formatModelName(model?: string): string {
  if (!model) return '';
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('titan')) return 'Titan';
  return model.split('/').pop() || model;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Formats a price value to a string with appropriate precision.
 * Returns an object with parts for styled rendering.
 */
export function formatPrice(value?: number): { intPart: string; primaryDec: string; secondaryDec: string; full: string } {
  if (value === undefined || value === null) {
    return { intPart: '0', primaryDec: '00', secondaryDec: '', full: '$0.00' };
  }

  const str = value.toFixed(5);
  const [intPart, decPart] = str.split('.');
  const primaryDec = decPart ? decPart.substring(0, 2) : '00';
  const secondaryDec = decPart ? decPart.substring(2) : '';

  return {
    intPart,
    primaryDec,
    secondaryDec,
    full: `$${str}`,
  };
}

/**
 * Formats a timestamp to a locale time string.
 */
export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Formats a timestamp to a locale date/time string.
 */
export function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}
