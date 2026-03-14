import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
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

