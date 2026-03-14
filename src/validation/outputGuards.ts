// Constants for validation
const MAX_ASSISTANT_MESSAGE_LENGTH = 80;
const MAX_SEARCH_TERM_LENGTH = 120;
const MAX_CLARIFICATION_QUESTION_LENGTH = 100;
const MAX_FALLBACK_TERMS = 3;
const MAX_FALLBACK_TERM_LENGTH = 60;
const MAX_FALLBACK_TERM_WORDS = 6;

// Blocked patterns for assistant messages
const BLOCKED_PATTERNS = [
  /!/,                          // No exclamation marks
  /\b(fuck|shit|damn|ass|bitch|crap)\b/i,  // No profanity
  /\b(best|perfect|amazing|awesome|great|love)\b/i,  // No editorial claims
  /\b(you'll|you will)\b/i,     // No promises
  /\b(we have|we found|available)\b/i,  // No catalog claims
  /\b(recommend|suggestion)\b/i, // No recommendation claims
  /\b(your history|watched before|based on your)\b/i, // No personalization claims
];

// Fallback messages when validation fails
export const FALLBACK_MESSAGES = [
  'Searching your request.',
  'Looking for matching titles.',
  "I'm searching for that.",
] as const;

export interface AssistantMessageValidation {
  isValid: boolean;
  errors: string[];
}

export function validateAssistantMessage(message: string): AssistantMessageValidation {
  const errors: string[] = [];

  if (message.length > MAX_ASSISTANT_MESSAGE_LENGTH) {
    errors.push(`Message exceeds ${MAX_ASSISTANT_MESSAGE_LENGTH} character limit`);
  }

  // Check for multiple sentences (rough heuristic)
  const sentenceCount = message.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  if (sentenceCount > 1) {
    errors.push('Message must be a single sentence');
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      errors.push(`Message contains blocked pattern: ${pattern.source}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateSearchTerm(term: string | null): { isValid: boolean; errors: string[] } {
  if (term === null) {
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];

  if (term.length > MAX_SEARCH_TERM_LENGTH) {
    errors.push(`Search term exceeds ${MAX_SEARCH_TERM_LENGTH} character limit`);
  }

  // Check for markdown or special formatting
  if (/[*_`#\[\]]/.test(term)) {
    errors.push('Search term contains markdown or special formatting');
  }

  // Check for emojis
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(term)) {
    errors.push('Search term contains emojis');
  }

  // Check for line breaks
  if (/[\r\n]/.test(term)) {
    errors.push('Search term contains line breaks');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateClarificationQuestion(
  question: string | null
): { isValid: boolean; errors: string[] } {
  if (question === null) {
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];

  if (question.length > MAX_CLARIFICATION_QUESTION_LENGTH) {
    errors.push(`Clarification question exceeds ${MAX_CLARIFICATION_QUESTION_LENGTH} character limit`);
  }

  // Should be a question
  if (!question.trim().endsWith('?')) {
    errors.push('Clarification question should end with a question mark');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getRandomFallbackMessage(): string {
  return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
}

/**
 * Validate fallback terms array according to spec:
 * - Max 3 terms
 * - Each term under 60 characters
 * - Each term max 6 words
 * - No sentences (no periods unless part of abbreviation)
 * - No markdown or special formatting
 */
export function validateFallbackTerms(
  terms: string[] | undefined,
  primarySearchTerm: string | null
): { isValid: boolean; errors: string[]; sanitizedTerms: string[] } {
  if (!terms || terms.length === 0) {
    return { isValid: true, errors: [], sanitizedTerms: [] };
  }

  const errors: string[] = [];
  const sanitizedTerms: string[] = [];

  // Check max count
  if (terms.length > MAX_FALLBACK_TERMS) {
    errors.push(`Too many fallback terms: ${terms.length}, max is ${MAX_FALLBACK_TERMS}`);
  }

  // Validate each term
  const termsToProcess = terms.slice(0, MAX_FALLBACK_TERMS);

  for (let i = 0; i < termsToProcess.length; i++) {
    let term = termsToProcess[i].trim();

    // Check if it duplicates the primary search term
    if (primarySearchTerm && term.toLowerCase() === primarySearchTerm.toLowerCase()) {
      errors.push(`Fallback term ${i + 1} duplicates primary search term`);
      continue;
    }

    // Check length
    if (term.length > MAX_FALLBACK_TERM_LENGTH) {
      errors.push(`Fallback term ${i + 1} exceeds ${MAX_FALLBACK_TERM_LENGTH} character limit`);
      term = term.substring(0, MAX_FALLBACK_TERM_LENGTH).trim();
    }

    // Check word count
    const wordCount = term.split(/\s+/).length;
    if (wordCount > MAX_FALLBACK_TERM_WORDS) {
      errors.push(`Fallback term ${i + 1} exceeds ${MAX_FALLBACK_TERM_WORDS} word limit`);
    }

    // Check for sentences (ends with period followed by space and capital)
    if (/\.\s+[A-Z]/.test(term)) {
      errors.push(`Fallback term ${i + 1} appears to be a sentence`);
    }

    // Check for markdown or special formatting
    if (/[*_`#\[\]]/.test(term)) {
      errors.push(`Fallback term ${i + 1} contains markdown or special formatting`);
      term = term.replace(/[*_`#\[\]]/g, '');
    }

    // Check for emojis
    if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(term)) {
      errors.push(`Fallback term ${i + 1} contains emojis`);
    }

    // Check for line breaks
    if (/[\r\n]/.test(term)) {
      term = term.replace(/[\r\n]/g, ' ').trim();
    }

    // Check for quotes
    if (/["']/.test(term)) {
      term = term.replace(/["']/g, '').trim();
    }

    if (term.length > 0) {
      sanitizedTerms.push(term);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedTerms,
  };
}
