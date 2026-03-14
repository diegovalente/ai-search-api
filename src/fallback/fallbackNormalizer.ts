import type { SearchNormalizationResponse } from '../validation/responseSchemas.js';

// Common filler phrases to remove
const FILLER_PATTERNS = [
  /^show\s+me\s+/i,
  /^i\s+want\s+(to\s+)?(watch\s+|see\s+)?/i,
  /^can\s+you\s+find\s+/i,
  /^give\s+me\s+/i,
  /^find\s+me\s+/i,
  /^search\s+for\s+/i,
  /^look\s+for\s+/i,
  /^i('m)?\s+looking\s+for\s+/i,
  /^play\s+/i,
  /^put\s+on\s+/i,
  /^let('s)?\s+watch\s+/i,
  /^i\s+would\s+like\s+(to\s+)?(watch\s+|see\s+)?/i,
];

/**
 * Clean and extract a usable search term from raw user input.
 * Used as fallback when LLM fails or returns invalid output.
 */
export function extractSearchTermFromRequest(userRequest: string): string | null {
  let cleaned = userRequest.trim();

  // Remove filler phrases
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Trim whitespace and collapse multiple spaces
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.!?]+$/, '').trim();

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

  // If too short or empty, return null
  if (cleaned.length < 2) {
    return null;
  }

  // Enforce max length
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 120).trim();
  }

  return cleaned;
}

/**
 * Normalize search term formatting after LLM or fallback extraction.
 */
export function normalizeSearchTerm(term: string): string {
  let normalized = term.trim();

  // Normalize comma spacing to ", "
  normalized = normalized.replace(/\s*,\s*/g, ', ');

  // Remove repeated commas
  normalized = normalized.replace(/,(\s*,)+/g, ',');

  // Remove leading/trailing commas
  normalized = normalized.replace(/^,\s*|\s*,$/g, '');

  // Remove line breaks
  normalized = normalized.replace(/[\r\n]+/g, ' ');

  // Remove markdown/special chars
  normalized = normalized.replace(/[*_`#\[\]]/g, '');

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Remove surrounding quotes unless clearly part of a title
  if (/^["'].*["']$/.test(normalized) && !normalized.includes(' ')) {
    normalized = normalized.replace(/^["']|["']$/g, '');
  }

  return normalized;
}

/**
 * Generate simple fallback terms from a search term.
 */
function generateSimpleFallbackTerms(searchTerm: string): string[] {
  const terms: string[] = [];
  const normalized = normalizeSearchTerm(searchTerm);

  // If it has multiple concepts (comma-separated), split them
  const parts = normalized.split(',').map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length > 1) {
    // Add individual parts as fallbacks
    terms.push(...parts.slice(0, 2));
  }

  // Add first word as broadest fallback if different
  const firstWord = normalized.split(/[\s,]+/)[0];
  if (firstWord && !terms.includes(firstWord) && firstWord !== normalized) {
    terms.push(firstWord);
  }

  return terms.slice(0, 3);
}

/**
 * Generate a fallback response when LLM fails or returns invalid output.
 * Note: conversation_id will be added by the service layer.
 */
export function generateFallbackResponse(userRequest: string): SearchNormalizationResponse {
  const searchTerm = extractSearchTermFromRequest(userRequest);

  if (searchTerm) {
    const normalizedTerm = normalizeSearchTerm(searchTerm);
    return {
      conversation_id: '', // Will be set by service
      search_term: normalizedTerm,
      fallback_terms: generateSimpleFallbackTerms(normalizedTerm),
      assistant_message: 'Searching your request.',
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      confidence: 0.4,
      intent: 'search',
      validation_status: 'fallback',
    };
  }

  // No usable search term could be extracted
  return {
    conversation_id: '', // Will be set by service
    search_term: null,
    fallback_terms: [],
    assistant_message: 'I need a bit more detail.',
    needs_clarification: true,
    clarification_question: 'What would you like to watch?',
    clarification_type: 'other',
    clarification_options: ['movies', 'series'],
    confidence: 0.2,
    intent: 'clarification',
    validation_status: 'fallback',
  };
}

