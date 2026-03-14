import type { ClarificationContext } from '../prompts/queryNormalizerPrompt.js';

/**
 * Interface for query normalization LLM providers.
 * This abstraction allows swapping between different LLM backends.
 */
export interface QueryNormalizerModelInput {
  userRequest: string;
  locale?: string;
}

export interface QueryNormalizerModelOutput {
  search_term: string | null;
  fallback_terms?: string[];
  assistant_message: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  clarification_type?: string | null;
  clarification_options?: string[] | null;
  confidence: number;
  intent: 'search' | 'clarification';
  is_continuation?: boolean;
  raw?: unknown;
}

export interface QueryNormalizerModel {
  /**
   * Normalize a user's natural language request into a structured search query.
   * @param input - The user request and optional locale
   * @returns Structured normalization output
   * @throws Error if the provider fails to respond
   */
  normalize(input: QueryNormalizerModelInput): Promise<QueryNormalizerModelOutput>;

  /**
   * Resolve a clarification by combining previous context with user's reply.
   * @param context - The clarification context including previous request and user reply
   * @returns Structured normalization output with is_continuation flag
   * @throws Error if the provider fails to respond
   */
  resolveClarification(context: ClarificationContext): Promise<QueryNormalizerModelOutput>;
}

