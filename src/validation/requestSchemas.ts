import { z } from 'zod';

export const searchNormalizationRequestSchema = z.object({
  user_request: z
    .string()
    .min(1, 'user_request is required')
    .max(500, 'user_request must be at most 500 characters')
    .refine(
      (val) => val.trim().length > 0,
      'user_request must contain non-whitespace characters'
    ),
  locale: z.string().default('en-US'),
  platform: z.enum(['ios', 'android', 'web', 'tv', 'other']).optional(),
  conversation_id: z.string().optional(),
  user_id: z.string().optional(),
  request_id: z.string().optional(),
  debug: z.boolean().default(false),
});

export type SearchNormalizationRequest = z.infer<typeof searchNormalizationRequestSchema>;

