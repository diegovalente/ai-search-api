import { buildApp } from './app.js';
import { config, envSources } from './config/env.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info({
      port: config.PORT,
      port_source: envSources.PORT,
      env: config.NODE_ENV,
      env_source: envSources.NODE_ENV,
      llm_provider: config.LLM_PROVIDER,
      llm_provider_source: envSources.LLM_PROVIDER,
      llm_base_url: config.LOCAL_LLM_BASE_URL,
      llm_base_url_source: envSources.LOCAL_LLM_BASE_URL,
      llm_model: config.LOCAL_LLM_MODEL,
      llm_model_source: envSources.LOCAL_LLM_MODEL,
    }, 'Resolved startup configuration');

    const app = await buildApp();

    await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        llm_base_url: config.LOCAL_LLM_BASE_URL,
        llm_model: config.LOCAL_LLM_MODEL,
      },
      `Server started on port ${config.PORT}`
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down server');
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();

