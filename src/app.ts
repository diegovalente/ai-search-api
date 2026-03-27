import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, envSources } from './config/env.js';
import { logger } from './utils/logger.js';
import { registerSearchNormalizationRoutes } from './routes/searchNormalization.js';
import type { QueryNormalizerModel } from './llm/QueryNormalizerModel.js';
import { LocalQueryNormalizer } from './llm/providers/localQueryNormalizer.js';
import { GroqQueryNormalizer } from './llm/providers/groqQueryNormalizer.js';
import { MockQueryNormalizer } from './llm/providers/mockQueryNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppOptions {
  useMockProvider?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our own logger
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Serve static files (Test UI)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // Request logging
  app.addHook('onRequest', async (request) => {
    logger.info(
      {
        method: request.method,
        url: request.url,
        request_id: request.id,
      },
      'Incoming request'
    );
  });

  // Response logging
  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        method: request.method,
        url: request.url,
        status_code: reply.statusCode,
        response_time_ms: reply.elapsedTime,
        request_id: request.id,
      },
      'Request completed'
    );
  });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness check endpoint
  app.get('/ready', async () => {
    // In production, this could check LLM connectivity
    return { status: 'ready', timestamp: new Date().toISOString() };
  });

  // Select LLM provider based on config
  let model: QueryNormalizerModel;
  const provider = options.useMockProvider ? 'mock' : config.LLM_PROVIDER;

  switch (provider) {
    case 'groq':
      if (!config.GROQ_API_KEY) {
        logger.error('GROQ_API_KEY is required when using Groq provider');
        throw new Error('GROQ_API_KEY is required');
      }
      logger.info({
        provider_source: envSources.LLM_PROVIDER,
        model: config.GROQ_MODEL,
        model_source: envSources.GROQ_MODEL,
      }, 'Using Groq LLM provider');
      model = new GroqQueryNormalizer();
      break;

    case 'local':
      logger.info({
        base_url: config.LOCAL_LLM_BASE_URL,
        base_url_source: envSources.LOCAL_LLM_BASE_URL,
        model: config.LOCAL_LLM_MODEL,
        model_source: envSources.LOCAL_LLM_MODEL,
        provider_source: envSources.LLM_PROVIDER,
      }, 'Using local LLM provider (Ollama/vLLM)');
      model = new LocalQueryNormalizer();
      break;

    case 'mock':
    default:
      logger.info('Using mock LLM provider');
      model = new MockQueryNormalizer();
      break;
  }

  // Register routes
  registerSearchNormalizationRoutes(app, model);

  // Error handler
  app.setErrorHandler((error: Error & { validation?: unknown }, request, reply) => {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        request_id: request.id,
      },
      'Unhandled error'
    );

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.validation,
      });
    }

    return reply.status(500).send({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
    });
  });

  // Content type check
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  return app;
}

