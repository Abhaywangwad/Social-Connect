/**
 * Text sanitization and NoSQL operator injection protection utilities.
 */

// Matches ASCII control characters except tab (\t), newline (\n), and carriage return (\r)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitizes plain user text:
 * - Strips dangerous null bytes and non-printable control characters
 * - Trims whitespace
 * - Preserves natural text, quotes, emojis, and valid formatting without HTML-encoding
 *
 * @param {string} text
 * @returns {string} Cleaned text
 */
export const sanitizeText = (text) => {
  if (typeof text !== 'string') return text;
  return text.replace(CONTROL_CHARS_REGEX, '').trim();
};

/**
 * Recursively checks if an object contains keys that start with '$' or contain '.'
 * which could be interpreted as MongoDB query operators.
 *
 * @param {*} val
 * @returns {boolean} True if a prohibited operator key is found
 */
export const containsMongoOperators = (val) => {
  if (val === null || typeof val !== 'object') {
    return false;
  }

  if (Array.isArray(val)) {
    return val.some((item) => containsMongoOperators(item));
  }

  for (const [key, value] of Object.entries(val)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (containsMongoOperators(value)) {
      return true;
    }
  }

  return false;
};

/**
 * Recursively cleanses user text fields in an object or array.
 *
 * @param {*} data
 * @returns {*}
 */
export const sanitizeDataDeep = (data) => {
  if (typeof data === 'string') {
    return sanitizeText(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeDataDeep(item));
  }

  if (data !== null && typeof data === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(data)) {
      cleaned[key] = sanitizeDataDeep(val);
    }
    return cleaned;
  }

  return data;
};
