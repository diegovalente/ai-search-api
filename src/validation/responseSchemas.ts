import { z } from 'zod';

// Supported clarification types
export const clarificationTypes = [
  'content_type',      // movie vs series
  'actor_ambiguity',   // which Chris?
  'genre_ambiguity',   // thriller movie vs series
  'similarity',        // clarifying "something like X"
  'other',             // catch-all
] as const;

export type ClarificationType = typeof clarificationTypes[number];

export const llmOutputSchema = z.object({
  search_term: z.string().nullable(),
  fallback_terms: z.array(z.string()).optional(),
  assistant_message: z.string(),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
  clarification_type: z.enum(clarificationTypes).nullable().optional(),
  clarification_options: z.array(z.string()).nullable().optional(),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['search', 'clarification']),
  // For continuation detection
  is_continuation: z.boolean().optional(),
});

export type LLMOutput = z.infer<typeof llmOutputSchema>;

// Refined schema with business logic validation
export const validatedResponseSchema = llmOutputSchema.superRefine((data, ctx) => {
  if (data.needs_clarification) {
    // When clarification is needed
    if (data.clarification_question === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clarification_question must be non-null when needs_clarification is true',
        path: ['clarification_question'],
      });
    }
    if (data.search_term !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'search_term should be null when needs_clarification is true',
        path: ['search_term'],
      });
    }
    if (data.intent !== 'clarification') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'intent must be "clarification" when needs_clarification is true',
        path: ['intent'],
      });
    }
  } else {
    // When no clarification needed
    if (data.clarification_question !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clarification_question should be null when needs_clarification is false',
        path: ['clarification_question'],
      });
    }
  }
});

export const debugInfoSchema = z.object({
  raw_model_output: z.unknown().optional(),
  validation_errors: z.array(z.string()).optional(),
  fallback_applied: z.boolean().optional(),
  timings_ms: z
    .object({
      llm: z.number().optional(),
      validation: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
});

export type DebugInfo = z.infer<typeof debugInfoSchema>;

export const searchNormalizationResponseSchema = z.object({
  conversation_id: z.string(),
  search_term: z.string().nullable(),
  fallback_terms: z.array(z.string()),
  assistant_message: z.string(),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
  clarification_type: z.enum(clarificationTypes).nullable(),
  clarification_options: z.array(z.string()).nullable(),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['search', 'clarification']),
  validation_status: z.enum(['valid', 'fallback']),
  debug: debugInfoSchema.optional(),
});

export type SearchNormalizationResponse = z.infer<typeof searchNormalizationResponseSchema>;

