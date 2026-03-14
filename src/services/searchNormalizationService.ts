import type { QueryNormalizerModel, QueryNormalizerModelOutput } from '../llm/QueryNormalizerModel.js';
import { generateFallbackResponse, normalizeSearchTerm } from '../fallback/fallbackNormalizer.js';
import { type SearchNormalizationResponse, type DebugInfo, type ClarificationType } from '../validation/responseSchemas.js';
import {
  validateAssistantMessage,
  validateSearchTerm,
  validateClarificationQuestion,
  validateFallbackTerms,
  getRandomFallbackMessage,
} from '../validation/outputGuards.js';
import { validateInput, DEFAULT_CLARIFICATION_OPTIONS } from '../validation/inputGuards.js';
import { sanitizeSearchTerm, sanitizeAssistantMessage } from '../utils/sanitize.js';
import { Timer } from '../utils/timing.js';
import { createRequestLogger } from '../utils/logger.js';
import type { SearchNormalizationRequest } from '../validation/requestSchemas.js';
import { conversationStore, type ConversationState } from '../conversation/conversationStore.js';

export interface NormalizationResult {
  response: SearchNormalizationResponse;
  timings: {
    llm?: number;
    validation?: number;
    total: number;
  };
}

export class SearchNormalizationService {
  constructor(private model: QueryNormalizerModel) {}

  async normalize(request: SearchNormalizationRequest): Promise<NormalizationResult> {
    const timer = new Timer();

    // Generate or use existing conversation ID
    const conversationId = request.conversation_id || conversationStore.generateId();

    const log = createRequestLogger({
      request_id: request.request_id,
      conversation_id: conversationId,
    });

    let debugInfo: DebugInfo = {};
    let validationErrors: string[] = [];

    // Check for existing conversation with pending clarification
    const existingConversation = conversationStore.get(conversationId);

    // Pre-LLM validation for gibberish/off-topic (skip if answering clarification)
    if (!existingConversation?.clarification_pending) {
      const inputValidation = validateInput(request.user_request);
      if (!inputValidation.isValid) {
        log.info({ reason: inputValidation.reason }, 'Input rejected by pre-validation');
        timer.mark('validation');

        const offTopicResponse: SearchNormalizationResponse = {
          conversation_id: conversationId,
          search_term: null,
          fallback_terms: [],
          assistant_message: 'I can help you find movies and shows.',
          needs_clarification: true,
          clarification_question: 'I can help you find movies and shows. What would you like to watch?',
          clarification_type: 'off_topic',
          clarification_options: DEFAULT_CLARIFICATION_OPTIONS,
          confidence: 0,
          intent: 'clarification',
          validation_status: 'valid',
        };

        if (request.debug) {
          offTopicResponse.debug = {
            validation_errors: [`Input rejected: ${inputValidation.reason}`],
            fallback_applied: false,
            timings_ms: timer.getTimings(),
          };
        }

        this.updateConversationState(conversationId, request.user_request, offTopicResponse);
        return { response: offTopicResponse, timings: timer.getTimings() };
      }
    }

    try {
      let llmOutput: QueryNormalizerModelOutput;

      // If there's a pending clarification, use clarification resolution
      if (existingConversation?.clarification_pending) {
        log.info({ previous_request: existingConversation.last_user_request }, 'Resolving clarification');

        llmOutput = await this.model.resolveClarification({
          previous_request: existingConversation.last_user_request,
          previous_search_term_candidate: existingConversation.last_search_term_candidate,
          clarification_question: existingConversation.clarification_question || '',
          clarification_type: existingConversation.clarification_type,
          clarification_options: existingConversation.clarification_options,
          user_reply: request.user_request,
        });

        // If it's not a continuation, treat as new request
        if (llmOutput.is_continuation === false) {
          log.info('User started new conversation, clearing clarification state');
          conversationStore.clearClarification(conversationId);
        }
      } else {
        // Normal request - call LLM
        llmOutput = await this.model.normalize({
          userRequest: request.user_request,
          locale: request.locale,
        });
      }

      timer.mark('llm');

      if (request.debug && llmOutput.raw) {
        debugInfo.raw_model_output = llmOutput.raw;
      }

      // Validate output
      validationErrors = this.validateOutput(llmOutput);
      timer.mark('validation');

      // Build response
      const response = this.buildResponse(llmOutput, conversationId, validationErrors);

      // Update conversation state
      this.updateConversationState(conversationId, request.user_request, response);

      if (request.debug) {
        response.debug = {
          ...debugInfo,
          fallback_applied: false,
          validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
          timings_ms: timer.getTimings(),
        };
      }

      log.info({
        intent: response.intent,
        confidence: response.confidence,
        validation_status: response.validation_status,
        needs_clarification: response.needs_clarification,
      }, 'Normalization completed');

      return { response, timings: timer.getTimings() };

    } catch (error) {
      timer.mark('llm');
      timer.mark('validation');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errorMessage }, 'LLM call failed, using fallback');

