import type { ClarificationContext } from '../../prompts/queryNormalizerPrompt.js';
import type { QueryNormalizerModel, QueryNormalizerModelInput, QueryNormalizerModelOutput } from '../QueryNormalizerModel.js';

/**
 * Mock LLM provider for testing and development.
 * Returns deterministic responses based on input patterns.
 */
export class MockQueryNormalizer implements QueryNormalizerModel {
  async normalize(input: QueryNormalizerModelInput): Promise<QueryNormalizerModelOutput> {
    const request = input.userRequest.toLowerCase();

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Pattern matching for common test cases
    if (request.includes('jim carrey') && request.includes('comedy')) {
      return {
        search_term: 'comedy, Jim Carrey',
        fallback_terms: ['Jim Carrey', 'comedy'],
        assistant_message: 'Looking for comedy titles with Jim Carrey.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.95,
        intent: 'search',
      };
    }

    if (request.includes('horror') && (request.includes('zachary') || request.includes('chucky'))) {
      return {
        search_term: 'horror, Zachary Arthur',
        fallback_terms: ['Zachary Arthur', 'horror'],
        assistant_message: 'Looking for horror titles with Zachary Arthur.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.89,
        intent: 'search',
      };
    }

    if (request.includes('white lotus') && request.includes('actor')) {
      return {
        search_term: null,
        fallback_terms: [],
        assistant_message: 'I need a bit more detail.',
        needs_clarification: true,
        clarification_question: 'Which actor from The White Lotus do you mean?',
        clarification_type: 'actor_ambiguity',
        clarification_options: ['Jennifer Coolidge', 'Aubrey Plaza', 'Sydney Sweeney'],
        confidence: 0.47,
        intent: 'clarification',
      };
    }

    if (request.includes('movies with chris') || (request.includes('chris') && request.includes('movies'))) {
      return {
        search_term: null,
        fallback_terms: [],
        assistant_message: 'I need a bit more detail.',
        needs_clarification: true,
        clarification_question: 'Do you mean Chris Pratt, Chris Evans, or Chris Hemsworth?',
        clarification_type: 'actor_ambiguity',
        clarification_options: ['Chris Pratt', 'Chris Evans', 'Chris Hemsworth'],
        confidence: 0.45,
        intent: 'clarification',
      };
    }

    if (request.includes('batman')) {
      return {
        search_term: 'Batman',
        fallback_terms: ['DC Comics', 'superhero'],
        assistant_message: 'Searching for Batman titles.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.76,
        intent: 'search',
      };
    }

    if (request.includes('office')) {
      return {
        search_term: 'The Office',
        fallback_terms: [],
        assistant_message: 'Searching for titles like The Office.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.84,
        intent: 'search',
      };
    }

    if (request.includes('detective') && (request.includes('funny') || request.includes('comedy'))) {
      return {
        search_term: 'comedy, detective',
        fallback_terms: ['detective', 'comedy'],
        assistant_message: 'Searching for comedy detective shows.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.92,
        intent: 'search',
      };
    }

    if (request.includes('kids') && request.includes('animal')) {
      return {
        search_term: 'animation, animals',
        fallback_terms: ['animation', 'family'],
        assistant_message: 'Looking for animated titles with animals.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.93,
        intent: 'search',
      };
    }

    if (request.includes('action') && request.includes('90s')) {
      return {
        search_term: 'action, 90s',
        fallback_terms: ['90s', 'action'],
        assistant_message: 'Searching for action titles from the 90s.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.91,
        intent: 'search',
      };
    }

    // Default: extract key terms
    const cleanedRequest = request
      .replace(/show me|i want|can you find|give me|find me/gi, '')
      .trim();

    return {
      search_term: cleanedRequest || null,
      fallback_terms: cleanedRequest ? [cleanedRequest.split(' ')[0]] : [],
      assistant_message: cleanedRequest ? 'Searching your request.' : 'I need a bit more detail.',
      needs_clarification: !cleanedRequest,
      clarification_question: cleanedRequest ? null : 'What would you like to watch?',
      clarification_type: cleanedRequest ? null : 'other',
      clarification_options: cleanedRequest ? null : ['movies', 'series'],
      confidence: cleanedRequest ? 0.7 : 0.3,
      intent: cleanedRequest ? 'search' : 'clarification',
    };
  }

  async resolveClarification(context: ClarificationContext): Promise<QueryNormalizerModelOutput> {
    const reply = context.user_reply.toLowerCase();

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check if this is an unrelated query
    const unrelatedPatterns = ['weather', 'what time', 'who is', 'tell me a joke', 'hello', 'hi'];
    const isUnrelated = unrelatedPatterns.some((p) => reply.includes(p));

    if (isUnrelated) {
      return {
        search_term: null,
        fallback_terms: [],
        assistant_message: 'I can only help with finding shows and movies.',
        needs_clarification: false,
        clarification_question: null,
        clarification_type: null,
        clarification_options: null,
        confidence: 0.9,
        intent: 'search',
        is_continuation: false,
      };
    }

    // Check if user is starting a new search
    const newSearchPatterns = ['actually', 'instead', 'show me', 'find me', 'search for'];
    const isNewSearch = newSearchPatterns.some((p) => reply.includes(p));

    if (isNewSearch) {
      const cleanedRequest = reply
        .replace(/actually|instead|show me|find me|search for/gi, '')
        .trim();
      return {
        search_term: cleanedRequest || null,
        fallback_terms: cleanedRequest ? [cleanedRequest.split(' ')[0]] : [],
        assistant_message: cleanedRequest ? `Searching for ${cleanedRequest}.` : 'What would you like to watch?',
        needs_clarification: !cleanedRequest,
        clarification_question: cleanedRequest ? null : 'What would you like to watch?',
        clarification_type: null,
        clarification_options: null,
        confidence: 0.85,
        intent: 'search',
        is_continuation: false,
      };
    }

    // It's a continuation - combine with previous context
    const previousTerm = context.previous_search_term_candidate || '';
    const combinedTerm = previousTerm ? `${previousTerm}, ${context.user_reply}` : context.user_reply;

    return {
      search_term: combinedTerm,
      fallback_terms: [context.user_reply, previousTerm].filter(Boolean),
      assistant_message: `Searching for ${combinedTerm}.`,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      confidence: 0.92,
      intent: 'search',
      is_continuation: true,
    };
  }
}

