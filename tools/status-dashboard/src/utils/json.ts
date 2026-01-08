export function parseJsonSafely(text: string): any {
  if (!text || typeof text !== 'string') return null;

  // 1. Try parsing the whole text first (happy path)
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue
  }

  // 2. Extract potential JSON string
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      startIndex = i;
      break;
    }
  }

  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '}') {
      endIndex = i;
      break;
    }
  }

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return null;
  }

  const rawJson = text.substring(startIndex, endIndex + 1);

  // 3. Try parsing extracted JSON
  try {
    return JSON.parse(rawJson);
  } catch {
    // Continue for repair
  }

  // 4. Robust Repair: Handle unescaped newlines inside strings
  // We iterate through chars, tracking if we are inside a string.
  // If inside a string, we replace \n with \\n
  let repaired = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < rawJson.length; i++) {
    const char = rawJson[i];

    if (inString) {
      if (char === '"' && !isEscaped) {
        inString = false;
        repaired += char;
      } else if (char === '\\') {
        isEscaped = !isEscaped;
        repaired += char;
      } else if (char === '\n') {
        // Fix: unescaped newline inside string -> escaped
        repaired += '\\n';
        isEscaped = false;
      } else if (char === '\r') {
        // Ignore CR inside strings if we are fixing newlines
        isEscaped = false;
      } else if (char === '\t') {
        // Optional: fix unescaped tabs too
        repaired += '\\t';
        isEscaped = false;
      } else {
        repaired += char;
        isEscaped = false;
      }
    } else {
      // Not in string
      if (char === '"') {
        inString = true;
      }
      repaired += char;
    }
  }

  try {
    return JSON.parse(repaired);
  } catch (e) {
    console.debug('Failed to parse repaired JSON', e);
  }

  // 5. Fallback: Last ditch regex effort (for simple cases if logic above failed)
  // This is less robust but handles specific single-line cases well
  try {
    let jsonStr = rawJson;
    jsonStr = jsonStr.replace(/(:"[^"]*?)\n([^"]*?")/g, '$1\\n$2');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
