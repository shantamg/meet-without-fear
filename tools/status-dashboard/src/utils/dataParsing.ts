import { parseJsonSafely } from './json';

/**
 * Recursively parses JSON strings and nested JSON within objects/arrays.
 * Handles double-encoded JSON and nested string values.
 */
export function deepParse(data: any): any {
  if (typeof data === 'string') {
    // Attempt robust parsing
    const parsed = parseJsonSafely(data);

    // If parsing succeeded
    if (parsed !== null) {
      // If result is an object/array, recurse to handle nested JSON in values
      if (typeof parsed === 'object') {
        return deepParse(parsed);
      }
      // If result is a string and different from input (e.g. double encoded), recurse
      if (typeof parsed === 'string' && parsed !== data) {
        return deepParse(parsed);
      }
      return parsed;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(deepParse);
  }

  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, deepParse(v)])
    );
  }

  return data;
}
