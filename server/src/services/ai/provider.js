// LLM provider factory. Every provider implements the same interface:
//
//   complete({ system, messages, schema, timeoutMs }) ->
//     { json, model, usage, latency_ms }
//
// `schema` is a Zod schema the returned `json` is guaranteed to satisfy. The
// mock is wired here in Phase 3.0; the OpenAI-compatible and Anthropic adapters
// are added in Phase 3.1 (the factory routes to them by LLM_PROVIDER).
import { env } from '../../config/env.js';
import { AppError } from '../../errors.js';
import { mockProvider } from './mockProvider.js';
import { openaiCompatibleProvider } from './openaiCompatible.js';
import { anthropicProvider } from './anthropic.js';

export function getProvider(name = env.LLM_PROVIDER) {
  switch (name) {
    case 'mock':
      return mockProvider;
    case 'openai':
    case 'google':
    case 'groq':
      return openaiCompatibleProvider;
    case 'anthropic':
      return anthropicProvider;
    default:
      throw new AppError('AI_PROVIDER_ERROR', `unknown LLM provider: ${name}`);
  }
}
