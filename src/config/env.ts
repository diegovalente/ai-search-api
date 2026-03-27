import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
export type EnvKey = keyof z.input<typeof envSchema>;
export type EnvValueSource = 'process.env' | '.env' | 'default';

const ENV_KEYS = Object.keys(envSchema.shape) as EnvKey[];

function loadDotEnvFile(filePath = '.env'): Set<string> {
  const resolvedPath = resolve(process.cwd(), filePath);
  const loadedKeys = new Set<string>();

  if (!existsSync(resolvedPath)) {
    return loadedKeys;
  }

  const fileContents = readFileSync(resolvedPath, 'utf8');

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = normalizedLine.slice(separatorIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      const inlineCommentIndex = value.search(/\s#/);
      if (inlineCommentIndex !== -1) {
        value = value.slice(0, inlineCommentIndex).trim();
      }
    }

    process.env[key] = value;
    loadedKeys.add(key);
  }

  return loadedKeys;
}

function getEnvSource(key: string, originalEnvKeys: Set<string>, dotEnvKeys: Set<string>): EnvValueSource {
  if (originalEnvKeys.has(key)) {
    return 'process.env';
  }

  if (dotEnvKeys.has(key)) {
    return '.env';
  }

  return 'default';
}

function loadEnv(): { config: EnvConfig; sources: Record<EnvKey, EnvValueSource> } {
  const originalEnvKeys = new Set(Object.keys(process.env).filter((key) => process.env[key] !== undefined));
  const dotEnvKeys = loadDotEnvFile();

  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  const sources = Object.fromEntries(
    ENV_KEYS.map((key) => [key, getEnvSource(key, originalEnvKeys, dotEnvKeys)])
  ) as Record<EnvKey, EnvValueSource>;

  return {
    config: result.data,
    sources,
  };
}

const loadedEnv = loadEnv();

export const config = loadedEnv.config;
export const envSources = loadedEnv.sources;