      const fallbackResponse = generateFallbackResponse(request.user_request);
      fallbackResponse.conversation_id = conversationId;

      if (request.debug) {
        fallbackResponse.debug = {
          validation_errors: [errorMessage],
          fallback_applied: true,
          timings_ms: timer.getTimings(),
        };
      }

      return { response: fallbackResponse, timings: timer.getTimings() };
    }
  }

  private validateOutput(llmOutput: QueryNormalizerModelOutput): string[] {
    const errors: string[] = [];

    // Validate assistant message
    const messageValidation = validateAssistantMessage(llmOutput.assistant_message);
    if (!messageValidation.isValid) {
      errors.push(...messageValidation.errors);
    }

    // Validate search term
    if (llmOutput.search_term) {
      const termValidation = validateSearchTerm(llmOutput.search_term);
      if (!termValidation.isValid) {
        errors.push(...termValidation.errors);
      }
    }

    // Validate clarification question
    if (llmOutput.clarification_question) {
      const questionValidation = validateClarificationQuestion(llmOutput.clarification_question);
      if (!questionValidation.isValid) {
        errors.push(...questionValidation.errors);
      }
    }

    // Validate fallback terms
    if (llmOutput.fallback_terms && llmOutput.fallback_terms.length > 0) {
      const fallbackValidation = validateFallbackTerms(llmOutput.fallback_terms, llmOutput.search_term);
      if (!fallbackValidation.isValid) {
        errors.push(...fallbackValidation.errors);
      }
    }

    return errors;
  }

  private buildResponse(
    llmOutput: QueryNormalizerModelOutput,
    conversationId: string,
    validationErrors: string[]
  ): SearchNormalizationResponse {
    // Fix common issues
    let assistantMessage = llmOutput.assistant_message;
    if (validationErrors.some(e => e.includes('Message'))) {
      assistantMessage = getRandomFallbackMessage();
    }

    let searchTerm = llmOutput.search_term;
    if (searchTerm) {
      searchTerm = normalizeSearchTerm(sanitizeSearchTerm(searchTerm));
      if (searchTerm.length > 120) {
        searchTerm = searchTerm.substring(0, 120).trim();
      }
    }

    // Validate and sanitize fallback terms
    const fallbackValidation = validateFallbackTerms(llmOutput.fallback_terms, searchTerm);
    let fallbackTerms = fallbackValidation.sanitizedTerms;

    // Ensure logical consistency
    let clarificationQuestion = llmOutput.clarification_question;
    let clarificationType = llmOutput.clarification_type as ClarificationType | null ?? null;
    let clarificationOptions = llmOutput.clarification_options ?? null;
    let intent = llmOutput.intent;
    const needsClarification = llmOutput.needs_clarification;

    if (needsClarification) {
      if (!clarificationQuestion) {
        clarificationQuestion = 'What would you like to watch?';
      }
      intent = 'clarification';
      searchTerm = null;
      fallbackTerms = []; // No fallback terms when clarification is needed
    } else {
      clarificationQuestion = null;
      clarificationType = null;
      clarificationOptions = null;
      intent = 'search';
    }

    return {
      conversation_id: conversationId,
      search_term: searchTerm,
      fallback_terms: fallbackTerms,
      assistant_message: sanitizeAssistantMessage(assistantMessage),
      needs_clarification: needsClarification,
      clarification_question: clarificationQuestion,
      clarification_type: clarificationType,
      clarification_options: clarificationOptions,
      confidence: Math.max(0, Math.min(1, llmOutput.confidence)),
      intent: intent,
      validation_status: validationErrors.length === 0 ? 'valid' : 'valid', // We fix issues, so still valid
    };
  }

  private updateConversationState(
    conversationId: string,
    userRequest: string,
    response: SearchNormalizationResponse
  ): void {
    const state: ConversationState = {
      conversation_id: conversationId,
      last_user_request: userRequest,
      last_search_term_candidate: response.search_term,
      clarification_pending: response.needs_clarification,
      clarification_type: response.clarification_type,
      clarification_options: response.clarification_options,
      clarification_question: response.clarification_question,
      timestamp: Date.now(),
    };

    conversationStore.set(state);
  }
}

