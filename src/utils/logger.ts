import pino from 'pino';
import { config } from '../config/env.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: config.ALLOW_USER_TEXT_LOGGING ? [] : ['user_request', 'search_term'],
});

export type Logger = typeof logger;

/**
 * Create a child logger with request context.
 */
export function createRequestLogger(context: {
  request_id?: string;
  conversation_id?: string;
}): pino.Logger {
  return logger.child(context);
}

