import { z } from 'zod';

// Supported LLM providers
export const LLM_PROVIDERS = ['local', 'groq', 'mock'] as const;
export type LLMProvider = typeof LLM_PROVIDERS[number];

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // LLM Provider Selection
  // Options: 'local' (Ollama/vLLM), 'groq' (Groq cloud), 'mock' (for testing)
  LLM_PROVIDER: z.enum(LLM_PROVIDERS).default('local'),

  // Local LLM Provider (Ollama, vLLM, llama.cpp)
  LOCAL_LLM_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  LOCAL_LLM_MODEL: z.string().default('qwen2.5:7b'),
  LOCAL_LLM_API_KEY: z.string().default('not-needed'),

  // Groq Provider (https://console.groq.com for API key)
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // Shared LLM settings
  LLM_TIMEOUT_MS: z.string().default('30000').transform(Number),
  LLM_MAX_TOKENS: z.string().default('256').transform(Number),
  LLM_TEMPERATURE: z.string().default('0.1').transform(Number),

  // Debug/Logging controls
  ENABLE_DEBUG_RAW_MODEL_OUTPUT: z.string().default('false').transform((v) => v === 'true'),
  ENABLE_PROMPT_LOGGING: z.string().default('false').transform((v) => v === 'true'),
  ALLOW_USER_TEXT_LOGGING: z.string().default('false').transform((v) => v === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const config = loadEnv();

