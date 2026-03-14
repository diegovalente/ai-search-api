/**
 * Input validation and pre-processing guards.
 * These run before the LLM to catch obvious invalid inputs.
 */

// Default clarification options for off-topic/invalid queries
export const DEFAULT_CLARIFICATION_OPTIONS = ['Comedy', 'The Office', 'NBA', 'Sci-Fi'];

/**
 * Check if input appears to be gibberish (random characters, no real words).
 */
export function isGibberish(input: string): boolean {
  const cleaned = input.trim().toLowerCase();
  
  // Too short
  if (cleaned.length < 2) {
    return true;
  }
  
  // No vowels at all (unlikely to be real words)
  const hasVowels = /[aeiouy]/i.test(cleaned);
  if (!hasVowels && cleaned.length > 3) {
    return true;
  }
  
  // Too many consonants in a row (5+)
  const tooManyConsonants = /[bcdfghjklmnpqrstvwxz]{5,}/i.test(cleaned);
  if (tooManyConsonants) {
    return true;
  }
  
  // Mostly special characters or numbers
  const alphaCount = (cleaned.match(/[a-z]/gi) || []).length;
  if (alphaCount < cleaned.length * 0.5 && cleaned.length > 3) {
    return true;
  }
  
  // Repeated characters (e.g., "aaaaaaa" or "abababab")
  if (/(.)\1{4,}/.test(cleaned)) {
    return true;
  }
  
  return false;
}

/**
 * List of common off-topic patterns that are clearly not search queries.
 */
const OFF_TOPIC_PATTERNS = [
  /^(hi|hello|hey|howdy|greetings)\b/i,
  /what('s| is) the (weather|time|date)/i,
  /tell me a joke/i,
  /who are you/i,
  /what can you do/i,
  /^(thanks|thank you|thx)/i,
  /^(bye|goodbye|see you)/i,
  /how are you/i,
  /^(yes|no|ok|okay|sure|maybe)$/i,
  /help me with/i,
  /^test+$/i,
];

/**
 * Check if input matches common off-topic patterns.
 */
export function isOffTopic(input: string): boolean {
  const cleaned = input.trim();
  
  return OFF_TOPIC_PATTERNS.some(pattern => pattern.test(cleaned));
}

/**
 * Pre-LLM validation result.
 */
export interface InputValidationResult {
  isValid: boolean;
  reason?: 'gibberish' | 'off_topic' | 'empty';
}

/**
 * Validate input before sending to LLM.
 * Returns early for obvious invalid inputs to save API calls.
 */
export function validateInput(input: string): InputValidationResult {
  const cleaned = input.trim();
  
  if (cleaned.length === 0) {
    return { isValid: false, reason: 'empty' };
  }
  
  if (isGibberish(cleaned)) {
    return { isValid: false, reason: 'gibberish' };
  }
  
  if (isOffTopic(cleaned)) {
    return { isValid: false, reason: 'off_topic' };
  }
  
  return { isValid: true };
}

