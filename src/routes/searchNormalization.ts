import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { searchNormalizationRequestSchema, type SearchNormalizationRequest } from '../validation/requestSchemas.js';
import { SearchNormalizationService } from '../services/searchNormalizationService.js';
import type { QueryNormalizerModel } from '../llm/QueryNormalizerModel.js';
import { logger } from '../utils/logger.js';

export function registerSearchNormalizationRoutes(
  app: FastifyInstance,
  model: QueryNormalizerModel
): void {
  const service = new SearchNormalizationService(model);

  app.post(
    '/v1/search-normalization',
    {
      schema: {
        body: {
          type: 'object',
          required: ['user_request'],
          properties: {
            user_request: { type: 'string' },
            locale: { type: 'string' },
            platform: { type: 'string', enum: ['ios', 'android', 'web', 'tv', 'other'] },
            conversation_id: { type: 'string' },
            user_id: { type: 'string' },
            request_id: { type: 'string' },
            debug: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Validate request body with Zod
      const parseResult = searchNormalizationRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        const errors = parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        logger.warn({ errors }, 'Request validation failed');

        return reply.status(400).send({
          error: 'Invalid request',
          details: errors,
        });
      }

      const validatedRequest: SearchNormalizationRequest = parseResult.data;

      try {
        const result = await service.normalize(validatedRequest);
        return reply.status(200).send(result.response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage, request_id: validatedRequest.request_id }, 'Unexpected error in normalization');

        return reply.status(500).send({
          error: 'Internal server error',
          message: 'An unexpected error occurred',
        });
      }
    }
  );
}

