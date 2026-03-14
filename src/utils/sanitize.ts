/**
 * Sanitize and validate strings for safe output.
 */

/**
 * Remove potentially harmful characters from a string.
 */
export function sanitizeString(input: string): string {
  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim
    .trim();
}

/**
 * Sanitize search term for safe display and API usage.
 */
export function sanitizeSearchTerm(term: string): string {
  let sanitized = sanitizeString(term);

  // Remove any HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove newlines
  sanitized = sanitized.replace(/[\r\n]/g, ' ');

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Remove quotes at start/end unless clearly part of title
  sanitized = sanitized.replace(/^["']+|["']+$/g, '');

  return sanitized.trim();
}

/**
 * Sanitize assistant message for safe display.
 */
export function sanitizeAssistantMessage(message: string): string {
  let sanitized = sanitizeString(message);

  // Remove any HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove newlines - message should be single line
  sanitized = sanitized.replace(/[\r\n]/g, ' ');

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Ensure proper ending punctuation
  if (!/[.!?]$/.test(sanitized)) {
    sanitized = sanitized + '.';
  }

  return sanitized.trim();
}

/**
 * Redact sensitive content for logging.
 */
export function redactForLogging(text: string, maxLength: number = 20): string {
  if (text.length <= maxLength) {
    return `[${text.length} chars]`;
  }
  return `[${text.length} chars, starts: "${text.substring(0, maxLength)}..."]`;
}

