import OpenAI from 'openai';
import { config } from '../../config/env.js';
import { buildPromptMessages, buildClarificationPromptMessages, type ClarificationContext } from '../../prompts/queryNormalizerPrompt.js';
import { llmOutputSchema } from '../../validation/responseSchemas.js';
import type { QueryNormalizerModel, QueryNormalizerModelInput, QueryNormalizerModelOutput } from '../QueryNormalizerModel.js';

/**
 * Local LLM provider using OpenAI-compatible API.
 * Works with vLLM, llama.cpp, Ollama, or any OpenAI-compatible server.
 */
export class LocalQueryNormalizer implements QueryNormalizerModel {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      baseURL: `${config.LOCAL_LLM_BASE_URL}/v1`,
      apiKey: config.LOCAL_LLM_API_KEY,
      timeout: config.LLM_TIMEOUT_MS,
    });
    this.model = config.LOCAL_LLM_MODEL;
  }

  async normalize(input: QueryNormalizerModelInput): Promise<QueryNormalizerModelOutput> {
    const messages = buildPromptMessages(input.userRequest);
    return this.callLLM(messages);
  }

  async resolveClarification(context: ClarificationContext): Promise<QueryNormalizerModelOutput> {
    const messages = buildClarificationPromptMessages(context);
    return this.callLLM(messages);
  }

  private async callLLM(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<QueryNormalizerModelOutput> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.LLM_MAX_TOKENS,
      temperature: config.LLM_TEMPERATURE,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response');
    }

    // Parse JSON from response
    let parsed: unknown;
    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error(`Failed to parse LLM response as JSON: ${content}`);
    }

    // Validate against schema
    const result = llmOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`LLM output validation failed: ${result.error.message}`);
    }

    return {
      ...result.data,
      fallback_terms: result.data.fallback_terms ?? [],
      clarification_type: result.data.clarification_type ?? null,
      clarification_options: result.data.clarification_options ?? null,
      raw: config.ENABLE_DEBUG_RAW_MODEL_OUTPUT ? parsed : undefined,
    };
  }
}

