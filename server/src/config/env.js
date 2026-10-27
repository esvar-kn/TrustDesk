// Loads and validates environment variables with Zod.
// Phase 1.0: only NODE_ENV and PORT are required to boot; secrets and provider
// keys are optional here and become required in the phases that use them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env first (the single file Docker Compose also uses), then
// a .env in the current working directory. dotenv does not override already-set
// vars, so real environment variables and the root file win over a local one.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config();

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database — wired into startup in Phase 1.1.
  MONGODB_URI: z
    .string()
    .default('mongodb://localhost:27017/trustdesk'),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('debug'),

  // CORS — used once the client talks to the API.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Auth — required from Phase 1.5 onward; optional now so the skeleton boots.
  AUTH_JWT_SECRET: z.string().min(1).optional(),
  AUTH_TOKEN_TTL: z.string().default('8h'),

  // Seeded demo user passwords — hashed with bcrypt at seed time, never stored plain.
  DEMO_AGENT_PASSWORD: z.string().optional(),
  DEMO_MANAGER_PASSWORD: z.string().optional(),

  // Seed source directory (the pack's data/). Resolved from the repo by default.
  DATA_DIR: z.string().optional(),

  // LLM provider — uniform across Anthropic, OpenAI, Google, and Groq.
  // Choose a provider + key; the base URL and SDK are derived from the provider
  // (see getProviderBaseUrl below), so switching providers is a two-line .env change.
  // Default `mock` keeps the server bootable with no key (Phases 1–2).
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'google', 'groq', 'mock']).default('mock'),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().optional(), // provider-specific id; required for non-mock at call time
  LLM_BASE_URL: z.string().url().optional(), // overrides the per-provider default below
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  // Prompt / eval settings (used from Phase 3).
  PROMPT_CANARY: z.string().default('trustdesk-canary'),
  PROMPT_VERSION: z.string().default('v1'),
  EVAL_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MOCK_DELAY_MS: z.coerce.number().int().min(0).default(0),
}).superRefine((val, ctx) => {
  // A real provider needs a key; mock needs nothing.
  if (val.LLM_PROVIDER !== 'mock' && !val.LLM_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['LLM_API_KEY'],
      message: `LLM_API_KEY is required when LLM_PROVIDER is "${val.LLM_PROVIDER}"`,
    });
  }
});

// Treat empty-string env vars (e.g. `LLM_BASE_URL=` in .env) as unset, so
// optionals and defaults apply instead of failing validation.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

const parsed = schema.safeParse(rawEnv);

if (!parsed.success) {
  // Fail fast with a readable message rather than a raw ZodError dump.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Per-provider defaults. OpenAI, Google, and Groq all speak the OpenAI-compatible
// chat-completions protocol (one adapter, different base URL); Anthropic uses its
// own SDK, so its base URL is the SDK default (null here). Consumed by the Phase 3
// LLM adapter; LLM_BASE_URL overrides the derived value.
const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  anthropic: null, // @anthropic-ai/sdk default (https://api.anthropic.com)
  mock: null,
};

// Providers reached through the shared OpenAI-compatible adapter vs. the native SDK.
export const OPENAI_COMPATIBLE_PROVIDERS = ['openai', 'google', 'groq'];

export function getProviderBaseUrl(provider = env.LLM_PROVIDER) {
  return env.LLM_BASE_URL ?? PROVIDER_BASE_URLS[provider] ?? null;
}
